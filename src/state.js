import { getContext, setContext } from './context';
import EventListener from './listener';
import { isUndefined, isObject, isArray, isString, isFunction, hasOwnProperty } from './utils';

const proxyKey = Symbol('isProxy');

/**
 * State
 *
 * @param {object} target
 * @returns {Proxy}
 */
export function createState (target) {
  if (isUndefined(target)) target = {};
  if (target[proxyKey] || !isObject(target)) return target;
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
          return listener.on(prop, handler);
        };
      } else if (prop === '$$once') {
        return function (prop, handler) {
          return listener.once(prop, handler);
        };
      } else if (prop === '$$off') {
        return function (prop, handler) {
          return listener.off(prop, handler);
        };
      } else if (prop === '$$emit') {
        return function (event, ...args) {
          return listener.emit(event, ...args);
        };
      } else if (prop === '$$each' && isArray(obj)) {
        return function (fn, _this) {
          setContext(this, '$each', fn);
          return obj.map(fn, _this).filter(e => e);
        };
      } else if (isString(prop) && dollarRe.test(prop)) {
        prop = prop.slice(1);
        if (!isFunction(obj[prop])) {
          setContext(receiver, prop);
        }
      }
      return Reflect.get(obj, prop);
    },
    set: (obj, prop, value, receiver) => {
      if (isFunction(value)) {
        cleaner.emit(prop);
        value = setUpdater(receiver, prop, value, cleaner);
      } else if (isObject(obj[prop]) && obj[prop][proxyKey]) {
        cleaner.emit(prop);
      }
      if (isObject(value)) {
        value = createState(value);
        setNotifier(receiver, prop, value, cleaner);
      }
      const changed = (isArray(obj) && prop === 'length') || obj[prop] !== value;
      const clone = changed && deepClone(obj);
      const res = Reflect.set(obj, prop, value);
      if (!res) return false;
      if (changed) {
        const events = [prop];
        const typedEvent = hasOwnProperty(clone, prop) ? '#mod' : '#add';
        if (isArray(obj)) {
          if (!isNaN(prop)) events.push(typedEvent, '*');
        } else {
          events.push(typedEvent, '*');
        }
        const notify = async () => listener.emit(events, value, prop, clone);
        notify();
      }
      return true;
    },
    deleteProperty: (obj, prop) => {
      const clone = deepClone(obj);
      const res = Reflect.deleteProperty(obj, prop);
      if (!res) return false;
      cleaner.emit(prop);
      const events = [prop, '#del', '*'];
      const notify = async () => listener.emit(events, undefined, prop, clone);
      notify();
      return true;
    }
  };
  const state = new Proxy(target, handler);
  for (const key in target) {
    if (isFunction(target[key])) {
      target[key] = setUpdater(state, key, target[key], cleaner);
    }
    if (isObject(target[key])) {
      const value = createState(target[key]);
      target[key] = value;
      setNotifier(state, key, value, cleaner);
    }
  }
  return state;
}

function setUpdater (obj, prop, getter, cleaner) {
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
}

function setNotifier (obj, prop, val, cleaner) {
  if (!val[proxyKey]) return;
  const notifier = (...args) => {
    obj.$$emit(['*'], ...args);
  };
  val.$$on('*', notifier);
  cleaner.once(prop, () => val.$$off('*', notifier));
}

export function deepPatch (oldv, newv) {
  const isOldArray = isArray(oldv);
  for (const k in newv) {
    if (isObject(newv[k])) {
      if (isObject(oldv[k])) {
        deepPatch(oldv[k], newv[k]);
      } else {
        const obj = createState(isArray(newv[k]) ? [] : {});
        deepPatch(obj, newv[k]);
        if (isOldArray) oldv.splice(k, 1, obj);
        else oldv[k] = obj;
      }
    } else if (!isUndefined(newv[k])) {
      if (isOldArray) oldv.splice(k, 1, newv[k]);
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

export function isEqual (newv, oldv) {
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

export function deepDiff (newv, oldv) {
  if (isArray(newv)) {
    const add = [];
    const del = [];
    const mod = [];
    const _oldv = {};
    if (!isArray(oldv)) oldv = [];
    for (let i = 0; i < oldv.length; i++) {
      const item = oldv[i];
      if (!isObject(item)) continue;
      if (hasOwnProperty(item, 'id')) {
        _oldv[item.id] = item;
      } else {
        _oldv[i] = item;
      }
    }
    const _newv = {};
    for (let i = 0; i < newv.length; i++) {
      const item = newv[i];
      if (!isObject(item)) continue;
      let id;
      if (hasOwnProperty(item, 'id')) {
        id = item.id;
        _newv[id] = item;
      } else {
        id = i;
        _newv[id] = item;
      }
      if (hasOwnProperty(_oldv, id)) {
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
          if (!hasOwnProperty(item, k)) {
            obj[k] = null;
            changed = true;
          }
        }
        if (changed) mod.push(deepClone(obj));
      } else {
        add.push(deepClone(item));
      }
    }
    for (const k in _oldv) {
      const item = _oldv[k];
      if (!hasOwnProperty(_newv, k)) {
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
      if (!hasOwnProperty(newv, k)) {
        obj[k] = null;
        changed = true;
      }
    }
    return changed && obj;
  }
}

export function deepClone (obj) {
  if (!isObject(obj)) {
    return obj;
  }
  const clone = isArray(obj) ? [] : {};
  for (const k in obj) {
    clone[k] = deepClone(obj[k]);
  }
  return clone;
}
