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
  active: Effect | null;
  syncing: boolean;
  inactive: boolean;
}

/** Context object that carries runtime metadata keyed by `RUNTIME_KEY`. */
type Context = Record<PropertyKey, Runtime>;

/** A reactive effect function that carries a subscription set. */
type Effect = (() => void) & { subs: Set<[object, PropertyKey]> };

const TARGET_MAP = new WeakMap<
  object,
  { ctx: Context; deps: Map<PropertyKey, Set<Effect>> }
>();
const RUNTIME_KEY: unique symbol = Symbol();
/** Dependency key for the set of an object's own keys. */
const ITERATE: unique symbol = Symbol();
const GLOBAL: Context = {};

/** Registers the current active effect as a subscriber of `target[key]`. */
function track(target: object, key: PropertyKey): void {
  const entry = TARGET_MAP.get(target);
  const runtime = entry?.ctx[RUNTIME_KEY];
  if (!entry || !runtime?.active || runtime.syncing || runtime.inactive) return;
  const subs = getOrCreate(entry.deps, key, () => new Set<Effect>());
  // Record the subscription once per run; a repeated read adds nothing.
  if (subs.has(runtime.active)) return;
  subs.add(runtime.active);
  runtime.active.subs.add([target, key]);
}

/** Keys written since the last run, per context, awaiting one batched trigger. */
const PENDING = new WeakMap<Context, Map<object, Set<PropertyKey>>>();

/** Queues `target[key]` for the context's next trigger, one timer per context. */
function schedule(ctx: Context, target: object, key: PropertyKey): void {
  let batch = PENDING.get(ctx);
  if (!batch) {
    PENDING.set(ctx, (batch = new Map()));
    setTimeout(trigger, 0, ctx, batch);
  }
  getOrCreate(batch, target, () => new Set<PropertyKey>()).add(key);
}

/** Runs each effect subscribed to a written key once, however many keys it reads. */
function trigger(ctx: Context, batch: Map<object, Set<PropertyKey>>): void {
  // Writes made while the effects run start the next batch.
  PENDING.delete(ctx);
  const runtime = ctx[RUNTIME_KEY];
  if (!runtime) return;
  const effects = new Set<Effect>();
  for (const [target, keys] of batch) {
    for (const key of keys) {
      for (const eff of TARGET_MAP.get(target)?.deps.get(key) ?? []) {
        effects.add(eff);
      }
    }
  }
  runtime.syncing = true;
  for (const eff of effects) {
    try {
      eff();
    } catch (e) {
      unsubscribe(eff);
      report(e);
    }
  }
  runtime.syncing = false;
}

/**
 * Resolves the context for a `this` value. Module namespace objects (from
 * `import * as neux` or the UMD global, called as `neux.signal()`) are not
 * contexts and resolve to the global one.
 */
function getContext(thisArg: Record<PropertyKey, any> | void): Context {
  return thisArg && thisArg[Symbol.toStringTag] !== "Module" ? thisArg : GLOBAL;
}

/** Lazily ensures a runtime exists on the given context. */
function getRuntime(thisArg: Record<PropertyKey, any> | void): Runtime {
  const ctx = getContext(thisArg);
  if (!ctx[RUNTIME_KEY]) {
    ctx[RUNTIME_KEY] = { active: null, syncing: false, inactive: false };
  }
  return ctx[RUNTIME_KEY];
}

/** Unsubscribes an effect from all tracked properties, dropping keys left without subscribers. */
function unsubscribe(eff: Effect): void {
  for (const [target, key] of eff.subs) {
    const deps = TARGET_MAP.get(target)?.deps;
    const subs = deps?.get(key);
    if (subs?.delete(eff) && !subs.size) deps!.delete(key);
  }
  eff.subs.clear();
}

/**
 * Wraps `data` in a reactive Proxy. Nested plain objects and arrays are
 * wrapped recursively.
 */
function wrap(
  data: Record<PropertyKey, unknown>,
  cache: WeakMap<object, Map<PropertyKey, unknown>>,
  ctx: Record<PropertyKey, any>,
): Record<PropertyKey, unknown> {
  if (!TARGET_MAP.has(data)) TARGET_MAP.set(data, { ctx, deps: new Map() });

  function flush(obj: object, prop: PropertyKey): void {
    cache.get(obj)?.delete(prop);
    schedule(TARGET_MAP.get(obj)!.ctx, obj, prop);
  }

  return new Proxy(data, {
    get(obj, prop, recv) {
      track(obj, prop);
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
        const propCache = getOrCreate(cache, obj, () => new Map());
        let wrapped = propCache.get(prop);
        if (wrapped === undefined) {
          wrapped = isFn
            ? (val as (...args: unknown[]) => unknown).bind(recv)
            : wrap(val as Record<PropertyKey, unknown>, cache, ctx);
          propCache.set(prop, wrapped);
        }
        return wrapped;
      }
      return val;
    },

    has(obj, prop) {
      track(obj, prop);
      return Reflect.has(obj, prop);
    },

    ownKeys(obj) {
      track(obj, ITERATE);
      return Reflect.ownKeys(obj);
    },

    set(obj, prop, val, recv) {
      const runtime = TARGET_MAP.get(obj)?.ctx[RUNTIME_KEY];
      const prev = runtime?.syncing;
      if (runtime) runtime.syncing = true;
      let had = false;
      let old: unknown;
      let ok = false;
      // A throwing getter or setter must not leave the context stuck in syncing.
      try {
        had = hasOwn(obj, prop);
        old = (obj as Record<PropertyKey, unknown>)[prop];
        ok = Reflect.set(obj, prop, val, recv);
      } finally {
        if (runtime) runtime.syncing = prev!;
      }
      // A rejected write (e.g. to a getter-only property) changes nothing.
      if (ok) {
        if (
          !Object.is(old, val) ||
          !had ||
          (prop === "length" && Array.isArray(obj))
        ) {
          flush(obj, prop);
        }
        if (!had) flush(obj, ITERATE);
      }
      return ok;
    },

    deleteProperty(obj, prop) {
      const had = hasOwn(obj, prop);
      const ok = Reflect.deleteProperty(obj, prop);
      if (ok && had) {
        flush(obj, prop);
        flush(obj, ITERATE);
      }
      return ok;
    },
  });
}

/**
 * Creates a reactive proxy around the given data object.
 *
 * Property reads inside an active {@link effect} are automatically tracked.
 * Nested plain objects and arrays are wrapped too; class instances, `Map`,
 * `Set`, `Date`, and objects with a null prototype are returned as is and are
 * not reactive.
 * Assigning a smaller `length` to an array re-runs only effects that read
 * `length`, not those that read a dropped index (`list[0]`) or the keys; use
 * `splice()`, `pop()`, or replace the array instead.
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
  return wrap(data, new WeakMap(), getContext(this)) as T;
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
  const prev = runtime.inactive;
  runtime.inactive = true;
  try {
    return fn();
  } finally {
    runtime.inactive = prev;
  }
}

/**
 * Creates a reactive effect that re-runs whenever tracked properties change.
 *
 * The `getter` function is executed immediately. Any property read on a
 * signal during this execution is subscribed to the effect. When a
 * subscribed property is written, the effect is scheduled to re-run
 * (batched via `setTimeout 0`: one re-run per effect, however many of its
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
    let value: unknown;
    const id = ++run;
    // An effect created inside another effect's getter must not end its tracking.
    const outer = runtime.active;
    // An effect created inside `untrack()` or a signal setter must still track
    // its own reads, and must leave the caller's reads untracked afterwards.
    const inactive = runtime.inactive;
    const syncing = runtime.syncing;
    unsubscribe(eff);
    runtime.active = eff;
    runtime.syncing = false;
    runtime.inactive = false;
    try {
      value = getter();
    } catch (e) {
      runtime.active = outer;
      throw e;
    } finally {
      runtime.inactive = inactive;
      runtime.syncing = syncing;
    }
    runtime.active = null;
    // A pending promise is dropped once the effect re-runs or is disposed.
    // A rejection is reported, and the effect keeps running.
    if (value instanceof Promise)
      value.then(
        (v) => !disposed && id === run && set(v),
        (e) => !disposed && id === run && report(e),
      );
    else if (setter) set(value);
    runtime.active = outer;
  };
  eff.subs = new Set();
  try {
    eff();
  } catch (e) {
    // The caller gets no disposer, so a failed first run must not stay subscribed.
    disposed = true;
    unsubscribe(eff);
    throw e;
  }
  return () => {
    disposed = true;
    unsubscribe(eff);
  };
}
