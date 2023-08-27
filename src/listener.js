/**
 * Event listener.
 */
export default class EventListener {
  _list = {};

  on (event, handler) {
    if (event && handler) {
      const list = this._list;
      const events = [].concat(event);
      for (const event of events) {
        if (!list[event]) {
          list[event] = new Map();
        }
        list[event].set(handler, false);
      }
    }
  }

  once (event, handler) {
    if (event && handler) {
      const list = this._list;
      const events = [].concat(event);
      for (const event of events) {
        if (!list[event]) {
          list[event] = new Map();
        }
        list[event].set(handler, true);
      }
    }
  }

  off (event, handler) {
    if (event) {
      const list = this._list;
      const events = [].concat(event);
      for (const event of events) {
        if (list[event]) {
          if (handler) {
            list[event].delete(handler);
            if (!list[event].size) {
              delete list[event];
            }
          } else {
            list[event].clear();
            delete list[event];
          }
        }
      }
    }
  }

  emit (event, ...args) {
    const list = this._list;
    if (event === '*') {
      for (const event in list) {
        for (const [fn, once] of list[event]) {
          fn(...args);
          if (once) this.off(event, fn);
        }
      }
    } else {
      const events = new Set([].concat(event));
      for (const event of events) {
        if (list[event]) {
          for (const [fn, once] of list[event]) {
            fn(...args);
            if (once) this.off(event, fn);
          }
        }
      }
    }
  }
}
