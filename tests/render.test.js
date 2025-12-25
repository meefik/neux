import { JSDOM } from 'jsdom';
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { render, mount } from '../src/render.js';
import { signal } from '../src/signal.js';

const timeout = (cb, t = 100) => {
  setTimeout(() => cb(new Error('Timeout')), t);
};

suite('render', async () => {
  const { window } = new JSDOM('', {
    url: 'http://localhost',
    contentType: 'text/html',
  });
  global.window = window;

  await test('initial', async (t) => {
    await test('tag', async (t) => {
      await t.test('tag name', () => {
        // as string
        const el1 = render({
          tag: 'p',
        });
        assert.equal(el1.tagName, 'P');
        // nested element
        const View = () => {
          return {
            tag: 'p',
          };
        };
        // as object
        const el2 = render({
          tag: View(),
          textContent: 'Hello',
        });
        assert.equal(el2.tagName, 'P');
        assert.equal(el2.textContent, 'Hello');
        // as function
        const el3 = render({
          tag: View,
          textContent: 'Hello',
        });
        assert.equal(el3.tagName, 'P');
        assert.equal(el3.textContent, 'Hello');
      });

      await t.test('CSS selector', () => {
        const el = render({
          tag: 'p#my-id.my-class1.my-class2',
        });
        assert.equal(el.tagName, 'P');
        assert.equal(el.id, 'my-id');
        assert.equal(el.className, 'my-class1 my-class2');
      });

      await t.test('Element', () => {
        const span = window.document.createElement('span');
        const el = render({
          tag: span,
          className: 'abc',
          textContent: 'Text',
        });
        assert.equal(el, span);
        assert.equal(el.textContent, 'Text');
        assert.equal(el.className, 'abc');
      });

      await t.test('HTML markup', () => {
        const el = render({
          tag: '<span></span>',
          className: 'abc',
          textContent: 'Text',
        });
        assert.equal(el.tagName, 'SPAN');
        assert.equal(el.textContent, 'Text');
        assert.equal(el.className, 'abc');
      });
    });

    await t.test('tagName', () => {
      const el = render({
        tagName: 'p',
      });
      assert.equal(el.tagName, 'P');
    });

    await t.test('namespaceURI', () => {
      const el = render({
        tag: 'div',
        children: [{
          tag: 'svg',
          children: [{
            tag: 'path',
          }],
        }, {
          tag: 'math',
          children: [{
            tag: 'msup',
            children: [{
              tag: 'mi',
              textContent: 'π',
            }, {
              tag: 'mn',
              textContent: 2,
            }],
          }],
        }],
      });
      const xhtmlNamespaceURI = 'http://www.w3.org/1999/xhtml';
      const svgNamespaceURI = 'http://www.w3.org/2000/svg';
      const mathNamespaceURI = 'http://www.w3.org/1998/Math/MathML';
      assert.equal(el.tagName, 'DIV');
      assert.equal(el.namespaceURI, xhtmlNamespaceURI);
      assert.equal(el.children[0].tagName.toUpperCase(), 'SVG');
      assert.equal(el.children[0].namespaceURI, svgNamespaceURI);
      assert.equal(el.children[0].children[0].tagName.toUpperCase(), 'PATH');
      assert.equal(el.children[0].children[0].namespaceURI, svgNamespaceURI);
      assert.equal(el.children[1].tagName.toUpperCase(), 'MATH');
      assert.equal(el.children[1].namespaceURI, mathNamespaceURI);
      assert.equal(el.children[1].children[0].tagName.toUpperCase(), 'MSUP');
      assert.equal(el.children[1].children[0].namespaceURI, mathNamespaceURI);
    });

    await t.test('shadowRootMode', () => {
      const el = render({
        tag: 'div',
        shadowRootMode: 'open',
        children: [{
          tag: 'span',
          textContent: 'Text',
        }],
      });
      assert.ok(el.shadowRoot);
      assert.equal(el.shadowRoot.mode, 'open');
      assert.equal(el.shadowRoot.children[0].tagName, 'SPAN');
      assert.equal(el.shadowRoot.children[0].textContent, 'Text');
    });

    await t.test('attributes', () => {
      const el = render({
        tag: 'label',
        attributes: {
          for: 'my-input',
        },
      });
      assert.equal(el.getAttribute('for'), 'my-input');
    });

    await t.test('dataset', () => {
      const el = render({
        dataset: {
          id: '123',
        },
      });
      assert.equal(el.dataset.id, '123');
    });

    await t.test('classList', () => {
      const el = render({
        children: [{
          classList: ['a', 'b', 'c'],
        }, {
          classList: 'd e f',
        }],
      });
      assert.equal(el.children[0].className, 'a b c');
      assert.equal(el.children[1].className, 'd e f');
    });

    await t.test('style', () => {
      const el = render({
        style: {
          color: 'red',
        },
      });
      assert.equal(el.style.color, 'red');
    });

    await t.test('textContent', () => {
      const el = render({
        textContent: 'Hello World',
      });
      assert.equal(el.textContent, 'Hello World');
    });

    await t.test('children', () => {
      const el = render({
        tag: 'ul',
        children: [{
          tag: 'li',
          textContent: 'Item 1',
        }, {
          tag: 'li',
          textContent: 'Item 2',
        }],
      });
      assert.equal(el.tagName, 'UL');
      assert.equal(el.children[0].tagName, 'LI');
      assert.equal(el.children[0].textContent, 'Item 1');
      assert.equal(el.children[1].tagName, 'LI');
      assert.equal(el.children[1].textContent, 'Item 2');
    });

    await t.test('ref', () => {
      let ref = null;
      const el = render({
        ref: (e) => {
          ref = e;
        },
      });
      assert.equal(el, ref);
    });

    await t.test('on', () => {
      let value = 1;
      const el = render({
        tag: 'input',
        type: 'number',
        value,
        on: {
          change(e) {
            value = parseInt(e.target.value, 10);
          },
        },
      });
      el.value = 2;
      const event = new window.Event('change', {
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      assert.equal(value, 2);
    });

    await t.test('mount', async () => {
      const el = render({
        tag: 'p',
      });
      mount(el, window.document.body);
      assert.equal(window.document.body.firstChild, el);
      el.remove();
      assert.equal(window.document.body.firstChild, null);
    });

    await t.test('on:updated', async () => {
      await new Promise((resolve, reject) => {
        timeout(reject);
        let count = 0;
        let key = 'a';
        const stack = [
          { property: 'dataset.key', value: 'a' },
          { property: 'textContent', value: 'Count: 0' },
          { property: 'dataset.key', value: 'b' },
          { property: 'textContent', value: 'Count: 1' },
        ];
        const el = render({
          dataset: {
            key: () => key,
          },
          textContent: () => {
            return `Count: ${count}`;
          },
          on: {
            updated: (e) => {
              const item = stack.find((item) => {
                return item.property === e.detail?.property
                  && item.value === e.detail?.value;
              });
              if (item) stack.splice(stack.indexOf(item), 1);
              if (stack.length === 0) {
                resolve();
              }
            },
          },
        });
        count = 1;
        key = 'b';
        el.dispatchEvent(new window.CustomEvent('refresh', { detail: ['textContent', 'dataset.key'] }));
      });
    });

    await t.test('on:mounted', async () => {
      let el = null;
      try {
        await new Promise((resolve, reject) => {
          timeout(reject);
          el = render({
            on: {
              mounted: () => resolve(),
            },
          });
          mount(el, window.document.body);
        });
      }
      finally {
        el?.remove();
      }
    });

    await t.test('on:changed', async () => {
      let el = null;
      try {
        await new Promise((resolve, reject) => {
          timeout(reject);
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
        });
      }
      finally {
        el?.remove();
      }
    });

    await t.test('on:removed', async () => {
      let el = null;
      try {
        await new Promise((resolve, reject) => {
          timeout(reject);
          el = render({
            on: {
              mounted: e => e.target.remove(),
              removed: () => resolve(),
            },
          });
          mount(el, window.document.body);
        });
      }
      finally {
        el?.remove();
      }
    });
  });

  await test('reactivity', async (t) => {
    await t.test('textContent', async () => {
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          text: '',
        });
        render({
          textContent: () => state.$text,
          on: {
            updated: (e) => {
              if (e.detail?.property === 'textContent' && e.target.textContent === 'Hello') {
                resolve();
              }
            },
          },
        });
        state.text = 'Hello';
      });
    });

    await t.test('style', async () => {
      // object
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          color: 'red',
        });
        render({
          style() {
            return {
              color: state.$color,
            };
          },
          on: {
            updated: (e) => {
              if (e.detail?.property === 'style.color' && e.target.style.color === 'blue') {
                resolve();
              }
            },
          },
        });
        state.color = 'blue';
      });
      // nested field
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          color: 'red',
        });
        render({
          style: {
            color: () => state.$color,
          },
          on: {
            updated: (e) => {
              if (e.detail?.property === 'style.color' && e.target.style.color === 'blue') {
                resolve();
              }
            },
          },
        });
        state.color = 'blue';
      });
    });

    await t.test('dataset', async () => {
      // object
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          dataId: '1',
        });
        render({
          dataset() {
            return {
              id: state.$dataId,
            };
          },
          on: {
            updated: (e) => {
              if (e.detail?.property === 'dataset.id' && e.target.dataset.id === '2') {
                resolve();
              }
            },
          },
        });
        state.dataId = '2';
      });
      // nested field
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          dataId: '1',
        });
        render({
          dataset: {
            id: () => state.$dataId,
          },
          on: {
            updated: (e) => {
              if (e.detail?.property === 'dataset.id' && e.target.dataset.id === '2') {
                resolve();
              }
            },
          },
        });
        state.dataId = '2';
      });
    });

    await t.test('attributes', async () => {
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          attr: '',
        });
        render({
          attributes: {
            for: () => state.$attr,
          },
          on: {
            updated: (e) => {
              if (e.detail?.property === 'attributes.for' && e.target.getAttribute('for') === 'my-input') {
                resolve();
              }
            },
          },
        });
        state.attr = 'my-input';
      });
    });

    await t.test('classList', async () => {
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          cls: ['a', 'b'],
        });
        render({
          classList: () => state.cls.$,
          on: {
            updated: (e) => {
              if (e.detail?.property === 'classList' && e.target.className === 'a b c') {
                resolve();
              }
            },
          },
        });
        state.cls.push('c');
      });
    });

    await t.test('children', async () => {
      await new Promise((resolve, reject) => {
        timeout(reject);
        const state = signal({
          list: [
            { text: 'Item 1' },
            { text: 'Item 2' },
          ],
        });
        render({
          tag: 'ul',
          children: () => state.list.$.map((item) => {
            return {
              tag: 'li',
              textContent: item.text,
            };
          }),
          on: {
            updated: (e) => {
              if (e.detail?.property === 'children'
                && e.target.children.length === 2
                && e.target.children[0].textContent === 'Item 3'
                && e.target.children[1].textContent === 'Item 4') {
                resolve();
              }
            },
          },
        });
        state.list.unshift({ text: 'Item 3' });
        state.list.splice(1, 1, { text: 'Item 4' });
        state.list.pop();
      });
    });
  });
});
