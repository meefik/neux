import { isFunction } from './utils';

/**
 * Event listener.
 */
export default class EventListener {
  constructor(context) {
    this._list = {};
    this._context = context;
  }

  on(event, handler, cleanup) {
    if (event && handler) {
      const list = this._list;
      const events = [].concat(event);
      for (const ev of events) {
        if (!list[ev]) {
          list[ev] = new Map();
        }
        list[ev].set(handler, cleanup);
      }
    }
  }

  off(event, handler) {
    if (event) {
      const list = this._list;
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
      this._list = {};
    }
  }

  emit(event, ...args) {
    const list = this._list;
    const events = event === '*' ? Object.keys(list) : [].concat(event);
    for (const ev of events) {
      if (list[ev]) {
        for (const [handler, cleanup] of list[ev]) {
          try {
            handler.apply(this._context, args);
            if (isFunction(cleanup) ? cleanup() : cleanup) {
              this.off(ev, handler);
            }
          }
          catch (err) {
            console.error(err);
          }
        }
      }
    }
  }
}
