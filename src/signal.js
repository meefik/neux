import { isArray, isFunction, isObject, isString, clone } from './utils';
import { createContext, readContext, writeContext } from './context';
import EventListener from './listener';

const signalKey = Symbol('signal');

/**
 * Check if a property is a reactive property.
 *
 * @param {string} prop Property name.
 * @returns {Array} Array with level and clean property name.
 */
function parsePropery(prop) {
  let level = 0;
  if (isString(prop)) {
    while (prop.startsWith('$')) {
      prop = prop.slice(1);
      level++;
    }
  }
  return [prop, level];
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
    cleaner.on(prop, () => obj.$$off(key, handler), true);
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
  const value = readContext(context, getter, (obj, prop) => {
    const handler = (...args) => {
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
  const getTrackerKey = (prop, level) => (prop || (level > 1 ? '*' : '#'));
  const tools = {
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
  };
  const handler = {
    get: (obj, prop) => {
      if (prop === signalKey) {
        return true;
      }
      if (prop in tools) {
        return tools[prop];
      }
      const [cleanProp, level] = parsePropery(prop);
      if (level) {
        const key = getTrackerKey(cleanProp, level);
        writeContext(context, state, key);
        if (!cleanProp) return state;
      }
      return Reflect.get(obj, cleanProp);
    },
    set: (obj, prop, value) => {
      const [cleanProp, level] = parsePropery(prop);
      if (level) {
        const key = getTrackerKey(cleanProp, level);
        if (isFunction(value)) {
          listener.on(key, value);
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
      const isLengthProp = prop === 'length' && isArray(obj);
      const changed = obj[prop] !== value || isLengthProp;
      const res = Reflect.set(obj, prop, value);
      if (!res) {
        return false;
      }
      if (changed) {
        const events = isLengthProp ? [prop] : [prop, '#', '*'];
        listener.emit(events, value, oldv, prop, state);
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const [cleanProp, level] = parsePropery(prop);
      if (level) {
        const key = getTrackerKey(cleanProp, level);
        listener.off(key);
        return true;
      }
      const oldv = clone(obj[prop]);
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
    if (isFunction(data[prop])) {
      const getter = data[prop];
      const [cleanProp, level] = parsePropery(prop);
      if (level) {
        const key = getTrackerKey(cleanProp, level);
        listener.on(key, getter);
        continue;
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
