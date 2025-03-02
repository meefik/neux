import { signal, render } from '../dist/neux.esm.js';
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';

suite('render', () => {
  test('initial', async (t) => {
    test('tag', async (t) => {
      t.test('tag name', () => {
        const el = render({
          tag: 'p',
        });
        assert.equal(el.tagName, 'P');
      });

      t.test('CSS selector', () => {
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

    await t.test('on:change', () => {
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

    await t.test('ref', () => {
      let ref = null;
      const el = render({
        ref: (e) => {
          ref = e;
        },
      });
      assert.equal(el, ref);
    });
  });

  test('reactivity', async (t) => {
    await t.test('parameters', () => {
      const state = signal({
        counter: 1,
        text: 'Text',
        color: 'red',
        dataId: '1',
      });
      const el = render({
        children: [{
          tagName: 'input',
          type: 'number',
          value: () => state.$counter,
        }, {
          textContent: () => state.$text,
        }, {
          style: {
            color: () => state.$color,
          },
        }, {
          dataset: {
            id: () => state.$dataId,
          },
        }, {
          style() {
            return {
              color: state.$color,
            };
          },
        }, {
          dataset() {
            return {
              id: state.$dataId,
            };
          },
        }],
      });
      state.counter++;
      assert.equal(el.children[0].value, `${state.counter}`);
      state.text = 'Hello';
      assert.equal(el.children[1].textContent, state.text);
      state.color = 'blue';
      assert.equal(el.children[2].style.color, state.color);
      assert.equal(el.children[4].style.color, state.color);
      state.dataId = '2';
      assert.equal(el.children[3].dataset.id, state.dataId);
      assert.equal(el.children[5].dataset.id, state.dataId);
    });

    await t.test('attributes', () => {
      const state = signal({
        attr: '',
      });
      const el = render({
        attributes: {
          for: () => state.$attr,
        },
      });
      state.attr = 'my-input';
      assert.equal(el.getAttribute('for'), state.attr);
    });

    await t.test('classList', () => {
      const state = signal({
        cls: ['a', 'b'],
      });
      const el = render({
        classList: () => state.$cls,
      });
      state.cls.push('c');
      assert.equal(el.className, state.cls.join(' '));
    });

    await t.test('children', () => {
      const state = signal({
        list: [{
          text: 'Item 1',
          checked: true,
        }, {
          text: 'Item 2',
        }],
      });
      const el = render({
        tag: 'ul',
        children: () => state.list.$$map((item) => {
          return {
            tag: 'li',
            children: [{
              tag: 'input',
              type: 'checkbox',
              checked: () => item.$checked,
            }, {
              tag: 'label',
              textContent: () => item.$text,
            }],
          };
        }),
      });
      state.list.push({ text: 'Item 3' });
      assert.equal(el.children[2].children[1].textContent, 'Item 3');
      state.list.splice(1, 1, { text: 'Item 4' });
      assert.equal(el.children[1].children[1].textContent, 'Item 4');
      state.list.pop();
      assert.equal(el.children.length, state.list.length);
      state.list[0].checked = false;
      assert.equal(el.children[0].children[0].checked, false);
    });
  });
});
