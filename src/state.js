import {
  isArray,
  isFunction,
  isObject,
  isString,
  isUndefined
} from './utils';
import EventListener from './listener';

const proxyKey = Symbol('isProxy');
const dollarRe = /^\$/u;
const defaultContext = {};

function setContext (context, obj, prop, fn) {
  const ctx = context.value;
  if (ctx) {
    const props = ctx.get(obj) || {};
    props[prop] = fn || null;
    ctx.set(obj, props);
  }
}

function getContext (context, getter, setter) {
  if (context.value) {
    throw Error('Collision in state binding');
  }
  const ctx = new Map();
  context.value = ctx;
  const val = getter();
  delete context.value;
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
    () => getter(state, prop),
    (obj, key, callbackFn) => {
      const handler = callbackFn
        ? (newv, oldv, idx, arr) => {
          if (!isNaN(idx)) {
            idx = parseInt(idx, 10);
            if (!isUndefined(oldv)) {
              oldv = callbackFn(oldv, idx, arr);
            }
            if (!isUndefined(newv)) {
              newv = callbackFn(newv, idx, arr);
            }
            state.$$emit(`#${prop}`, newv, oldv, idx, arr);
          }
        }
        : () => {
          const newv = getter(state, prop);
          state[prop] = newv;
        };
      obj.$$on(key, handler);
      cleaner.once(prop, () => obj.$$off(key, handler));
    }
  );
}

function setUpdater (state, prop, sub, cleaner) {
  cleaner.emit(prop);
  if (sub[proxyKey]) {
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
  } else if (!isObject(data) || data[proxyKey]) {
    return data;
  }
  const { context = defaultContext } = options || {};
  const listener = new EventListener();
  const watcher = new EventListener();
  const updater = new EventListener();
  const handler = {
    get: (obj, prop) => {
      if (prop === proxyKey) {
        return true;
      }
      if (prop === '$') {
        return function $ (key) {
          return state[`$${key}`];
        };
      } else if (prop === '$$on') {
        return function $on (...args) {
          return listener.on(...args);
        };
      } else if (prop === '$$once') {
        return function $$once (...args) {
          return listener.once(...args);
        };
      } else if (prop === '$$off') {
        return function $$off (...args) {
          return listener.off(...args);
        };
      } else if (prop === '$$emit') {
        return function $$emit (...args) {
          return listener.emit(...args);
        };
      } else if (prop === '$$clone') {
        return function $$clone (oldv = obj) {
          return deepClone(oldv);
        };
      } else if (prop === '$$equal') {
        return function $$equal (newv, oldv = obj) {
          return isEqual(newv, oldv);
        };
      } else if (prop === '$$patch') {
        return function $$patch (newv, oldv = state) {
          return deepPatch(newv, oldv, options);
        };
      } else if (prop === '$$each' && isArray(obj)) {
        return function $$each (callbackFn, thisArg) {
          if (isFunction(callbackFn)) {
            setContext(context, state, '#', callbackFn.bind(thisArg));
          }
          return obj.map(callbackFn, thisArg).filter((item) => item);
        };
      } else if (isString(prop) && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (!isFunction(obj[prop])) {
          setContext(context, state, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value) => {
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
        const events = [prop, '*'];
        if (isArray(obj) && !isNaN(prop)) {
          events.push('#');
        }
        const emit = async () => {
          await listener.emit(events, value, oldv, prop, state);
        };
        emit();
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const oldv = deepClone(obj[prop]);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) {
        return false;
      }
      watcher.emit(prop);
      updater.emit(prop);
      const events = [prop, '*'];
      if (isArray(obj) && !isNaN(prop)) {
        events.push('#');
      }
      const emit = async () => {
        await listener.emit(events, undefined, oldv, prop, state);
      };
      emit();
      return true;
    }
  };
  const state = new Proxy(data, handler);
  for (const prop in data) {
    if (isFunction(data[prop])) {
      const getter = data[prop];
      const value = setWatcher(context, state, prop, getter, watcher);
      data[prop] = value;
    }
    if (isObject(data[prop])) {
      const value = createState(data[prop], options);
      data[prop] = value;
      setUpdater(state, prop, value, updater);
    }
  }
  return state;
}
