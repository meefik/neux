import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, effect } from '../dist/neux.esm.js';

const timeout = (cb, t = 100) => {
  setTimeout(() => cb(new Error('Timeout')), t);
};

suite('signal', async () => {
  await test('regular field', () => {
    const state = signal({
      counter: 1,
    });

    assert.equal(state.counter, 1);

    state.counter = 2;

    assert.equal(state.counter, 2);
  });

  await test('date object', () => {
    let now = new Date();
    const state = signal({
      timestamp: now,
    });

    assert.equal(state.timestamp, now);

    now = new Date();
    state.timestamp = now;

    assert.equal(state.timestamp, now);
  });

  await test('object field', () => {
    const state = signal({
      obj: {
        text: () => 'A',
      },
    });

    assert.equal(state.obj.text, 'A');

    state.obj.text = 'B';

    assert.equal(state.obj.text, 'B');
  });

  await test('array field', () => {
    const state = signal({
      arr: [{
        text: 'A',
      }, {
        text: 'B',
        checked: true,
      }, {
        text: 'C',
      }],
    });

    assert.equal(state.arr.length, 3);
    assert.equal(state.arr[0].text, 'A');
    assert.equal(state.arr[1].text, 'B');
    assert.equal(state.arr[1].checked, true);
    assert.equal(state.arr[2].text, 'C');

    state.arr[1].checked = false;
    state.arr.shift();
    state.arr.pop();
    state.arr.push({ text: 'D' });

    assert.equal(state.arr.length, 2);
    assert.equal(state.arr[0].text, 'B');
    assert.equal(state.arr[0].checked, false);
    assert.equal(state.arr[1].text, 'D');
  });

  await test('computed field', () => {
    const state = signal({
      counter: 2,
      double: obj => obj.$counter * 2,
      name: (obj, prop) => prop,
    });

    assert.equal(state.double, 4);
    assert.equal(state.name, 'name');

    state.counter++;
    state.name = 'name2';

    assert.equal(state.double, 6);
    assert.equal(state.name, 'name2');
  });

  await test('computed nested field', () => {
    const state = signal({
      arr: [{
        text: 'Item 1',
      }, {
        text: 'Item 2',
        checked: true,
      }, {
        text: 'Item 3',
        checked: true,
      }],
      checked1: obj => obj.arr.$.filter(item => item.checked).length,
      checked2: obj => obj.arr.$$.filter(item => item.checked).length,
    });

    assert.equal(state.checked1, 2);
    assert.equal(state.checked2, 2);

    state.arr[1].checked = false;

    assert.equal(state.checked1, 2);
    assert.equal(state.checked2, 1);
  });

  await test('on', async (t) => {
    await t.test('any self changes', () => {
      return new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          counter: 1,
        });
        state.$$on('#', (newv, oldv, prop) => {
          if (prop === 'counter' && newv === 2 && oldv === 1) {
            resolve();
          }
          else {
            reject(new Error('Incorrect value'));
          }
        });
        state.counter = 2;
      });
    });

    await t.test('any self and nested changes', () => {
      return new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          nested: {
            text: '1',
          },
        });
        state.$$on('*', (newv, oldv, prop, obj, rest) => {
          if (prop === 'text' && newv === '2' && oldv === '1' && rest[0] === 'nested') {
            resolve();
          }
          else {
            reject(new Error('Incorrect value'));
          }
        });
        state.nested.text = '2';
      });
    });

    await t.test('regular field', () => {
      return new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          counter: 1,
        });
        state.$$on('counter', (newv, oldv, prop) => {
          if (prop === 'counter' && newv === 2 && oldv === 1) {
            resolve();
          }
          else {
            reject(new Error('Incorrect value'));
          }
        });
        state.counter = 2;
      });
    });

    await t.test('computed field', () => {
      return new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          counter: 1,
          double: obj => obj.$counter * 2,
        });
        state.$$on('double', (newv, oldv, prop) => {
          if (prop === 'double' && newv === 4 && oldv === 2) {
            resolve();
          }
          else {
            reject(new Error('Incorrect value'));
          }
        });
        state.counter = 2;
      });
    });

    await t.test('array field', () => {
      return new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          arr: [1, 2],
        });
        const stages = [
          { prop: '2', newv: 3 },
          { prop: '1', newv: 4, oldv: 2 },
          { prop: '2', oldv: 3 },
        ];
        state.arr.$$on('#', (newv, oldv, prop) => {
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
    });
  });

  await test('once', () => {
    return new Promise((resolve, reject) => {
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
  });

  await test('off', () => {
    return new Promise((resolve, reject) => {
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
  });

  await test('emit', () => {
    return new Promise((resolve, reject) => {
      timeout(reject);
      const state = signal();
      state.$$on('myevent', (a, b) => {
        if (a === '1' && b === '2') {
          resolve();
        }
        else {
          reject(new Error('Incorrect value'));
        }
      });
      state.$$emit('myevent', '1', '2');
    });
  });

  await test('context', () => {
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

  await test('effect', () => {
    return new Promise((resolve, reject) => {
      timeout(reject);
      const stages = [2, 4];
      const state = signal({
        counter: 1,
      });
      effect(() => {
        return state.$counter * 2;
      }, (value) => {
        const double = stages.shift();
        if (value !== double) {
          reject(new Error('Incorrect value'));
        }
        if (!stages.length) resolve();
      });
      state.counter = 2;
    });
  });
});
