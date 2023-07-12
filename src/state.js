import { getContext, setContext } from './context';
import EventListener from './listener';

const hasOwnProperty = Object.prototype.hasOwnProperty;
const proxyKey = Symbol('isProxy');

/**
 * State
 *
 * @param {object} target
 * @returns {Proxy}
 */
export function createState (target) {
  if (typeof target !== 'object') target = {};
  if (target === null || target[proxyKey] ||
    (target.constructor !== Object &&
    target.constructor !== Array)) return target;
  let syncer;
  const dollarRe = /^\$/;
  const listener = new EventListener();
  const cleaner = new EventListener();
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
        return function (prop, handler) {
          listener.on(prop, handler);
        };
      } else if (prop === '$$once') {
        return function (prop, handler) {
          listener.once(prop, handler);
        };
      } else if (prop === '$$off') {
        return function (prop, handler) {
          listener.off(prop, handler);
        };
      } else if (prop === '$$emit') {
        return function (key) {
          const clone = deepClone(obj);
          const value = obj[key];
          listener.emit([key], value, key, clone);
        };
      } else if (prop === '$$sync') {
        return async function (store, ...args) {
          if (typeof store === 'function') {
            let data = await store(deepClone(obj), null, ...args);
            deepPatch(this, data);
            syncer = async (...args) => {
              const changes = deepDiff(obj, data);
              data = await store(deepClone(obj), changes, ...args);
              deepPatch(this, data);
              return data;
            };
            return data;
          } else if (typeof store === 'object') {
            deepPatch(this, store);
            return this;
          } else if (typeof syncer === 'function') {
            return await syncer(...args);
          }
        };
      } else if (prop === '$$each' && Array.isArray(obj)) {
        return function (fn, _this) {
          setContext(this, '$each', fn);
          return obj.map(fn, _this).filter(e => e);
        };
      } else if (typeof prop === 'string' && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (typeof obj[prop] !== 'function') {
          setContext(receiver, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value, receiver) => {
      if (typeof value === 'function') {
        value = setUpdater(receiver, prop, value, cleaner);
      }
      if (typeof value === 'object') {
        value = createState(value);
      }
      const changed = (Array.isArray(obj) && prop === 'length') || obj[prop] !== value;
      const clone = changed && deepClone(obj);
      const res = Reflect.set(obj, prop, value);
      if (!res) return false;
      if (changed) {
        const events = [prop, hasOwnProperty.call(clone, prop) ? '#mod' : '#add'];
        listener.emit(events, value, prop, clone);
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const clone = deepClone(obj);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) return false;
      listener.emit(['#del'], undefined, prop, clone);
      listener.off(prop);
      cleaner.emit(prop);
      if (Array.isArray(clone[prop])) {
        syncer = null;
      }
      return true;
    }
  };
  const state = new Proxy(target, handler);
  for (const key in target) {
    if (typeof target[key] === 'function') {
      target[key] = setUpdater(state, key, target[key], cleaner);
    }
    if (typeof target[key] === 'object') {
      target[key] = createState(target[key]);
    }
  }
  return state;
}

function setUpdater (obj, prop, getter, cleaner) {
  cleaner.emit(prop);
  const updater = () => {
    obj[prop] = getter(obj, prop);
  };
  return getContext(
    () => getter(obj, prop),
    (_obj, _prop) => {
      _obj.$$on(_prop, updater);
      cleaner.once(prop, () => _obj.$$off(_prop, updater));
    }
  );
};

function deepPatch (oldv, newv) {
  if (oldv === newv || typeof newv !== 'object' || typeof oldv !== 'object') {
    return;
  }
  const isArray = Array.isArray(oldv);
  for (const k in newv) {
    if (newv[k] !== null && typeof newv[k] === 'object') {
      if (typeof oldv[k] !== 'object') {
        const obj = createState(Array.isArray(newv[k]) ? [] : {});
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

function isEqual (newv, oldv) {
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

function deepDiff (newv, oldv) {
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

function deepClone (obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const clone = Array.isArray(obj) ? [] : {};
  for (const k in obj) {
    clone[k] = deepClone(obj[k]);
  }
  return clone;
}
