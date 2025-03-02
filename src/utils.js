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

export function isDate(obj) {
  return obj instanceof Date;
}

export function clone(obj) {
  if (!isObject(obj)) {
    return obj;
  }
  const res = isArray(obj) ? [] : {};
  for (const k in obj) {
    res[k] = clone(obj[k]);
  }
  return res;
}
