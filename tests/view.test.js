import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createState, createView } from '../dist/neux.esm.js';

describe('view', () => {
  const { window } = new JSDOM('', {
    url: 'http://localhost',
    contentType: 'text/html'
  });
  global.window = window;

  it('initial', async (t) => {
    await t.test('tagName', async (t) => {
      const view = createView({
        tagName: 'p'
      });
      assert.equal(view.tagName, 'P');
    });

    await t.test('children', async (t) => {
      const view = createView({
        tagName: 'ul',
        children: [{
          tagName: 'li',
          textContent: 'Item 1'
        }, {
          tagName: 'li',
          textContent: 'Item 2'
        }]
      });
      assert.equal(view.tagName, 'UL');
      assert.equal(view.children[0].tagName, 'LI');
      assert.equal(view.children[0].textContent, 'Item 1');
      assert.equal(view.children[1].tagName, 'LI');
      assert.equal(view.children[1].textContent, 'Item 2');
    });

    await t.test('namespaceURI', async (t) => {
      const view = createView({
        tagName: 'svg',
        children: [{
          tagName: 'path'
        }]
      });
      const svgNamespaceURI = 'http://www.w3.org/2000/svg';
      assert.equal(view.tagName, 'svg');
      assert.equal(view.namespaceURI, svgNamespaceURI);
      assert.equal(view.children[0].tagName, 'path');
      assert.equal(view.children[0].namespaceURI, svgNamespaceURI);
    });

    await t.test('attributes', async (t) => {
      const view = createView({
        tagName: 'label',
        attributes: {
          for: 'my-input'
        },
        dataset: {
          id: '123'
        }
      });
      assert.equal(view.getAttribute('for'), 'my-input');
      assert.equal(view.getAttribute('data-id'), '123');
    });

    await t.test('classList', async (t) => {
      const view = createView({
        children: [{
          classList: ['a', 'b', 'c']
        }, {
          classList: 'a b c'
        }]
      });
      assert.equal(view.children[0].className, 'a b c');
      assert.equal(view.children[1].className, 'a b c');
    });

    await t.test('style', async (t) => {
      const view = createView({
        style: {
          color: 'red'
        }
      });
      assert.equal(view.style.color, 'red');
    });

    await t.test('textContent', async (t) => {
      const view = createView({
        textContent: 'Hello World'
      });
      assert.equal(view.textContent, 'Hello World');
    });

    await t.test('on:change', async (t) => {
      let value = 1;
      const view = createView({
        tagName: 'input',
        type: 'number',
        value,
        on: {
          change (e) {
            value = parseInt(e.target.value);
          }
        }
      });
      view.value = 2;
      const event = new window.Event('change', {
        bubbles: true,
        cancelable: true
      });
      view.dispatchEvent(event);
      assert.equal(value, 2);
    });

    await t.test('on:mounted', async (t) => {
      try {
        let view;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          view = createView({
            children: [{
              on: {
                mounted (e) {
                  clearTimeout(timer);
                  resolve();
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });

    await t.test('on:removed', async (t) => {
      try {
        let view;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          view = createView({
            children: [{
              on: {
                mounted (e) {
                  this.remove();
                },
                removed () {
                  clearTimeout(timer);
                  resolve();
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });

    await t.test('on:changed', async (t) => {
      try {
        let view;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          view = createView({
            children: [{
              attributes: {
                'my-attr': '1'
              },
              on: {
                mounted (e) {
                  this.setAttribute('my-attr', '2');
                },
                changed (e) {
                  clearTimeout(timer);
                  if (e.detail.attributeName === 'my-attr' &&
                    e.detail.newValue === '2' && e.detail.oldValue === '1') {
                    resolve();
                  } else {
                    reject(new Error('Incorrect event'));
                  }
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });
  });

  it('reactivity', async (t) => {
    await t.test('parameters', async (t) => {
      const state = createState({
        counter: 1,
        text: 'Text',
        color: 'red',
        dataId: '1'
      });
      const view = createView({
        children: [{
          tagName: 'input',
          type: 'number',
          value: () => state.$counter
        }, {
          textContent: () => state.$text
        }, {
          style: {
            color: () => state.$color
          }
        }, {
          dataset: {
            id: () => state.$dataId
          }
        }, {
          style: () => {
            return {
              color: () => state.$color
            };
          }
        }, {
          dataset: () => {
            return {
              id: () => state.$dataId
            };
          }
        }]
      });
      state.counter++;
      assert.equal(view.children[0].value, `${state.counter}`);
      state.text = 'Hello';
      assert.equal(view.children[1].textContent, state.text);
      state.color = 'blue';
      assert.equal(view.children[2].style.color, state.color);
      assert.equal(view.children[4].style.color, state.color);
      state.dataId = '2';
      assert.equal(view.children[3].dataset.id, state.dataId);
      assert.equal(view.children[5].dataset.id, state.dataId);
    });

    await t.test('attributes', async (t) => {
      const state = createState({
        attr: ''
      });
      const view = createView({
        attributes: {
          for: () => state.$attr
        }
      });
      state.attr = 'my-input';
      assert.equal(view.getAttribute('for'), state.attr);
    });

    await t.test('classList', async (t) => {
      const state = createState({
        cls: ['a', 'b']
      });
      const view = createView({
        classList: () => state.$cls
      });
      state.cls.push('c');
      assert.equal(view.className, state.cls.join(' '));
    });

    await t.test('children', async (t) => {
      const state = createState({
        list: [{
          text: 'Item 1',
          checked: true
        }, {
          text: 'Item 2'
        }]
      });
      const view = createView({
        tagName: 'ul',
        children: () => {
          return state.list.$$each(item => {
            return {
              tagName: 'li',
              children: [{
                tagName: 'input',
                type: 'checkbox',
                checked: () => item.$checked
              }, {
                tagName: 'label',
                textContent: () => item.$text
              }]
            };
          });
        }
      });
      state.list.push({ text: 'Item 3' });
      assert.equal(view.children[2].children[1].textContent, 'Item 3');
      state.list.splice(1, 1, { text: 'Item 4' });
      assert.equal(view.children[1].children[1].textContent, 'Item 4');
      state.list.pop();
      assert.equal(view.children[2], undefined);
      state.list[0].checked = false;
      assert.equal(view.children[0].children[0].checked, false);
    });
  });
});
