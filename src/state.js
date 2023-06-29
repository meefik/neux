import { getContext, setContext, hasContext, skipContext } from './context';

const hasOwnProperty = Object.prototype.hasOwnProperty;
const proxyKey = Symbol();

/**
 * State
 * 
 * @param {object} target
 * @returns {Proxy}
 */
export function createState(target) {
  if (typeof target !== 'object') target = {};
  if (target === null || target[proxyKey]) return target;
  let updater;
  const listeners = {};
  const cleaners = {};
  const setUpdater = (obj, prop, getter) => {
    if (cleaners[prop]) {
      for (const fn of cleaners[prop]) fn();
    }
    cleaners[prop] = [];
    const updater = () => {
      obj[prop] = getter(obj, prop);
    };
    return getContext(
      () => getter(obj, prop),
      (_obj, _prop) => {
        _obj.$on(_prop, updater);
        cleaners[prop].push(() => _obj.$off(_prop, updater));
      }
    );
  };
  const dispatchEvent = (ev, value, prop, obj) => {
    [].concat(ev).forEach(e => {
      if (listeners[e]) {
        for (const fn of listeners[e]) {
          fn(value, prop, obj);
        }
      }
    });
  };
  const handler = {
    get: (obj, prop, receiver) => {
      if (prop === proxyKey) {
        return true;
      }
      if (prop === '$on') {
        return function $on(prop, handler) {
          if (prop && handler) {
            if (!listeners[prop]) listeners[prop] = new Set();
            listeners[prop].add(handler);
          }
        };
      }
      if (prop === '$off') {
        return function $off(prop, handler) {
          if (listeners[prop]) {
            if (handler) listeners[prop].delete(handler);
            else listeners[prop].clear();
          }
        };
      }
      if (prop === '$clone') {
        return function $clone() {
          return deepClone(target);
        };
      }
      if (prop === '$sync') {
        return async function $sync(store, ...args) {
          if (typeof store === 'function') {
            let data = await store(deepClone(target), null, ...args);
            deepPatch(this, data);
            updater = async (...args) => {
              const changes = deepDiff(target, data);
              data = await store(deepClone(target), changes, ...args);
              deepPatch(this, data);
              return data;
            };
            return data;
          } else if (typeof store === 'object') {
            deepPatch(this, store);
            return this;
          } else if (typeof updater === 'function') {
            return await updater(...args);
          }
        };
      }
      if (prop === '$each') {
        return function $each(fn, _this) {
          if (hasContext()) setContext(this, '$each', fn);
          return obj.map(fn, _this).filter(e => e);
        };
      }
      if (hasContext()) {
        if (typeof obj[prop] === 'function' && !hasOwnProperty.call(obj, prop)) {
          const fn = obj[prop];
          return function (...args) {
            setContext(receiver, '#');
            return skipContext(() => fn.apply(obj, args));
          };
        } else {
          setContext(receiver, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value, receiver) => {
      if (typeof value === 'function') {
        if (value.name !== '$raw') {
          return Reflect.set(obj, prop, value);
        }
        value = setUpdater(receiver, prop, value);
      }
      if (typeof value === 'object') {
        value = createState(value);
        if (Array.isArray(obj)) {
          const handler = () => {
            const clone = deepClone(target);
            dispatchEvent([prop, '*', '#'], value, prop, clone);
          };
          value.$on('*', handler);
          if (!cleaners[prop]) cleaners[prop] = [];
          cleaners[prop].push(() => value.$off('*', handler));
        }
      }
      const clone = deepClone(obj);
      const changed = (Array.isArray(obj) && prop === 'length') || obj[prop] !== value;
      const res = Reflect.set(obj, prop, value);
      if (!res) return false;
      if (changed) {
        const events = hasOwnProperty.call(clone, prop)
          ? [prop, '#mod', '*']
          : [prop, '#add', '*', '#'];
        dispatchEvent(events, value, prop, clone);
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const clone = deepClone(obj);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) return false;
      dispatchEvent(['#del', '*', '#'], undefined, prop, clone);
      if (listeners[prop]) {
        delete listeners[prop];
      }
      if (cleaners[prop]) {
        for (const fn of cleaners[prop]) fn();
        delete cleaners[prop];
      }
      if (Array.isArray(clone[prop])) {
        updater = null;
      }
      return true;
    },
  };
  const state = new Proxy(target, handler);
  for (const key in target) {
    if (typeof target[key] === 'function') {
      target[key] = setUpdater(state, key, target[key]);
    }
    if (typeof target[key] === 'object') {
      const obj = createState(target[key]);
      target[key] = obj;
      if (Array.isArray(target)) {
        const handler = () => {
          const clone = deepClone(target);
          dispatchEvent([key, '*', '#'], obj, key, clone);
        };
        obj.$on('*', handler);
        if (!cleaners[key]) cleaners[key] = [];
        cleaners[key].push(() => obj.$off('*', handler));
      }
    }
  }
  return state;
}

function deepPatch(oldv, newv) {
  if (oldv === newv || typeof newv !== 'object' || typeof oldv !== 'object') {
    return;
  }
  const isArray = Array.isArray(oldv);
  for (const k in newv) {
    if (newv[k] !== null && typeof newv[k] === 'object') {
      if (typeof oldv[k] !== 'object') {
        const obj = Array.isArray(newv[k]) ? [] : {};
        deepPatch(obj, newv[k]);
        if (isArray) oldv.splice(k, 1, obj);
        else oldv[k] = obj;
      }
    } else {
      if (isArray) oldv.splice(k, 1, newv[k]);
      else oldv[k] = newv[k];
    }
  }
  if (isArray) {
    const count = oldv.length - newv.length;
    if (count > 0) {
      oldv.splice(newv.length, count);
    }
  } else {
    for (const k in oldv) {
      if (!hasOwnProperty.call(newv, k)) {
        delete oldv[k];
      }
    }
  }
}

function isEqual(newv, oldv) {
  if (typeof newv === 'object' && typeof oldv === 'object') {
    for (const k in oldv) {
      if (!hasOwnProperty.call(newv, k)) {
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

function deepDiff(newv, oldv) {
  if (oldv === newv || typeof newv !== 'object' || typeof oldv !== 'object') {
    return false;
  }
  if (Array.isArray(newv)) {
    const add = [];
    const del = [];
    const mod = [];
    const _oldv = {};
    for (const k in oldv) {
      const item = oldv[k];
      if (typeof item !== 'object') continue;
      if (hasOwnProperty.call(item, 'id')) {
        _oldv[item.id] = item;
      }
    }
    const _newv = {};
    for (const k in newv) {
      const item = newv[k];
      if (typeof item !== 'object') continue;
      if (hasOwnProperty.call(item, 'id')) {
        const id = item.id;
        _newv[id] = item;
        if (hasOwnProperty.call(_oldv, id)) {
          const _item = _oldv[id];
          const obj = { id };
          let changed;
          for (const k in item) {
            if (!isEqual(item[k], _item[k])) {
              obj[k] = item[k];
              changed = true;
            }
          }
          for (const k in _item) {
            if (!hasOwnProperty.call(item, k)) {
              obj[k] = null;
              changed = true;
            }
          }
          if (changed) mod.push(deepClone(obj));
        } else {
          add.push(deepClone(item));
        }
      } else {
        add.push(deepClone(item));
      }
    }
    for (const k in _oldv) {
      const item = _oldv[k];
      if (!hasOwnProperty.call(_newv, k)) {
        del.push(deepClone(item));
      }
    }
    const changed = add.length > 0 || mod.length > 0 || del.length > 0;
    return changed && { add, mod, del };
  } else {
    const obj = {};
    let changed = false;
    for (const k in newv) {
      if (!isEqual(newv[k], oldv[k])) {
        obj[k] = newv[k];
        changed = true;
      }
    }
    for (const k in oldv) {
      if (!hasOwnProperty.call(newv, k)) {
        obj[k] = null;
        changed = true;
      }
    }
    return changed && obj;
  }
}

function deepClone(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const clone = Array.isArray(obj) ? [] : {};
  for (const k in obj) {
    clone[k] = deepClone(obj[k]);
  }
  return clone;
}
