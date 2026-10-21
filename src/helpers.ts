// Internal utilities shared by the signal, render, and i18n modules.

/**
 * Key of the function that re-runs an effect, set on the disposer that
 * `effect()` returns. Re-running keeps the effect's creation order, which a
 * replacement effect would lose.
 *
 * @internal
 */
export const RUN: unique symbol = Symbol();

/**
 * Reports an error without throwing, so the caller keeps running: through
 * `reportError` where available (so it reaches `window.onerror`), otherwise to
 * the console.
 *
 * @internal
 */
export function report(error: unknown): void {
  (globalThis.reportError || console.error)(error);
}

/**
 * Checks whether `obj` has `key` as an own property, safely for objects with
 * a null prototype or an overridden `hasOwnProperty`.
 *
 * @internal
 */
export function hasOwn(obj: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Returns the entry for `key`, creating and storing it with `create` when missing.
 *
 * @internal
 */
export function getOrCreate<K, V>(
  map: { get(key: K): V | undefined; set(key: K, value: V): unknown },
  key: K,
  create: () => V,
): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = create()));
  return value;
}
