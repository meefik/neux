import { isArray, isFunction, isObject, isString, isUndefined, clone } from './utils';
import { createContext, readContext, writeContext } from './context';
import EventListener from './listener';

const signalKey = Symbol('signal');
const dollarRe = /^\$([^$]|$)/u;

/**
 * Set up an updater for a reactive state.
 *
 * @param {object} ctx Context object.
 * @param {object} state Reactive state.
 * @param {string} prop Property name.
 * @param {function} getter Getter function.
 * @param {EventListener} cleaner Event listener for cleanup.
 * @returns {*} Getter value.
 */
function setUpdater(ctx, state, prop, getter, cleaner) {
  cleaner.emit(prop);
  getter = getter.bind(ctx, state, prop);
  const handler = (obj, key, tpl) => {
    tpl = isFunction(tpl) ? tpl.bind(ctx) : null;
    const updater = tpl
      ? (newv, oldv, idx, arr) => {
          const target = state[prop];
          const index = parseInt(idx, 10);
          if (isUndefined(newv)) {
            // Remove
            target.splice(index, 1);
          }
          else if (isUndefined(oldv)) {
            // Add
            const value = tpl(newv, index, arr);
            target[index] = value;
          }
          else {
            // Replace
            const value = tpl(newv, index, arr);
            target.splice(index, 1, value);
          }
        }
      : () => {
          state[prop] = getter();
        };
    obj.$$on(key, updater);
    cleaner.on(prop, () => obj.$$off(key, updater), true);
  };
  return readContext(ctx, getter, handler);
}

/**
 * Set a watcher for a reactive state.
 *
 * @param {object} state Reactive state.
 * @param {string} prop Property name.
 * @param {object} child Child reactive state.
 * @param {EventListener} cleaner Event listener for cleanup.
 */
function setWatcher(state, prop, child, cleaner) {
  cleaner.emit(prop);
  if (child[signalKey]) {
    const handler = (newv, oldv, key, obj, rest = []) => {
      state.$$emit([prop, '*'], newv, oldv, key, obj, [...rest, prop]);
    };
    child.$$on('*', handler);
    cleaner.on(prop, () => child.$$off('*', handler), true);
  }
}

/**
 * Create an effect.
 *
 * @param {function} getter Getter function.
 * @param {function} [setter] Setter function.
 * @param {function} [cleanup] Auto dispose after calls if returns true.
 * @returns {function} Dispose function.
 */
export function effect(getter, setter, cleanup) {
  const context = createContext(this);
  getter = getter.bind(context);
  setter = setter ? setter.bind(context) : () => {};
  const cleanups = [];
  const dispose = () => {
    for (const fn of cleanups) fn();
  };
  const value = readContext(context, getter, (obj, prop, tpl) => {
    tpl = isFunction(tpl) ? tpl.bind(context) : null;
    const handler = tpl
      ? (newv, oldv, idx, arr) => {
          const index = +idx;
          if (isUndefined(newv)) {
            setter(undefined, index, 'del');
          }
          else if (isUndefined(oldv)) {
            const value = tpl(newv, index, arr);
            setter(value, index, 'add');
          }
          else {
            const value = tpl(newv, index, arr);
            setter(value, index, 'upd');
          }
        }
      : (...args) => {
          setter(getter(...args));
        };
    obj.$$on(prop, handler, cleanup);
    cleanups.push(() => obj.$$off(prop, handler));
  });
  setter(value);
  return dispose;
}

/**
 * Create a reactive state.
 *
 * @param {object} [data] Initial data.
 * @returns {Proxy}
 */
export function signal(data = {}) {
  if (!isObject(data) || data[signalKey]) {
    return data;
  }
  const context = createContext(this);
  const listener = new EventListener(context);
  const watcher = new EventListener();
  const updater = new EventListener();
  const tools = {
    $(key) {
      return state['$' + key];
    },
    $$on(event, handler) {
      return listener.on(event, handler);
    },
    $$once(event, handler) {
      return listener.on(event, handler, true);
    },
    $$off(event, handler) {
      return listener.off(event, handler);
    },
    $$emit(event, ...args) {
      return listener.emit(event, ...args);
    },
    $$map(callbackFn, thisArg = context) {
      if (isArray(state)) {
        if (isFunction(callbackFn)) {
          writeContext(context, state, '#', callbackFn.bind(thisArg));
        }
        return state.map(callbackFn, thisArg);
      }
    },
  };
  const handler = {
    get: (obj, prop) => {
      if (prop === signalKey) {
        return true;
      }
      if (prop in tools) {
        return tools[prop];
      }
      if (isString(prop) && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (!isFunction(obj[prop])) {
          writeContext(context, state, prop);
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
      const oldv = clone(obj[prop]);
      if (isFunction(value)) {
        const getter = value;
        value = setUpdater(context, state, prop, getter, updater);
      }
      if (isObject(value)) {
        value = signal.call(context, value);
        setWatcher(state, prop, value, watcher);
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
      const oldv = clone(obj[prop]);
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
    },
  };
  const state = new Proxy(data, handler);
  for (const prop in data) {
    if (isFunction(data[prop])) {
      const getter = data[prop];
      if (isString(prop) && dollarRe.test(prop)) {
        const propName = prop.slice(1) || '*';
        listener.on(propName, getter);
        delete data[prop];
      }
      else {
        data[prop] = setUpdater(context, state, prop, getter, updater);
      }
    }
    if (isObject(data[prop])) {
      const value = signal.call(context, data[prop]);
      data[prop] = value;
      setWatcher(state, prop, value, watcher);
    }
  }
  return state;
}
