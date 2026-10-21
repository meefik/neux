/**
 * Reactive state management via signals and effects.
 *
 * Wraps plain objects in a Proxy that tracks property reads inside
 * effect callbacks and schedules re-runs on writes. Supports
 * isolated contexts, untracked reads, and async getters.
 *
 * @module signal
 */

import { getOrCreate, hasOwn, report } from "./helpers.js";

/** Internal runtime state used for tracking active effects per context. */
interface Runtime {
  /** The effect whose getter is running; unset inside `untrack()`, a signal write, or an effect setter, so reads there are not tracked. */
  active?: Effect | null;
  /** Keys written since the last trigger, per object; unset when no trigger is scheduled. */
  pending?: Map<Meta, Set<PropertyKey>> | null;
}

/** Context object that carries runtime metadata keyed by `RUNTIME_KEY`. */
type Context = Record<PropertyKey, Runtime>;

/** The effects subscribed to each key of an object. */
type Deps = Map<PropertyKey, Set<Effect>>;

/** A reactive effect function that carries its subscriptions. */
type Effect = (() => void) & {
  subs: Set<[Deps, PropertyKey]>;
  /** Creation order; an effect is always created after the one whose run created it. */
  id: number;
};

/** Reactive state of a wrapped object. */
interface Meta {
  /** The context whose effects track the object. */
  ctx: Context;
  deps: Deps;
  /** The one proxy of the object. */
  proxy: Record<PropertyKey, unknown>;
  /** Methods bound to the proxy, per key, until the key is written. */
  methods?: Map<PropertyKey, unknown>;
}

const META = new WeakMap<object, Meta>();
const RUNTIME_KEY: unique symbol = Symbol();
/** Key that a proxy answers with its object, so a proxy is stored and wrapped as its object. */
const RAW_KEY: unique symbol = Symbol();
/** Dependency key for the set of an object's own keys. */
const ITERATE: unique symbol = Symbol();
const GLOBAL: Context = {};
let nextEffectId = 0;

/** Checks whether a function is a class, which is stored as is: binding would lose its identity and statics. */
function isClass(fn: unknown): boolean {
  return /^class[\s{]/.test(Function.prototype.toString.call(fn));
}

/** Registers the current active effect as a subscriber of `key` of the object. */
function track(meta: Meta, key: PropertyKey): void {
  const active = meta.ctx[RUNTIME_KEY]?.active;
  if (!active) return;
  const subs = getOrCreate(meta.deps, key, () => new Set<Effect>());
  // Record the subscription once per run; a repeated read adds nothing.
  if (subs.has(active)) return;
  subs.add(active);
  active.subs.add([meta.deps, key]);
}

/** Queues `key` of the object for the context's next trigger, one timer per context. */
function schedule(meta: Meta, key: PropertyKey): void {
  const runtime = meta.ctx[RUNTIME_KEY];
  // A key nothing subscribes to has no effect to re-run; one that subscribes
  // later reads the written value.
  if (!runtime || !meta.deps.has(key)) return;
  if (!runtime.pending) {
    runtime.pending = new Map();
    setTimeout(trigger, 0, runtime);
  }
  getOrCreate(runtime.pending, meta, () => new Set<PropertyKey>()).add(key);
}

/** Runs each effect subscribed to a written key once, however many keys it reads. */
function trigger(runtime: Runtime): void {
  const batch = runtime.pending!;
  // Writes made while the effects run start the next batch.
  runtime.pending = null;
  const effects = new Set<Effect>();
  for (const [meta, keys] of batch) {
    for (const key of keys) {
      for (const eff of meta.deps.get(key) ?? []) effects.add(eff);
    }
  }
  // Creation order runs an outer effect before the ones it created, so it can
  // dispose them before they re-run against state they no longer fit.
  for (const eff of [...effects].sort((a, b) => a.id - b.id)) {
    try {
      eff();
    } catch (e) {
      unsubscribe(eff);
      report(e);
    }
  }
}

/**
 * Resolves the context for a `this` value. Module namespace objects (from
 * `import * as neux` or the UMD global, called as `neux.signal()`) are not
 * contexts and resolve to the global one.
 */
function getContext(thisArg: Record<PropertyKey, any> | void): Context {
  return thisArg && thisArg[Symbol.toStringTag] !== "Module" ? thisArg : GLOBAL;
}

/** Returns the runtime of the context for `thisArg`, creating it on first use. */
function getRuntime(thisArg: Record<PropertyKey, any> | void): Runtime {
  return (getContext(thisArg)[RUNTIME_KEY] ||= {});
}

/** Unsubscribes an effect from all tracked properties, dropping keys left without subscribers. */
function unsubscribe(eff: Effect): void {
  for (const [deps, key] of eff.subs) {
    // A key's set is only dropped once empty, so it still holds the effect.
    const subs = deps.get(key)!;
    subs.delete(eff);
    if (!subs.size) deps.delete(key);
  }
  eff.subs.clear();
}

/**
 * Wraps `data` in a reactive Proxy, or returns its existing proxy; a proxy is
 * returned as is. Nested plain objects and arrays are wrapped on first read,
 * and methods are bound to the proxy and cached until the property is written.
 */
function wrap(
  data: Record<PropertyKey, unknown>,
  ctx: Record<PropertyKey, any>,
): Record<PropertyKey, unknown> {
  if (data[RAW_KEY]) return data;
  const known = META.get(data);
  if (known) return known.proxy;
  const meta = { ctx, deps: new Map() } as Meta;
  META.set(data, meta);

  function flush(prop: PropertyKey): void {
    meta.methods?.delete(prop);
    schedule(meta, prop);
  }

  meta.proxy = new Proxy(data, {
    get(obj, prop, recv) {
      if (prop === RAW_KEY) return obj;
      track(meta, prop);
      const val = Reflect.get(obj, prop, recv);
      const isFn = typeof val === "function";
      // Checked by prototype, so a plain object with its own `constructor` key is wrapped too.
      const proto =
        typeof val === "object" && val && Object.getPrototypeOf(val);
      // A getter computes its value on every read, so it is never cached or wrapped.
      if (
        (isFn || proto === Object.prototype || proto === Array.prototype) &&
        !Object.getOwnPropertyDescriptor(obj, prop)?.get
      ) {
        if (!isFn) return wrap(val as Record<PropertyKey, unknown>, ctx);
        return getOrCreate((meta.methods ||= new Map()), prop, () =>
          isClass(val)
            ? val
            : (val as (...args: unknown[]) => unknown).bind(recv),
        );
      }
      return val;
    },

    has(obj, prop) {
      track(meta, prop);
      return Reflect.has(obj, prop);
    },

    ownKeys(obj) {
      track(meta, ITERATE);
      return Reflect.ownKeys(obj);
    },

    set(obj, prop, value, recv) {
      // A proxy is stored as its object, so the data stays plain and reads back
      // as the same proxy; a setter still gets the proxy, so its writes are reactive.
      const val = Object.getOwnPropertyDescriptor(obj, prop)?.set
        ? value
        : (value?.[RAW_KEY] ?? value);
      // Reads made by a getter or setter do not subscribe the writing effect.
      const runtime = ctx[RUNTIME_KEY];
      const active = runtime?.active;
      if (active) runtime.active = null;
      const isArray = Array.isArray(obj);
      const oldLength = isArray ? obj.length : 0;
      let had: boolean;
      let old: unknown;
      let ok: boolean;
      try {
        had = hasOwn(obj, prop);
        old = (obj as Record<PropertyKey, unknown>)[prop];
        ok = Reflect.set(obj, prop, val, recv);
      } finally {
        if (active) runtime.active = active;
      }
      // A rejected write (e.g. to a getter-only property) changes nothing.
      if (ok) {
        const length = prop === "length" && isArray;
        if (length || !had || !Object.is(old, val)) flush(prop);
        if (!had) flush(ITERATE);
        // An index written past the end grows the array without a `length` write.
        if (isArray && !length && obj.length !== oldLength) flush("length");
        // A shorter array drops its tail: notify readers of the dropped indices and of the keys.
        if (length && (val as number) < (old as number)) {
          for (const k of meta.deps.keys()) {
            if (
              typeof k === "string" &&
              String(+k) === k &&
              +k >= (val as number)
            )
              flush(k);
          }
          flush(ITERATE);
        }
      }
      return ok;
    },

    deleteProperty(obj, prop) {
      const had = hasOwn(obj, prop);
      const ok = Reflect.deleteProperty(obj, prop);
      if (ok && had) {
        flush(prop);
        flush(ITERATE);
      }
      return ok;
    },
  });
  return meta.proxy;
}

/**
 * Creates a reactive proxy around the given data object.
 *
 * Property reads inside an active {@link effect} are automatically tracked.
 * Nested plain objects and arrays are wrapped too; class instances, `Map`,
 * `Set`, `Date`, and objects with a null prototype are returned as is and are
 * not reactive.
 * An object always reads as the same proxy, wherever it is reached from, so
 * `state.selected = state.items[0]` keeps `state.selected === state.items[0]`;
 * a proxy is stored as its plain object. Wrapping an object a second time, or
 * passing a signal to `signal()`, returns the existing proxy and its context.
 * Assigning a smaller `length` to an array re-runs the effects that read
 * `length`, a dropped index, or the keys.
 * Methods are returned bound to the proxy (cached, so a method reads as the
 * same function each time, but not as the original); classes are returned as is.
 * Reading a read-only, non-configurable property (such as one of a frozen
 * object) that holds a nested object, array, or method throws a `TypeError`;
 * keep frozen data outside the signal.
 * Writes and deletions schedule one batched re-run per tick of the dependent
 * effects: an effect re-runs once, however many of its properties changed.
 *
 * @typeParam T The initial data type. Defaults to a plain object.
 * @this {object} Reactive context; defaults to the shared global context when
 *     called without an explicit receiver. To isolate signals, bind or call with
 *     a custom object: `signal.call(myCtx, data)`.
 * @param data The initial data. Defaults to an empty plain object.
 * @returns A reactive Proxy that mirrors `data`, preserving array vs object shape.
 *
 * @category Signal
 *
 * @example
 * ```ts
 * // creates a reactive signal
 * const state = signal({
 *   // reactive field
 *   page: 1,
 *   // computed reactive field
 *   get left() {
 *     return 100 - this.page;
 *   },
 *   // non-reactive methods
 *   nextPost() {
 *     if (this.page < 100) this.page++;
 *   },
 *   prevPost() {
 *     if (this.page > 0) this.page--;
 *   },
 *   async fetchPost() {
 *     const response = await fetch(
 *       `https://jsonplaceholder.typicode.com/posts/${this.page}`,
 *     );
 *     return await response.json();
 *   },
 * });
 * ```
 */
export function signal<
  T extends Record<PropertyKey, any> = Record<PropertyKey, any>,
>(this: object | void, data: T = {} as T): T {
  return wrap(data, getContext(this)) as T;
}

/**
 * Runs a function without tracking property accesses.
 *
 * Reads performed inside the callback will not subscribe the current
 * {@link effect} to the accessed properties. Useful for breaking cycles
 * or performing intentional non-reactive reads.
 *
 * The context is determined by `this`, following the same rules as
 * {@link signal}.
 *
 * @typeParam T The type of the returned value.
 * @this {object} Reactive context; defaults to the shared global context.
 * @param fn The function to run outside the tracking system.
 * @returns The value returned by `fn`.
 *
 * @category Signal
 *
 * @example
 * ```ts
 * const state = signal({ count: 0, label: "Count" });
 * const dispose = effect(() => {
 *   // reads `label` without subscribing
 *   const label = untrack(() => state.label);
 *   console.log(`${label}: ${state.count}`);
 * });
 * // does not trigger the effect
 * state.label = "Total";
 * // triggers the effect
 * state.count += 1;
 * // later …
 * dispose();
 * ```
 */
export function untrack<T = any>(this: object | void, fn: () => T): T {
  const runtime = getRuntime(this);
  const prev = runtime.active;
  runtime.active = null;
  try {
    return fn();
  } finally {
    runtime.active = prev;
  }
}

/**
 * Creates a reactive effect that re-runs whenever tracked properties change.
 *
 * The `getter` function is executed immediately. Any property read on a
 * signal during this execution is subscribed to the effect. When a
 * subscribed property is written, the effect is scheduled to re-run
 * (batched via `setTimeout(…, 0)`: one re-run per effect, however many of its
 * properties were written in the meantime).
 *
 * An optional `setter` receives the return value of `getter`. When the
 * getter returns a `Promise`, `setter` is called with its resolved value,
 * unless the effect re-ran or was disposed in the meantime.
 *
 * An error thrown by `getter` on the first run propagates to the caller and
 * leaves the effect disposed. On a later run it unsubscribes the effect
 * permanently, and an error thrown by `setter` is kept from stopping the
 * effect; both are reported through `reportError` (or `console.error` where it
 * is unavailable) rather than thrown, so other effects of the same update still
 * run. A promise that rejects is reported the same way, unless the effect re-ran
 * or was disposed in the meantime, and the effect keeps running.
 *
 * The context is determined by `this`, following the same rules as
 * {@link signal}.
 *
 * @this {object} Reactive context; defaults to the shared global context.
 * @param getter Function that reads reactive properties and optionally returns a value.
 * @param setter Optional callback that receives the return value of `getter`, or its resolved value when getter returns a promise.
 * @returns A disposal function that unsubscribes the effect from all tracked properties.
 *
 * @category Signal
 *
 * @example
 * ```ts
 * // creates a reactive signal
 * const state = signal({ count: 0 });
 * // subscribes to changes
 * const dispose = effect(() => {
 *   // read with subscription
 *   console.log(state.count);
 * });
 * // triggers the effect
 * state.count += 1;
 * // later …
 * dispose();
 * ```
 */
export function effect(
  this: object | void,
  getter: () => any | Promise<any>,
  setter?: (value: any) => void,
): () => void {
  const runtime = getRuntime(this);
  let run = 0;
  let disposed = false;

  const set = (v: any) => {
    try {
      setter?.(v);
    } catch (e) {
      report(e);
    }
  };

  const eff: Effect = () => {
    // A disposed effect can still be queued in a trigger's snapshot; it must not re-subscribe.
    if (disposed) return;
    const id = ++run;
    // An effect created inside another effect's getter, `untrack()`, or a
    // signal setter tracks its own reads, then restores the caller's tracking.
    const outer = runtime.active;
    unsubscribe(eff);
    runtime.active = eff;
    try {
      const value = getter();
      runtime.active = null;
      // A pending promise is dropped once the effect re-runs or is disposed.
      // A rejection is reported, and the effect keeps running.
      if (value instanceof Promise)
        value.then(
          (v) => !disposed && id === run && set(v),
          (e) => !disposed && id === run && report(e),
        );
      else if (setter) set(value);
    } finally {
      runtime.active = outer;
    }
  };
  const dispose = () => {
    disposed = true;
    unsubscribe(eff);
  };
  eff.subs = new Set();
  eff.id = nextEffectId++;
  try {
    eff();
  } catch (e) {
    // The caller gets no disposer, so a failed first run must not stay subscribed.
    dispose();
    throw e;
  }
  return dispose;
}
