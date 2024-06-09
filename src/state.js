import {
  isArray,
  isFunction,
  isObject,
  isString,
  isUndefined
} from './utils';
import EventListener from './listener';

const stateKey = Symbol('state');
const contextKey = Symbol('context');
const dollarRe = /^\$([^$]|$)/u;
const defaultContext = {};

function setContext (context, obj, prop, fn) {
  const ctx = context[contextKey];
  if (ctx) {
    const props = ctx.get(obj) || {};
    props[prop] = fn || null;
    ctx.set(obj, props);
  }
}

function getContext (context, getter, setter) {
  if (context[contextKey]) {
    throw Error('Collision in state binding');
  }
  const ctx = new Map();
  context[contextKey] = ctx;
  const val = getter();
  delete context[contextKey];
  for (const kv of ctx) {
    const [obj, props] = kv;
    for (const prop in props) {
      setter(obj, prop, props[prop]);
    }
  }
  return val;
}

function setWatcher (context, state, prop, getter, cleaner) {
  cleaner.emit(prop);
  return getContext(
    context,
    () => getter.call(context, state, prop),
    (obj, key, callbackFn) => {
      const handler = callbackFn
        ? (newv, oldv, idx, arr) => {
          const target = state[prop];
          const index = parseInt(idx, 10);
          if (isUndefined(newv)) {
            // Remove
            target.splice(index, 1);
          } else if (isUndefined(oldv)) {
            // Add
            const value = callbackFn.call(context, newv, index, arr);
            target[index] = value;
          } else {
            // Replace
            const value = callbackFn.call(context, newv, index, arr);
            target.splice(index, 1, value);
          }
        }
        : () => {
          const newv = getter.call(context, state, prop);
          state[prop] = newv;
        };
      obj.$$on(key, handler);
      cleaner.once(prop, () => obj.$$off(key, handler));
    }
  );
}

function setUpdater (state, prop, sub, cleaner) {
  cleaner.emit(prop);
  if (sub[stateKey]) {
    const handler = (newv, oldv, key, obj, rest = []) => {
      state.$$emit([prop, '*'], newv, oldv, key, obj, [...rest, prop]);
    };
    sub.$$on('*', handler);
    cleaner.once(prop, () => sub.$$off('*', handler));
  }
}

function deepClone (obj) {
  if (!isObject(obj)) {
    return obj;
  }
  const clone = isArray(obj) ? [] : {};
  for (const k in obj) {
    clone[k] = deepClone(obj[k]);
  }
  return clone;
}

function deepPatch (newv, oldv, options) {
  const isOldArray = isArray(oldv);
  for (const k in newv) {
    if (isObject(newv[k])) {
      if (isObject(oldv[k])) {
        deepPatch(newv[k], oldv[k], options);
      } else {
        const obj = createState(isArray(newv[k]) ? [] : {}, options);
        deepPatch(newv[k], obj, options);
        if (isOldArray) {
          oldv.splice(parseInt(k, 10), 1, obj);
        } else {
          oldv[k] = obj;
        }
      }
    } else if (!isUndefined(newv[k])) {
      if (isOldArray) {
        oldv.splice(parseInt(k, 10), 1, newv[k]);
      } else {
        oldv[k] = newv[k];
      }
    }
  }
  if (isOldArray) {
    const newvLength = isArray(newv) ? newv.length : 0;
    const count = oldv.length - newvLength;
    if (count > 0) {
      oldv.splice(newvLength, count);
    }
  } else {
    for (const k in oldv) {
      if (!newv || isUndefined(newv[k])) {
        delete oldv[k];
      }
    }
  }
}

function isEqual (newv, oldv) {
  if (isObject(newv) && isObject(oldv)) {
    for (const k in oldv) {
      if (isUndefined(newv[k])) {
        return false;
      }
    }
    for (const k in newv) {
      if (!isEqual(newv[k], oldv[k])) {
        return false;
      }
    }
  } else if (newv !== oldv) {
    return false;
  }
  return true;
}

function isEqualFilter (obj, filter) {
  let found = true;
  for (const key in filter) {
    if (obj[key] !== filter[key]) {
      found = false;
      break;
    }
  }
  return found;
}

function query (obj, filter) {
  if (isEqualFilter(obj, filter)) {
    return obj;
  }
  for (const key in obj) {
    const val = obj[key];
    if (isObject(val)) {
      const res = query(val, filter);
      if (!isUndefined(res)) {
        return res;
      }
    }
  }
}

function queryAll (obj, filter, res = []) {
  if (isEqualFilter(obj, filter)) {
    res.push(obj);
  }
  for (const key in obj) {
    const val = obj[key];
    if (isObject(val)) {
      queryAll(val, filter, res);
    }
  }
  return res;
}

/**
 * Create a state.
 *
 * @param {object} [data]
 * @param {object} [options]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createState (data, options) {
  if (isUndefined(data)) {
    data = {};
  } else if (!isObject(data) || data[stateKey]) {
    return data;
  }
  const { context = defaultContext } = options || {};
  const listener = new EventListener(context);
  const watcher = new EventListener();
  const updater = new EventListener();
  const handler = {
    get: (obj, prop) => {
      if (prop === stateKey) {
        return true;
      }
      if (isString(prop) && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (!isFunction(obj[prop])) {
          setContext(context, state, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value) => {
      if (isString(prop) && dollarRe.test(prop)) {
        const propName = prop.slice(1) || '*';
        if (isFunction(value)) {
          listener.on(propName, value);
        }
        return true;
      }
      const oldv = deepClone(obj[prop]);
      if (isFunction(value)) {
        const getter = value;
        value = setWatcher(context, state, prop, getter, watcher);
      }
      if (isObject(value)) {
        value = createState(value, options);
        setUpdater(state, prop, value, updater);
      }
      const changed = obj[prop] !== value || (prop === 'length' && isArray(obj));
      const res = Reflect.set(obj, prop, value);
      if (!res) {
        return false;
      }
      if (changed) {
        const events = [prop];
        if (!isArray(obj) || !isNaN(prop)) {
          events.push('*');
        }
        if (isArray(obj) && !isNaN(prop)) {
          events.push('#');
        }
        listener.emit(events, value, oldv, prop, state);
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      if (isString(prop) && dollarRe.test(prop)) {
        const propName = prop.slice(1) || '*';
        listener.off(propName);
        return true;
      }
      const oldv = deepClone(obj[prop]);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) {
        return false;
      }
      watcher.emit(prop);
      updater.emit(prop);
      const events = [prop];
      if (!isArray(obj) || !isNaN(prop)) {
        events.push('*');
      }
      if (isArray(obj) && !isNaN(prop)) {
        events.push('#');
      }
      listener.emit(events, undefined, oldv, prop, state);
      return true;
    }
  };
  const state = new Proxy(data, handler);
  const opts = { configurable: false, enumerable: false, writable: false };
  Object.defineProperties(state, {
    $$: {
      ...opts,
      value (key) {
        return state['$' + key];
      }
    },
    $$on: {
      ...opts,
      value (...args) {
        return listener.on(...args);
      }
    },
    $$once: {
      ...opts,
      value (...args) {
        return listener.once(...args);
      }
    },
    $$off: {
      ...opts,
      value (...args) {
        return listener.off(...args);
      }
    },
    $$emit: {
      ...opts,
      value (...args) {
        return listener.emit(...args);
      }
    },
    $$query: {
      ...opts,
      value (filter) {
        return query(state, filter);
      }
    },
    $$queryAll: {
      ...opts,
      value (filter) {
        return queryAll(state, filter);
      }
    },
    $$create: {
      ...opts,
      value (data) {
        return createState(data, options);
      }
    },
    $$clone: {
      ...opts,
      value (oldv = state) {
        return deepClone(oldv);
      }
    },
    $$equal: {
      ...opts,
      value (newv, oldv = state) {
        return isEqual(newv, oldv);
      }
    },
    $$patch: {
      ...opts,
      value (newv, oldv = state) {
        return deepPatch(newv, oldv, options);
      }
    },
    $$each: {
      ...opts,
      value (callbackFn, thisArg) {
        if (isArray(state)) {
          if (isFunction(callbackFn)) {
            setContext(context, state, '#', callbackFn.bind(thisArg));
          }
          return state.map(callbackFn, thisArg).filter((item) => item);
        }
      }
    }
  });
  for (const prop in data) {
    if (isFunction(data[prop])) {
      const getter = data[prop];
      if (isString(prop) && dollarRe.test(prop)) {
        const propName = prop.slice(1) || '*';
        listener.on(propName, getter);
        delete data[prop];
      } else {
        const value = setWatcher(context, state, prop, getter, watcher);
        data[prop] = value;
      }
    }
    if (isObject(data[prop])) {
      const value = createState(data[prop], options);
      data[prop] = value;
      setUpdater(state, prop, value, updater);
    }
  }
  return state;
}
