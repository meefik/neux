import { isObject } from './utils.js';

const contextKey = Symbol('context');
const globalContext = {};

/**
 * Create a context object.
 *
 * @param {object} ctx Context object.
 * @returns {object} Context object.
 */
export function createContext(ctx) {
  return isObject(ctx) ? ctx : globalContext;
}

/**
 * Add reactive properties to a context object.
 *
 * @param {object} ctx Context object.
 * @param {object} obj Target object.
 * @param {string} prop Property name.
 * @param {*} value Property value.
 */
export function writeContext(ctx, obj, prop, value) {
  const store = ctx[contextKey];
  if (store) {
    const props = store.get(obj) || {};
    props[prop] = value || null;
    store.set(obj, props);
  }
}

/**
 * Get reactive properties from a context object.
 *
 * @param {object} ctx Context object.
 * @param {function} getter Getter function with reactive properties.
 * @param {function} handler Handler function with found properties.
 * @returns {*} Value returned by the getter function.
 */
export function readContext(ctx, getter, handler) {
  const store = new Map();
  const oldStore = ctx[contextKey];
  ctx[contextKey] = store;
  const val = getter();
  if (oldStore) ctx[contextKey] = oldStore;
  else delete ctx[contextKey];
  for (const kv of store) {
    const [obj, props] = kv;
    for (const prop in props) {
      handler(obj, prop, props[prop]);
    }
  }
  return val;
}
