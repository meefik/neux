import { isUndefined, isArray, isFunction, isObject, isString } from './utils.js';
import { createContext, readContext, writeContext } from './context.js';
import EventListener from './listener.js';

const signalKey = Symbol('signal');

/**
 * Check if a property is a reactive property.
 *
 * @param {string} prop Property name.
 * @returns {Array} Array with event name and clean property name.
 */
function parsePropery(prop) {
  let level = 0;
  if (isString(prop)) {
    while (prop.startsWith('$')) {
      prop = prop.slice(1);
      level++;
    }
  }
  const event = (prop || (level > 1 ? '*' : '#'));
  return [level > 0 && event, prop];
};

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
  return readContext(ctx, getter, (obj, key) => {
    const handler = () => {
      state[prop] = getter();
    };
    obj.$$on(key, handler);
    cleaner.once(prop, () => obj.$$off(key, handler));
  });
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
      state.$$emit('*', newv, oldv, key, obj, [...rest, prop]);
    };
    child.$$on('*', handler);
    cleaner.once(prop, () => child.$$off('*', handler));
  }
}

/**
 * Create an effect.
 *
 * @param {function} getter Getter function.
 * @param {function} [setter] Setter function.
 * @returns {function} Dispose function.
 */
export function effect(getter, setter) {
  const context = createContext(this);
  const getValue = isFunction(getter) ? getter.bind(context) : () => getter;
  const setValue = setter ? setter.bind(context) : () => {};
  const cleanups = [];
  const value = readContext(context, getValue, (obj, prop, value) => {
    const getItemValue = prop === '#' && isFunction(value) ? value.bind(context) : null;
    const handler = getItemValue
      ? (newv, oldv, idx, arr) => {
          const index = +idx;
          const value = isUndefined(newv) ? newv : getItemValue(newv, index, arr);
          setter(value, index, arr);
        }
      : () => {
          const value = getValue();
          setValue(value);
        };
    obj.$$on(prop, handler);
    cleanups.push(() => obj.$$off(prop, handler));
  });
  setValue(value);
  const dispose = () => {
    for (const fn of cleanups) fn();
  };
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
    $$on(event, handler) {
      return listener.on(event, handler);
    },
    $$once(event, handler) {
      return listener.once(event, handler);
    },
    $$off(event, handler) {
      return listener.off(event, handler);
    },
    $$emit(event, ...args) {
      return listener.emit(event, ...args);
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
      const [event, cleanProp] = parsePropery(prop);
      if (event) {
        if (cleanProp === 'map' && isArray(obj)) {
          return (fn, thisArg = context) => {
            writeContext(context, state, '#', fn.bind(thisArg));
            return state.map(fn, thisArg);
          };
        }
        writeContext(context, state, event);
        if (!cleanProp) return state;
      }
      return Reflect.get(obj, cleanProp);
    },
    set: (obj, prop, value) => {
      const [event] = parsePropery(prop);
      if (event) return false;
      const oldv = obj[prop];
      if (isFunction(value)) {
        const getter = value;
        value = setUpdater(context, state, prop, getter, updater);
      }
      if (isObject(value)) {
        value = signal.call(context, value);
        setWatcher(state, prop, value, watcher);
      }
      const isLengthProp = prop === 'length' && isArray(obj);
      const changed = obj[prop] !== value || isLengthProp;
      const res = Reflect.set(obj, prop, value);
      if (!res) {
        return false;
      }
      if (changed) {
        listener.emit(isLengthProp ? prop : [prop, '#', '*'], value, oldv, prop, state);
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const [event] = parsePropery(prop);
      if (event) return false;
      const oldv = obj[prop];
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) {
        return false;
      }
      watcher.emit(prop);
      updater.emit(prop);
      listener.emit([prop, '#', '*'], undefined, oldv, prop, state);
      return true;
    },
  };
  const state = new Proxy(data, handler);
  for (let prop in data) {
    const [event] = parsePropery(prop);
    if (event) continue;
    if (isFunction(data[prop])) {
      const getter = data[prop];
      data[prop] = setUpdater(context, state, prop, getter, updater);
    }
    if (isObject(data[prop])) {
      const value = signal.call(context, data[prop]);
      data[prop] = value;
      setWatcher(state, prop, value, watcher);
    }
  }
  return state;
}
