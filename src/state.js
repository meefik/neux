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
    get: (obj, prop) => {
      if (prop === proxyKey) {
        return true;
      }
      if (prop === '$') {
        return function (key) {
          return state['$' + key];
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
      } else if (prop === '$$clone') {
        return function (oldv = obj) {
          return deepClone(oldv);
        };
      } else if (prop === '$$equal') {
        return function (newv, oldv = obj) {
          return isEqual(newv, oldv);
        };
      } else if (prop === '$$patch') {
        return function (newv, oldv = state) {
          return deepPatch(context, newv, oldv);
        };
      } else if (prop === '$$each' && isArray(obj)) {
        return function (callbackFn, thisArg) {
          if (isFunction(callbackFn)) {
            setContext(context, state, '#', callbackFn.bind(thisArg));
          }
          return obj.map(callbackFn, thisArg).filter(item => item);
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
      const setter = !(isString(prop) && dollarRe.test(prop));
      if (isFunction(value)) {
        const getter = value;
        value = setWatcher(context, state, prop, getter, watcher);
      }
      if (setter && isObject(value)) {
        value = createState(value, context);
        setUpdater(state, prop, value, updater);
      }
      const changed = !setter || obj[prop] !== value || (prop === 'length' && isArray(obj));
      const res = setter ? Reflect.set(obj, prop, value) : true;
      if (!res) return false;
      if (changed) {
        const events = [prop, '*'];
        if (isArray(obj) && !isNaN(prop)) events.push('#');
        const emit = async () => {
          listener.emit(events, value, oldv, prop, state);
        };
        emit();
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const oldv = deepClone(obj[prop]);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) return false;
      watcher.emit(prop);
      updater.emit(prop);
      const events = [prop, '*'];
      if (isArray(obj) && !isNaN(prop)) events.push('#');
      const emit = async () => {
        listener.emit(events, undefined, oldv, prop, state);
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
      const setter = !(isString(prop) && dollarRe.test(prop));
      if (setter) {
        data[prop] = value;
      } else {
        delete data[prop];
      }
    }
    if (isObject(data[prop])) {
      const value = createState(data[prop], context);
      data[prop] = value;
      setUpdater(state, prop, value, updater);
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

function setWatcher (context, state, prop, getter, cleaner) {
  cleaner.emit(prop);
  return getContext(
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
          state.$$emit(`#${prop}`, newv, oldv, idx, arr);
        };
      } else {
        handler = () => {
          const newv = getter(state, prop);
          state[prop] = newv;
        };
      }
      obj.$$on(key, handler);
      cleaner.once(prop, () => obj.$$off(key, handler));
    }
  );
}

function setUpdater (state, prop, sub, cleaner) {
  cleaner.emit(prop);
  if (!sub[proxyKey]) return;
  const handler = (...args) => {
    state.$$emit([prop, '*'], ...args, prop);
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
