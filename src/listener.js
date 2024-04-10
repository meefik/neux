/**
 * Event listener.
 */
export default class EventListener {
  #list = {};

  on (event, handler) {
    if (event && handler) {
      const list = this.#list;
      const events = [].concat(event);
      for (const ev of events) {
        if (!list[ev]) {
          list[ev] = new Map();
        }
        list[ev].set(handler, false);
      }
    }
  }

  once (event, handler) {
    if (event && handler) {
      const list = this.#list;
      const events = [].concat(event);
      for (const ev of events) {
        if (!list[ev]) {
          list[ev] = new Map();
        }
        list[ev].set(handler, true);
      }
    }
  }

  off (event, handler) {
    if (event) {
      const list = this.#list;
      const events = [].concat(event);
      for (const ev of events) {
        if (list[ev]) {
          if (handler) {
            list[ev].delete(handler);
            if (!list[ev].size) {
              delete list[ev];
            }
          } else {
            list[ev].clear();
            delete list[ev];
          }
        }
      }
    } else {
      this.#list = {};
    }
  }

  emit (event, ...args) {
    const list = this.#list;
    if (event === '*') {
      for (const ev in list) {
        for (const [fn, once] of list[ev]) {
          const res = fn(...args);
          if (once) {
            this.off(ev, fn);
          }
          if (res === false) {
            break;
          }
        }
      }
    } else {
      const events = new Set([].concat(event));
      for (const ev of events) {
        if (list[ev]) {
          for (const [fn, once] of list[ev]) {
            const res = fn(...args);
            if (once) {
              this.off(ev, fn);
            }
            if (res === false) {
              break;
            }
          }
        }
      }
    }
  }
}
