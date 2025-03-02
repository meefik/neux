import { isObject } from './utils';

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
 * @param {function} [value] Additional parameter.
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
 * @returns {*}
 */
export function readContext(ctx, getter, handler) {
  if (ctx[contextKey]) {
    throw Error('Collision in signal binding');
  }
  const store = new Map();
  ctx[contextKey] = store;
  const val = getter();
  delete ctx[contextKey];
  for (const kv of store) {
    const [obj, props] = kv;
    for (const prop in props) {
      handler(obj, prop, props[prop]);
    }
  }
  return val;
}
