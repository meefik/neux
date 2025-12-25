/**
 * Event emitter.
 */
export default class EventEmitter extends Map {
  constructor(context) {
    super();
    this._ctx = context;
  }

  on(event, handler) {
    if (event && handler) {
      const events = [].concat(event);
      for (let ev of events) {
        if (!this.has(ev)) {
          this.set(ev, new Map());
        }
        this.get(ev).set(handler, false);
      }
    }
  }

  once(event, handler) {
    if (event && handler) {
      const events = [].concat(event);
      for (let ev of events) {
        if (!this.has(ev)) {
          this.set(ev, new Map());
        }
        this.get(ev).set(handler, true);
      }
    }
  }

  off(event, handler) {
    if (event) {
      const events = [].concat(event);
      for (let ev of events) {
        if (this.has(ev)) {
          if (handler) {
            this.get(ev).delete(handler);
            if (!this.get(ev).size) {
              this.delete(ev);
            }
          }
          else {
            this.get(ev).clear();
            this.delete(ev);
          }
        }
      }
    }
  }

  emit(event, ...args) {
    if (event) {
      const events = [].concat(event);
      for (let ev of events) {
        if (this.has(ev)) {
          for (let [handler, once] of this.get(ev)) {
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
