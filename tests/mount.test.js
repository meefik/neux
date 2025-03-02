import { render, mount } from '../dist/neux.esm.js';
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';

suite('mount', async () => {
  test('attach and detach', async () => {
    const el = render({
      tag: 'p',
    });
    mount(el, window.document.body);
    assert.equal(window.document.body.firstChild, el);
    el.remove();
    assert.equal(window.document.body.firstChild, null);
  });

  test('on:mounted', { timeout: 100 }, async () => {
    try {
      let el = null;
      await new Promise((resolve) => {
        el = render({
          on: {
            mounted: () => resolve(),
          },
        });
        mount(el, window.document.body);
      }).finally(() => {
        el?.remove();
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });

  test('on:changed', { timeout: 100 }, async () => {
    try {
      let el = null;
      await new Promise((resolve, reject) => {
        el = render({
          attributes: {
            'my-attr': '1',
          },
          on: {
            mounted(e) {
              e.target.setAttribute('my-attr', '2');
            },
            changed(e) {
              if (e.detail.attributeName === 'my-attr'
                && e.detail.newValue === '2' && e.detail.oldValue === '1') {
                resolve();
              }
              else {
                reject(new Error('Incorrect event'));
              }
            },
          },
        });
        mount(el, window.document.body);
      }).finally(() => {
        el?.remove();
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });

  test('on:removed', { timeout: 100 }, async () => {
    try {
      let el = null;
      await new Promise((resolve) => {
        el = render({
          on: {
            mounted: e => e.target.remove(),
            removed: () => resolve(),
          },
        });
        mount(el, window.document.body);
      }).finally(() => {
        el?.remove();
      });
      assert.ok(true);
    }
    catch (err) {
      assert.fail(err.message);
    }
  });
});
