import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, effect } from '../dist/neux.esm.js';

suite('signal', () => {
  test('initial', async (t) => {
    const now = new Date();
    let flag1 = false;
    let flag2 = false;
    const state = signal({
      counter: 3,
      double: obj => obj.$counter * 2,
      name: (obj, prop) => prop,
      timestamp: now,
      obj: {
        text: () => 'Text',
      },
      arr: [{
        text: 'Item 1',
        checked: true,
      }, {
        text: 'Item 2',
      }, {
        text: 'Item 3',
      }],
      checked: obj => obj.arr.$$.filter(item => item.checked).length,
      $: () => {
        flag1 = true;
      },
      $$: () => {
        flag2 = true;
      },
    });
    await t.test('regular field', () => {
      assert.equal(state.counter, 3);
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
    await t.test('computed field', () => {
      assert.equal(state.double, 6);
      assert.equal(state.name, 'name');
    });
    await t.test('computed nested field', () => {
      assert.equal(state.checked, 1);
    });
    await t.test('$ field', () => {
      assert.equal(flag1, false);
    });
    await t.test('$$ field', () => {
      assert.equal(flag2, false);
    });
  });

  test('changing', async (t) => {
    await t.test('regular field', () => {
      const state = signal();
      state.counter = 2;
      assert.equal(state.counter, 2);
    });
    await t.test('object field', () => {
      const state = signal();
      state.obj = {};
      state.obj.x = 1;
      assert.equal(state.obj.x, 1);
    });
    await t.test('array field', () => {
      const state = signal();
      state.arr = [];
      state.arr.push([{ checked: false }]);
      state.arr[0].checked = true;
      assert.equal(state.arr[0].checked, true);
      state.arr.pop();
      assert.ok(!state.arr[0]);
    });
    await t.test('computed field', () => {
      const state = signal();
      state.counter = 2;
      state.double = obj => obj.$counter * 2;
      assert.equal(state.double, 4);
    });
    await t.test('computed nested field', () => {
      const state = signal();
      state.arr = [{ text: 'Item 1', checked: true }, { text: 'Item 2' }, { text: 'Item 3' }];
      state.checked = obj => obj.arr.$$.filter(item => item.checked).length;
      state.arr[1].checked = true;
      assert.equal(state.checked, 2);
    });
    await t.test('track changes', () => {
      let flag1 = false;
      let flag2 = false;
      const state = signal();
      state.x = 1;
      state.obj = { x: 1 };
      state.$ = () => {
        flag1 = true;
      };
      state.$$ = () => {
        flag2 = true;
      };
      state.obj.x++;
      assert.equal(flag1, false);
      assert.equal(flag2, true);
      state.x++;
      assert.equal(flag1, true);
    });
  });

  test('on', async (t) => {
    await t.test('any changes', { timeout: 100 }, async () => {
      try {
        await new Promise((resolve) => {
          const events = ['counter', 'double'];
          const state = signal({
            counter: 1,
            double: obj => obj.$counter * 2,
          });
          state.$$on('*', (newv, oldv, prop) => {
            const index = events.indexOf(prop);
            if (index > -1) {
              events.splice(index, 1);
            }
            if (!events.length) {
              resolve();
            }
          });
          state.counter = 2;
        });
        assert.ok(true);
      }
      catch (err) {
        assert.fail(err.message);
      }
    });
    await t.test('regular field', { timeout: 100 }, async () => {
      try {
        await new Promise((resolve) => {
          const state = signal({
            counter: 1,
          });
          state.$$on('counter', (newv, oldv, prop) => {
            if (prop === 'counter' && newv === 2 && oldv === 1) {
              resolve();
            }
          });
          state.counter = 2;
        });
        assert.ok(true);
      }
      catch (err) {
        assert.fail(err.message);
      }
    });
    await t.test('computed field', { timeout: 100 }, async () => {
      try {
        await new Promise((resolve) => {
          const state = signal({
            counter: 1,
            double: obj => obj.$counter * 2,
          });
          state.$$on('double', (newv, oldv, prop) => {
            if (prop === 'double' && newv === 4 && oldv === 2) {
              resolve();
            }
          });
          state.counter = 2;
        });
        assert.ok(true);
      }
      catch (err) {
        assert.fail(err.message);
      }
    });
    await t.test('array field', { timeout: 100 }, async () => {
      try {
        await new Promise((resolve, reject) => {
          const state = signal({
            arr: [1, 2],
          });
          const stages = [
            { prop: '2', newv: 3 },
            { prop: '1', newv: 4, oldv: 2 },
            { prop: '2', oldv: 3 },
          ];
          state.$$on('*', (newv, oldv, prop) => {
            const stage = stages.shift();
            if (prop !== stage.prop || newv !== stage.newv || oldv !== stage.oldv) {
              reject(new Error('Incorrect value'));
            }
          });
          state.arr.$$on('length', (newv) => {
            if (newv !== state.arr.length) {
              reject(new Error('Incorrect array length'));
            }
            else if (!stages.length) {
              resolve();
            }
          });
          state.arr.push(3);
          state.arr.splice(1, 1, 4);
          state.arr.pop();
        });
        assert.ok(true);
      }
      catch (err) {
        assert.fail(err.message);
      }
    });
  });

  test('once', async () => {
    try {
      await new Promise((resolve, reject) => {
        const state = signal({
          counter: 1,
        });
        let c = 0;
        state.$$once('counter', () => {
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
    }
    catch (err) {
      assert.fail(err.message);
    }
  });

  test('off', async () => {
    try {
      await new Promise((resolve, reject) => {
        const state = signal({
          counter: 1,
        });
        const handler = () => {
          clearTimeout(timer);
          reject(new Error('Event triggered anyway'));
        };
        state.$$on('counter', handler);
        state.$$off('counter', handler);
        const timer = setTimeout(resolve, 100);
        state.counter = 2;
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });

  test('emit', { timeout: 100 }, async () => {
    try {
      await new Promise((resolve) => {
        const state = signal();
        state.$$on('myevent', (a, b) => {
          if (a === '1' && b === '2') {
            resolve();
          }
        });
        state.$$emit('myevent', '1', '2');
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });

  test('context', () => {
    const context = {};
    const state1 = signal.call(context, {
      counter: 1,
    });
    const state2 = signal.call(context, {
      double: () => state1.$counter * 2,
    });
    const state3 = signal({
      double: () => state1.$counter * 2,
    });
    state1.counter = 2;
    assert.equal(state2.double, 4);
    assert.equal(state3.double, 2);
  });

  test('effect', { timeout: 100 }, async () => {
    try {
      await new Promise((resolve) => {
        const state = signal({
          counter: 1,
        });
        effect(() => {
          return state.$counter * 2;
        }, (value) => {
          if (value === 4) {
            resolve();
          }
        });
        state.counter = 2;
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });
});
