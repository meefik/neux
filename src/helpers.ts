/**
 * Reports an error without throwing, so the caller keeps running: through
 * `reportError` where available (so it reaches `window.onerror`), otherwise to
 * the console.
 *
 * @internal
 */
export function report(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}

/**
 * Reports whether `obj` has `key` as an own property, safely for objects with
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
