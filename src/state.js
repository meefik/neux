import EventListener from './listener';
import {
  isUndefined,
  isObject,
  isArray,
  isString,
  isFunction,
  hasOwnProperty
} from './utils';

const proxyKey = Symbol('isProxy');
const dollarRe = /^\$/;
const defaultContext = {};

/**
 * Create a state.
 *
 * @param {object} [data]
 * @param {object} [context]
 * @returns {Proxy}
 */
export function createState (data, context = defaultContext) {
  if (isUndefined(data)) data = {};
  else if (!isObject(data) || data[proxyKey]) return data;
  const listener = new EventListener();
  const watcher = new EventListener();
  const updater = new EventListener();
  const handler = {
    get: (obj, prop, receiver) => {
      if (prop === proxyKey) {
        return true;
      }
      if (prop === '$') {
        return function (key) {
          return receiver['$' + key];
        };
      } else if (prop === '$$on') {
        return function (...args) {
          return listener.on(...args);
        };
      } else if (prop === '$$once') {
        return function (...args) {
          return listener.once(...args);
        };
      } else if (prop === '$$off') {
        return function (...args) {
          return listener.off(...args);
        };
      } else if (prop === '$$emit') {
        return function (...args) {
          return listener.emit(...args);
        };
      } else if (prop === '$$watch') {
        return function (prop, getter, setter) {
          return setWatcher(context, receiver, prop, getter, setter, watcher);
        };
      } else if (prop === '$$unwatch') {
        return function (prop = '*') {
          watcher.emit(prop);
        };
      } else if (prop === '$$clone') {
        return function (oldv = obj) {
          return deepClone(oldv);
        };
      } else if (prop === '$$equal') {
        return function (newv, oldv = obj) {
          return isEqual(newv, oldv);
        };
      } else if (prop === '$$patch') {
        return function (newv, oldv = receiver) {
          return deepPatch(context, newv, oldv);
        };
      } else if (prop === '$$each' && isArray(obj)) {
        return function (callbackFn, thisArg) {
          if (isFunction(callbackFn)) {
            setContext(context, receiver, '#', callbackFn);
          }
          return obj.map(callbackFn, thisArg).filter(item => item);
        };
      } else if (isString(prop) && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (!isFunction(obj[prop])) {
          setContext(context, receiver, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value, receiver) => {
      const oldv = deepClone(obj[prop]);
      if (isFunction(value)) {
        const getter = value;
        const setter = (newv) => newv;
        value = setWatcher(context, receiver, prop, getter, setter, watcher);
      }
      if (isObject(value)) {
        value = createState(value, context);
        setUpdater(receiver, prop, value, updater);
      }
      const changed = (isArray(obj) && prop === 'length') || obj[prop] !== value;
      const res = Reflect.set(obj, prop, value);
      if (!res) return false;
      if (changed) {
        const events = [prop, '*'];
        if (isArray(obj) && !isNaN(prop)) events.push('#');
        const emit = async () => {
          listener.emit(events, value, oldv, prop, receiver);
        };
        emit();
      }
      return true;
    },
    deleteProperty: (obj, prop, receiver) => {
      const oldv = deepClone(obj[prop]);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) return false;
      watcher.emit(prop);
      updater.emit(prop);
      const events = [prop, '*'];
      if (isArray(obj) && !isNaN(prop)) events.push('#');
      const emit = async () => {
        listener.emit(events, undefined, oldv, prop, receiver);
      };
      emit();
      return true;
    }
  };
  const state = new Proxy(data, handler);
  for (const key in data) {
    if (isFunction(data[key])) {
      const getter = data[key];
      const setter = (newv) => newv;
      data[key] = setWatcher(context, state, key, getter, setter, watcher);
    }
    if (isObject(data[key])) {
      const value = createState(data[key], context);
      data[key] = value;
      setUpdater(state, key, value, updater);
    }
  }
  return state;
}

function setContext (context, obj, prop, fn) {
  const ctx = context.value;
  if (!ctx) return;
  const props = ctx.get(obj) || {};
  props[prop] = fn || null;
  ctx.set(obj, props);
}

function getContext (context, getter, setter) {
  if (context.value) throw Error('Collision in state binding');
  const ctx = (context.value = new Map());
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

function setWatcher (context, state, prop, getter, setter, cleaner) {
  let data = getContext(
    context,
    () => getter(state, prop),
    (obj, key, callbackFn) => {
      let handler;
      if (callbackFn) {
        handler = (newv, oldv, idx, arr) => {
          if (isNaN(idx)) return;
          idx = parseInt(idx);
          if (!isUndefined(oldv)) {
            oldv = callbackFn(oldv, idx, arr);
          }
          if (!isUndefined(newv)) {
            newv = callbackFn(newv, idx, arr);
          }
          if (isFunction(setter)) {
            const res = setter(newv, oldv, idx, arr);
            if (!isUndefined(res)) state[prop] = arr;
          } else {
            state.$$emit(prop, newv, oldv, idx, arr);
          }
        };
      } else {
        handler = () => {
          const newv = getter(state, prop);
          if (isFunction(setter)) {
            const res = setter(newv, data, prop, state);
            if (!isUndefined(res)) state[prop] = res;
          } else {
            state.$$emit(prop, newv, data, prop, state);
          }
          data = newv;
        };
      }
      obj.$$on(key, handler);
      cleaner.once(prop, () => obj.$$off(key, handler));
    }
  );
  return data;
}

function setUpdater (state, prop, sub, cleaner) {
  cleaner.emit(prop);
  if (!sub[proxyKey]) return;
  const handler = (...args) => {
    state.$$emit(['*'], ...args, prop);
  };
  sub.$$on('*', handler);
  cleaner.once(prop, () => sub.$$off('*', handler));
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

function deepPatch (context, newv, oldv) {
  const isOldArray = isArray(oldv);
  for (const k in newv) {
    if (isObject(newv[k])) {
      if (isObject(oldv[k])) {
        deepPatch(context, newv[k], oldv[k]);
      } else {
        const obj = createState(isArray(newv[k]) ? [] : {}, context);
        deepPatch(context, newv[k], obj);
        if (isOldArray) oldv.splice(parseInt(k), 1, obj);
        else oldv[k] = obj;
      }
    } else if (!isUndefined(newv[k])) {
      if (isOldArray) oldv.splice(parseInt(k), 1, newv[k]);
      else oldv[k] = newv[k];
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
      if (!hasOwnProperty(newv, k)) {
        delete oldv[k];
      }
    }
  }
}

function isEqual (newv, oldv) {
  if (isObject(newv) && isObject(oldv)) {
    for (const k in oldv) {
      if (!hasOwnProperty(newv, k)) {
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
