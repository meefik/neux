let context;

/**
 * Get data rendering functions from the current context.
 * 
 * @param {function} getter 
 * @param {function} handler 
 * @returns {*}
 */
export function getContext(getter, handler) {
  if (context) throw Error('Collision in state binding');
  const _context = (context = new Map());
  const val = getter();
  context = null;
  for (const kv of _context) {
    const [obj, props] = kv;
    for (const prop in props) {
      handler(obj, prop, props[prop]);
    }
  }
  return val;
}

/**
 * Add a data rendering function for the current context.
 * 
 * @param {object} obj 
 * @param {string} prop 
 * @param {function} fn 
 */
export function setContext(obj, prop, fn) {
  const props = context.get(obj) || {};
  props[prop] = fn || null;
  context.set(obj, props);
}

/**
 * Check if the context exists.
 * 
 * @returns {boolean}
 */
export function hasContext() {
  return !!context;
}

/**
 * Run the function without setting the context.
 * 
 * @param {function} next 
 * @returns {*}
 */
export function skipContext(next) {
  const _context = context;
  context = null;
  const res = next();
  context = _context;
  return res;
}
