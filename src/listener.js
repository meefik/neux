export default class EventListener {
  constructor() {
    this._listeners = {};
    this._once = {};
  }
  on(prop, handler) {
    if (prop && handler) {
      const listeners = this._listeners;
      if (!listeners[prop]) {
        listeners[prop] = new Set();
      }
      listeners[prop].add(handler);
    }
  }
  once(prop, handler) {
    if (prop && handler) {
      this.on(prop, handler);
      this._once[prop] = true;
    }
  }
  off(prop, handler) {
    const listeners = this._listeners;
    const once = this._once;
    if (listeners[prop]) {
      if (handler) {
        listeners[prop].delete(handler);
      } else {
        listeners[prop].clear();
        delete listeners[prop];
        delete once[prop];
      }
    }
  }
  emit(ev, value, prop, obj) {
    const listeners = this._listeners;
    const once = this._once;
    ['*'].concat(ev).forEach(e => {
      if (listeners[e]) {
        for (const fn of listeners[e]) {
          fn(value, prop, obj);
        }
        if (once[prop]) {
          this.off(prop);
        }
      }
    });
  }
}
