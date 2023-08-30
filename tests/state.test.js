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
        text: 'Item 1',
        checked: true
      }, {
        text: 'Item 2'
      }, {
        text: 'Item 3'
      }],
      filtered: (obj, prop) => {
        return obj.$arr.filter(item => item.checked);
      },
      $triple: (obj, prop) => obj.$counter * 3
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
      assert.equal(state.arr[0].checked, true);
      assert.equal(state.arr[1].text, 'Item 2');
      assert.equal(state.arr[2].text, 'Item 3');
    });
    await t.test('computed array field', () => {
      state.arr[1].checked = true;
      assert.equal(state.filtered.length, 2);
    });
    await t.test('watcher field', () => {
      assert.equal(state.$triple, undefined);
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
    await t.test('watcher field', async (t) => {
      try {
        const state = createState({
          counter: 1,
          $triple: (obj, prop) => obj.$counter * 3
        });
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          state.$$on('$triple', (newv, oldv, prop, obj) => {
            if (newv === 6 && oldv === undefined && prop === '$triple') {
              clearTimeout(timer);
              resolve();
            }
          });
          state.counter++;
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
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
        arr: [1, 2],
        computed: (obj, prop) => {
          return obj.arr.$$each(item => {
            return item;
          });
        }
      });
      const stages = [
        { newv: 3, oldv: undefined, prop: 2 },
        { newv: 4, oldv: 2, prop: 1 },
        { newv: undefined, oldv: 3, prop: 2 }
      ];
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(Error('Operation timeout'));
        }, 100);
        state.$$on('#computed', (newv, oldv, prop, obj) => {
          const stage = stages.shift();
          if (newv !== stage.newv || oldv !== stage.oldv || prop !== stage.prop) {
            reject(new Error('Incorrect value'));
          }
          if (!stages.length) {
            clearTimeout(timer);
            resolve();
          }
        });
        state.arr.push(3);
        state.arr.splice(1, 1, 4);
        state.arr.pop();
      });
      assert.ok(true);
    } catch (err) {
      assert.fail(err.message);
    }
  });

  it('context', async (t) => {
    const context = {};
    const state1 = createState({
      counter: 1
    }, context);
    const state2 = createState({
      double: (obj, prop) => state1.$counter * 2
    }, context);
    const state3 = createState({
      double: (obj, prop) => state1.$counter * 2
    });
    state1.counter = 2;
    assert.equal(state2.double, 4);
    assert.equal(state3.double, 2);
  });
});
