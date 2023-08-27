import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../dist/neux.esm.js';

describe('state', () => {
  it('initial', async (t) => {
    const now = new Date();
    const state = createState({
      counter: 3,
      double: (obj, prop) => obj.$counter * 2,
      name: (obj, prop) => prop,
      timestamp: now,
      obj: {
        text: () => 'Text'
      },
      arr: [{
        text: 'Item 1'
      }, {
        text: 'Item 2',
        checked: true
      }, {
        text: 'Item 3'
      }],
      filtered: (obj, prop) => {
        // TODO: reactivity for any sub changes
        return obj.$arr.filter(item => item.checked);
      }
    });
    await t.test('regular field', () => {
      assert.equal(state.counter, 3);
    });
    await t.test('computed field', () => {
      assert.equal(state.double, 6);
      assert.equal(state.name, 'name');
    });
    await t.test('date object', () => {
      assert.equal(state.timestamp, now);
    });
    await t.test('object field', () => {
      assert.equal(state.obj.text, 'Text');
    });
    await t.test('array field', () => {
      assert.equal(state.arr.length, 3);
      assert.equal(state.arr[0].text, 'Item 1');
      assert.equal(state.arr[1].text, 'Item 2');
      assert.equal(state.arr[1].checked, true);
      assert.equal(state.arr[2].text, 'Item 3');
    });
    await t.test('computed array field', () => {
      assert.equal(state.filtered.length, 1);
    });
  });

  it('changing', async (t) => {
    const state = createState();
    await t.test('regular field', () => {
      state.counter = 2;
      assert.equal(state.counter, 2);
    });
    await t.test('object field', () => {
      state.obj = {};
      state.obj.x = 1;
      assert.equal(state.obj.x, 1);
    });
    await t.test('array field', () => {
      state.arr = [];
      state.arr.push([{ checked: false }]);
      state.arr[0].checked = true;
      assert.equal(state.arr[0].checked, true);
      state.arr.pop();
      assert.ok(!state.arr[0]);
    });
    await t.test('computed field', () => {
      state.double = (obj, prop) => obj.$counter * 2;
      assert.equal(state.double, 4);
    });
  });

  it('on', async (t) => {
    function asyncTask (handler, timeout = 1000) {
      let timer;
      return new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Operation timeout'));
        }, timeout);
        handler(resolve, reject);
      }).finally(() => {
        clearTimeout(timer);
      });
    }
    await t.test('any changes', async () => {
      try {
        await asyncTask((resolve, reject) => {
          const events = ['counter', 'double'];
          const state = createState({
            counter: 1,
            double: (obj, prop) => obj.$counter * 2
          });
          state.$$on('*', (newv, oldv, prop, obj) => {
            const index = events.indexOf(prop);
            if (index > -1) events.splice(index, 1);
            if (!events.length) resolve();
          });
          state.counter = 2;
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });
    await t.test('regular field', async () => {
      try {
        await asyncTask((resolve, reject) => {
          const state = createState({
            counter: 1
          });
          state.$$on('counter', (newv, oldv, prop, obj) => {
            if (prop === 'counter' && newv === 2 && oldv === 1) {
              resolve();
            }
          });
          state.counter = 2;
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });
    await t.test('computed field', async () => {
      try {
        await asyncTask((resolve, reject) => {
          const state = createState({
            counter: 1,
            double: (obj, prop) => obj.$counter * 2
          });
          state.$$on('double', (newv, oldv, prop, obj) => {
            if (prop === 'double' && newv === 4 && oldv === 2) {
              resolve();
            }
          });
          state.counter = 2;
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });
  });

  it('once', async (t) => {
    try {
      await new Promise((resolve, reject) => {
        const state = createState({
          counter: 1
        });
        let c = 0;
        state.$$once('counter', (newv, oldv, prop, obj) => {
          if (++c > 1) {
            clearTimeout(timer);
            reject(new Error('Event triggered again'));
          }
        });
        const timer = setTimeout(resolve, 100);
        state.counter = 2;
        state.counter = 3;
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });

  it('off', async (t) => {
    try {
      await new Promise((resolve, reject) => {
        const state = createState({
          counter: 1
        });
        const handler = (newv, oldv, prop, obj) => {
          clearTimeout(timer);
          reject(new Error('Event triggered anyway'));
        };
        state.$$on('counter', handler);
        state.$$off('counter', handler);
        const timer = setTimeout(resolve, 100);
        state.counter = 2;
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });

  it('emit', async (t) => {
    try {
      await new Promise((resolve, reject) => {
        const state = createState();
        const timer = setTimeout(() => {
          reject(Error('Operation timeout'));
        }, 100);
        state.$$on('myevent', (a, b) => {
          clearTimeout(timer);
          if (a === '1' && b === '2') {
            resolve();
          }
        });
        state.$$emit('myevent', '1', '2');
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });

  it('clone & equal', async (t) => {
    const state = createState({
      a: 1,
      b: 'b',
      c: {
        d: 10,
        e: [1, 2, { f: 'f' }]
      }
    });
    const obj = state.$$clone();
    assert.ok(!obj.$$clone);
    assert.ok(state.$$equal(obj));
  });

  it('patch', async (t) => {
    const state = createState({
      key1: 'key1',
      nested: {
        key1: 'nested.key1',
        key2: 'nested.key2',
        key3: 'nested.key3'
      }
    });
    try {
      await new Promise((resolve, reject) => {
        const changed = ['key3', 'key4'];
        state.$$on('*', (newv, oldv, prop, obj, level1) => {
          if (level1 === 'nested') {
            const index = changed.indexOf(prop);
            if (index > -1) changed.splice(index, 1);
            if (!changed.length) {
              clearTimeout(timer);
              resolve();
            }
          }
        });
        const timer = setTimeout(() => {
          reject(Error('Operation timeout'));
        }, 100);
        state.$$patch({
          key1: 'key1',
          nested: {
            key2: 'nested.key2',
            key3: 'changed1',
            key4: 'changed2'
          }
        });
      });
    } catch (err) {
      assert.fail(err.message);
    }
    assert.equal(state.key1, 'key1');
    assert.ok(!state.nested.key1);
    assert.equal(state.nested.key2, 'nested.key2');
    assert.equal(state.nested.key3, 'changed1');
    assert.equal(state.nested.key4, 'changed2');
  });

  it('each', async (t) => {
    try {
      const state = createState({
        arr: [],
        computed: (obj, prop) => {
          return obj.arr.$$each(item => {
            return item;
          });
        }
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(Error('Operation timeout'));
        }, 100);
        state.$$on('computed', (newv, oldv, prop, obj) => {
          clearTimeout(timer);
          if (prop === 'computed' && newv.length === 1 && oldv.length === 0) {
            resolve();
          } else {
            reject(new Error('Incorrect value'));
          }
        });
        state.arr.push(1);
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });

  it('watch', async (t) => {
    try {
      const state = createState({
        counter: 1,
        arr: ['a', 'b']
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(Error('Operation timeout'));
        }, 100);
        const stages = [
          { newv: 'c-1', oldv: 'undefined', idx: 2 },
          { newv: 'c-1', oldv: 'b-1', idx: 1 },
          { newv: 'undefined', oldv: 'c-1', idx: 2 },
          { newv: 'a-2,c-2', oldv: 'a-1,b-1', idx: 'computed' }
        ];
        const arr = state.$$watch('computed', (obj, prop) => {
          const counter = obj.$counter;
          return obj.arr.$$each(item => {
            return `${item}-${counter}`;
          });
        }, (newv, oldv, idx, arr) => {
          const stage = stages.shift();
          if (`${newv}` !== stage.newv || `${oldv}` !== stage.oldv || idx !== stage.idx) {
            reject(new Error('Incorrect value'));
          }
          if (!stages.length) {
            clearTimeout(timer);
            resolve();
          }
        });
        assert.equal(arr.length, 2);
        state.arr.push('c');
        state.arr.splice(1, 1);
        state.counter++;
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });
});
