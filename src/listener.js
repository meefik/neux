/**
 * Event listener.
 */
export default class EventListener {
  constructor(context) {
    this._lst = {};
    this._ctx = context;
  }

  on(event, handler, once) {
    if (event && handler) {
      const list = this._lst;
      const events = [].concat(event);
      for (const ev of events) {
        if (!list[ev]) {
          list[ev] = new Map();
        }
        list[ev].set(handler, once);
      }
    }
  }

  once(event, handler) {
    this.on(event, handler, true);
  }

  off(event, handler) {
    if (event) {
      const list = this._lst;
      const events = [].concat(event);
      for (const ev of events) {
        if (list[ev]) {
          if (handler) {
            list[ev].delete(handler);
            if (!list[ev].size) {
              delete list[ev];
            }
          }
          else {
            list[ev].clear();
            delete list[ev];
          }
        }
      }
    }
    else {
      this._lst = {};
    }
  }

  emit(event, ...args) {
    if (event) {
      const list = this._lst;
      const events = [].concat(event);
      for (const ev of events) {
        if (list[ev]) {
          for (const [handler, once] of list[ev]) {
            if (once) {
              this.off(ev, handler);
            }
            try {
              handler.apply(this._ctx, args);
            }
            catch (err) {
              console.error(err);
            }
          }
        }
      }
    }
  }
}
