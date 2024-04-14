import { createState, createView } from '../dist/neux.esm.js';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

describe('view', () => {
  const { window } = new JSDOM('', {
    url: 'http://localhost',
    contentType: 'text/html'
  });
  /* eslint-disable-next-line */
  global.window = window;

  it('initial', async (t) => {
    await t.test('tagName', () => {
      const { node } = createView({
        tagName: 'p'
      });
      assert.equal(node.tagName, 'P');
    });

    await t.test('namespaceURI', () => {
      const { node } = createView({
        tagName: 'svg',
        children: [{
          tagName: 'path'
        }]
      });
      const svgNamespaceURI = 'http://www.w3.org/2000/svg';
      assert.equal(node.tagName.toUpperCase(), 'SVG');
      assert.equal(node.namespaceURI, svgNamespaceURI);
      assert.equal(node.children[0].tagName.toUpperCase(), 'PATH');
      assert.equal(node.children[0].namespaceURI, svgNamespaceURI);
    });

    await t.test('node', () => {
      const { node } = createView({
        children: [{
          node: '<span>Text</span>',
          className: 'abc'
        }, {
          node: window.document.createElement('span'),
          className: 'abc',
          textContent: 'Text'
        }]
      });
      assert.equal(node.children[0].tagName.toUpperCase(), 'SPAN');
      assert.equal(node.children[0].textContent, 'Text');
      assert.equal(node.children[0].className, 'abc');
      assert.equal(node.children[1].tagName.toUpperCase(), 'SPAN');
      assert.equal(node.children[1].textContent, 'Text');
      assert.equal(node.children[1].className, 'abc');
    });

    await t.test('attributes', () => {
      const { node } = createView({
        tagName: 'label',
        attributes: {
          for: 'my-input'
        }
      });
      assert.equal(node.getAttribute('for'), 'my-input');
    });

    await t.test('dataset', () => {
      const { node } = createView({
        tagName: 'label',
        dataset: {
          id: '123'
        }
      });
      assert.equal(node.dataset.id, '123');
    });

    await t.test('classList', () => {
      const { node } = createView({
        children: [{
          classList: ['a', 'b', 'c']
        }, {
          classList: 'd e f'
        }]
      });
      assert.equal(node.children[0].className, 'a b c');
      assert.equal(node.children[1].className, 'd e f');
    });

    await t.test('style', () => {
      const { node } = createView({
        style: {
          color: 'red'
        }
      });
      assert.equal(node.style.color, 'red');
    });

    await t.test('textContent', () => {
      const { node } = createView({
        textContent: 'Hello World'
      });
      assert.equal(node.textContent, 'Hello World');
    });

    await t.test('children', () => {
      const { node } = createView({
        tagName: 'ul',
        children: [{
          tagName: 'li',
          textContent: 'Item 1'
        }, {
          tagName: 'li',
          textContent: 'Item 2'
        }]
      });
      assert.equal(node.tagName.toUpperCase(), 'UL');
      assert.equal(node.children[0].tagName.toUpperCase(), 'LI');
      assert.equal(node.children[0].textContent, 'Item 1');
      assert.equal(node.children[1].tagName.toUpperCase(), 'LI');
      assert.equal(node.children[1].textContent, 'Item 2');
    });

    await t.test('on:change', () => {
      let value = 1;
      const { node } = createView({
        tagName: 'input',
        type: 'number',
        value,
        on: {
          change () {
            return (e) => {
              value = parseInt(e.target.value, 10);
            };
          }
        }
      });
      node.value = 2;
      const event = new window.Event('change', {
        bubbles: true,
        cancelable: true
      });
      node.dispatchEvent(event);
      assert.equal(value, 2);
    });

    await t.test('on:mounted', async () => {
      try {
        let view = null;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          view = createView({
            children: [{
              on: {
                mounted () {
                  return () => {
                    clearTimeout(timer);
                    resolve();
                  };
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.node.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });

    await t.test('on:removed', async () => {
      try {
        let view = null;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(Error('Operation timeout'));
          }, 100);
          view = createView({
            children: [{
              on: {
                mounted () {
                  return (e) => {
                    e.target.remove();
                  };
                },
                removed () {
                  return () => {
                    clearTimeout(timer);
                    resolve();
                  };
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.node.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });

    await t.test('on:changed', async () => {
      try {
        let view = null;
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
                mounted () {
                  return (e) => {
                    e.target.setAttribute('my-attr', '2');
                  };
                },
                changed () {
                  return (e) => {
                    clearTimeout(timer);
                    if (e.detail.attributeName === 'my-attr'
                      && e.detail.newValue === '2' && e.detail.oldValue === '1') {
                      resolve();
                    } else {
                      reject(new Error('Incorrect event'));
                    }
                  };
                }
              }
            }]
          }, {
            target: window.document.body
          });
        }).finally(() => {
          view?.node.remove();
        });
        assert.ok(true);
      } catch (err) {
        assert.fail(err.message);
      }
    });
  });

  it('reactivity', async (t) => {
    await t.test('parameters', () => {
      const state = createState({
        counter: 1,
        text: 'Text',
        color: 'red',
        dataId: '1'
      });
      const { node } = createView({
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
          style () {
            return {
              color: state.$color
            };
          }
        }, {
          dataset () {
            return {
              id: state.$dataId
            };
          }
        }]
      });
      state.counter++;
      assert.equal(node.children[0].value, `${state.counter}`);
      state.text = 'Hello';
      assert.equal(node.children[1].textContent, state.text);
      state.color = 'blue';
      assert.equal(node.children[2].style.color, state.color);
      assert.equal(node.children[4].style.color, state.color);
      state.dataId = '2';
      assert.equal(node.children[3].dataset.id, state.dataId);
      assert.equal(node.children[5].dataset.id, state.dataId);
    });

    await t.test('attributes', () => {
      const state = createState({
        attr: ''
      });
      const { node } = createView({
        attributes: {
          for: () => state.$attr
        }
      });
      state.attr = 'my-input';
      assert.equal(node.getAttribute('for'), state.attr);
    });

    await t.test('classList', () => {
      const state = createState({
        cls: ['a', 'b']
      });
      const { node } = createView({
        classList: () => state.$cls
      });
      state.cls.push('c');
      assert.equal(node.className, state.cls.join(' '));
    });

    await t.test('children', () => {
      const state = createState({
        list: [{
          text: 'Item 1',
          checked: true
        }, {
          text: 'Item 2'
        }]
      });
      const { node } = createView({
        tagName: 'ul',
        children: () => state.list.$$each((item) => ({
          tagName: 'li',
          children: [{
            tagName: 'input',
            type: 'checkbox',
            checked: () => item.$checked
          }, {
            tagName: 'label',
            textContent: () => item.$text
          }]
        }))
      });
      state.list.push({ text: 'Item 3' });
      assert.equal(node.children[2].children[1].textContent, 'Item 3');
      state.list.splice(1, 1, { text: 'Item 4' });
      assert.equal(node.children[1].children[1].textContent, 'Item 4');
      state.list.pop();
      assert.equal(node.children[2], undefined);
      state.list[0].checked = false;
      assert.equal(node.children[0].children[0].checked, false);
    });
  });
});
