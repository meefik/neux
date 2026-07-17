/** Internal runtime state used for tracking active effects per context. */
interface Runtime {
  active: Effect | null;
  syncing: boolean;
  inactive: boolean;
}

/** Context object that carries runtime metadata keyed by `runtimeKey`. */
type Context = Record<PropertyKey, Runtime>;

/** A reactive effect function that carries a subscription set. */
type Effect = (() => void) & { subs: Set<[object, PropertyKey]> };

const targetMap = new WeakMap<
  object,
  { ctx: Context; deps: Map<PropertyKey, Set<Effect>> }
>();
const runtimeKey: unique symbol = Symbol();
const GLOBAL: Context = {};

/** Registers the current active effect as a subscriber of `target[key]`. */
function track(target: object, key: PropertyKey): void {
  const entry = targetMap.get(target);
  const runtime = entry?.ctx?.[runtimeKey];
  if (!entry || !runtime?.active || runtime.syncing || runtime.inactive) return;
  let subs = entry.deps.get(key);
  if (!subs) entry.deps.set(key, (subs = new Set()));
  subs.add(runtime.active);
  runtime.active.subs.add([target, key]);
}

/** Schedules notified effects for `target[key]` to run. */
function trigger(target: object, key: PropertyKey): void {
  const entry = targetMap.get(target);
  const subs = entry?.deps?.get(key);
  const runtime = entry?.ctx?.[runtimeKey];
  if (!subs || !runtime || runtime.syncing) return;
  runtime.syncing = true;
  for (const eff of [...subs]) {
    try {
      eff();
    } catch {
      unsubscribe(eff);
    }
  }
  runtime.syncing = false;
}

/** Lazily ensures a runtime exists on the given context. */
function getRuntime(thisArg: Record<PropertyKey, any> | void): Runtime {
  const ctx = thisArg || GLOBAL;
  if (!ctx[runtimeKey]) {
    ctx[runtimeKey] = { active: null, syncing: false, inactive: false };
  }
  return ctx[runtimeKey];
}

/** Unsubscribes an effect from all tracked properties. */
function unsubscribe(eff: Effect): void {
  for (const [target, key] of eff.subs) {
    targetMap.get(target)?.deps?.get(key)?.delete(eff);
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
  const timers = new Map<PropertyKey, ReturnType<typeof setTimeout>>();

  if (!targetMap.has(data)) targetMap.set(data, { ctx, deps: new Map() });

  function flush(obj: object, prop: PropertyKey): void {
    cache.get(obj)?.delete(prop);
    clearTimeout(timers.get(prop));
    timers.set(
      prop,
      setTimeout(() => {
        timers.delete(prop);
        trigger(obj, prop);
      }, 0),
    );
  }

  return new Proxy(data, {
    get(obj, prop, recv) {
      track(obj, prop);
      const val = Reflect.get(obj, prop, recv);
      let wrapped: unknown;
      if (typeof val === "function") {
        wrapped = (val as (...args: unknown[]) => unknown).bind(recv);
      } else if (
        typeof val === "object" &&
        val &&
        (val.constructor === Object || val.constructor === Array) &&
        !Object.getOwnPropertyDescriptor(obj, prop)?.get
      ) {
        wrapped = wrap(val as Record<PropertyKey, unknown>, cache, ctx);
      }
      if (wrapped !== undefined) {
        let propCache = cache.get(obj);
        if (!propCache) cache.set(obj, (propCache = new Map()));
        if (!propCache.has(prop)) propCache.set(prop, wrapped);
        return propCache.get(prop);
      }
      return val;
    },

    set(obj, prop, val, recv) {
      const runtime = targetMap.get(obj)?.ctx?.[runtimeKey];
      const prev = runtime?.syncing;
      if (runtime) runtime.syncing = true;
      const old = (obj as Record<PropertyKey, unknown>)[prop];
      const ok = Reflect.set(obj, prop, val, recv);
      if (runtime) runtime.syncing = prev!;
      if (old !== val || (prop === "length" && Array.isArray(obj))) {
        flush(obj, prop);
      }
      return ok;
    },

    deleteProperty(obj, prop) {
      const ok = Reflect.deleteProperty(obj, prop);
      if (ok) flush(obj, prop);
      return ok;
    },
  });
}

/**
 * Creates a reactive proxy around the given data object.
 *
 * Property reads inside an active {@link effect} are automatically tracked.
 * Writes and deletions schedule a debounced re-run of dependent effects.
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
export function signal<T extends Record<string, any> = Record<string, any>>(
  this: object | void,
  data: T = {} as T,
): T {
  return wrap(data, new WeakMap(), this || GLOBAL) as T;
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
 * const state = signal({ count: 0 });
 * // reads without subscribing
 * const dispose = effect(() => {
 *   untrack(() => {
 *     console.log(state.count);
 *   });
 * });
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
 * (debounced via `setTimeout 0`).
 *
 * An optional `setter` receives the return value of `getter`. When the
 * getter returns a `Promise`, `setter` is called with its resolved value.
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

  const eff: Effect = () => {
    let value: unknown;
    let threw = false;
    unsubscribe(eff);
    runtime.active = eff;
    runtime.syncing = false;
    try {
      value = getter();
    } catch (e) {
      threw = true;
      runtime.active = null;
      throw e;
    } finally {
      if (!threw) runtime.active = null;
    }
    if (setter) {
      const set = (v: any) => {
        try {
          setter(v);
        } catch {}
      };
      if (value instanceof Promise) value.then(set);
      else set(value);
    }
  };
  eff.subs = new Set();
  eff();
  return () => unsubscribe(eff);
}
