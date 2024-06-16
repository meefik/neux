export function isUndefined(obj) {
  return typeof obj === 'undefined';
}

export function isFunction(obj) {
  return typeof obj === 'function';
}

export function isString(obj) {
  return typeof obj === 'string';
}

export function isNumber(obj) {
  return typeof obj === 'number';
}

export function isArray(obj) {
  return Array.isArray(obj);
}

export function isObject(obj) {
  return typeof obj === 'object' && obj !== null
    && (obj.constructor === Object || obj.constructor === Array);
}
