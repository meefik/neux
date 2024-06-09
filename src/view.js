import { isArray, isFunction, isObject, isString, isUndefined } from './utils';
import { createState } from './state';

function createObserver (el) {
  const { MutationObserver, CustomEvent, Element } = window;
  const { ELEMENT_NODE } = Element;
  const observer = new MutationObserver((mutationList) => {
    const dispatchEvent = (node, event) => {
      const { children } = node;
      for (let i = 0; i < children.length; i++) {
        dispatchEvent(children[i], event);
      }
      const ev = new CustomEvent(event);
      node.dispatchEvent(ev);
    };
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === ELEMENT_NODE) {
            dispatchEvent(node, 'mounted');
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === ELEMENT_NODE) {
            dispatchEvent(node, 'removed');
          }
        });
      } else if (mutation.type === 'attributes') {
        const node = mutation.target;
        const { attributeName } = mutation;
        const { oldValue } = mutation;
        const newValue = node.getAttribute(attributeName);
        if (oldValue !== newValue) {
          const ev = new CustomEvent('changed', {
            detail: {
              attributeName,
              oldValue,
              newValue
            }
          });
          node.dispatchEvent(ev);
        }
      }
    }
  });
  observer.observe(el, {
    childList: true,
    subtree: true,
    attributeOldValue: true
  });
  return observer;
}

function createElement (cfg, ns) {
  if (!isObject(cfg)) return;
  const { document, Element } = window;
  let { tagName = 'div', namespaceURI = ns, outerHTML, el } = cfg;
  if (tagName === 'svg') {
    namespaceURI = 'http://www.w3.org/2000/svg';
  } else if (tagName === 'math') {
    namespaceURI = 'http://www.w3.org/1998/Math/MathML';
  } else if (ns === 'http://www.w3.org/1999/xhtml') {
    namespaceURI = null;
  }
  if (el instanceof Element !== true) {
    el = namespaceURI
      ? document.createElementNS(namespaceURI, tagName)
      : document.createElement(tagName);
  }
  if (isString(outerHTML)) {
    el.innerHTML = outerHTML;
    if (el.firstChild instanceof Element) {
      el = el.firstChild;
    }
  }
  const opts = { configurable: false, enumerable: true, writable: false };
  const props = {
    tagName: { ...opts, value: tagName },
    namespaceURI: { ...opts, value: namespaceURI },
    outerHTML: { ...opts, value: outerHTML },
    el: { ...opts, value: el }
  };
  Object.defineProperties(cfg, props);
  for (const prop in cfg) {
    if (!props[prop]) {
      const newv = cfg[prop];
      updateElement(newv, undefined, prop, cfg);
    }
  }
  return el;
}

function updateElement (newv, oldv, prop, obj) {
  const el = obj.el;
  if (!el) return;

  if (prop === 'on') {
    for (const ev in newv) {
      const handler = newv[ev];
      if (isFunction(handler)) {
        el.addEventListener(ev, handler);
      }
    }
    for (const ev in oldv) {
      if (!newv || isUndefined(newv[ev])) {
        const handler = oldv[ev];
        if (isFunction(handler)) {
          el.removeEventListener(ev, handler);
        }
      }
    }
    obj.$$on('on', (newv, oldv, prop) => {
      if (isUndefined(newv)) {
        if (isFunction(oldv)) {
          el.removeEventListener(prop, oldv);
        }
      } else if (isFunction(newv)) {
        el.addEventListener(prop, newv);
      }
    });
  } else if (prop === 'classList') {
    el.classList = isArray(newv) ? newv.join(' ') : (newv || '');
    obj.$$on('classList', (newv, oldv, prop, obj) => {
      el.classList = isArray(obj) ? obj.join(' ') : (obj || '');
    });
  } else if (prop === 'attributes') {
    for (const attr in newv) {
      const val = newv[attr];
      if (!isUndefined(val)) {
        el.setAttribute(attr, val);
      }
    }
    for (const attr in oldv) {
      if (!newv || isUndefined(newv[attr])) {
        el.removeAttribute(attr);
      }
    }
    obj.$$on('attributes', (newv, oldv, prop) => {
      if (isUndefined(newv)) {
        el.removeAttribute(prop);
      } else {
        el.setAttribute(prop, newv);
      }
    });
  } else if (prop === 'style') {
    const { style } = el;
    for (const name in newv) {
      style[name] = newv[name];
    }
    for (const name in oldv) {
      if (!newv || isUndefined(newv[name])) {
        style.removeProperty(name);
      }
    }
    obj.$$on('style', (newv, oldv, prop) => {
      if (isUndefined(newv)) {
        style.removeProperty(prop);
      } else if (/[A-Z]/u.test(prop)) {
        // camelCase
        style[prop] = newv;
      } else {
        // kebab-case
        style.setProperty(prop, newv);
      }
    });
  } else if (prop === 'dataset') {
    const { dataset } = el;
    for (const param in newv) {
      const val = newv[param];
      if (!isUndefined(val)) {
        dataset[param] = val;
      }
    }
    for (const param in oldv) {
      if (isUndefined(newv[param])) {
        delete dataset[param];
      }
    }
    obj.$$on('dataset', (newv, oldv, prop) => {
      if (isUndefined(newv)) {
        delete dataset[prop];
      } else {
        dataset[prop] = newv;
      }
    });
  } else if (prop === 'children') {
    el.innerHTML = '';
    if (isArray(newv)) {
      for (const cfg of newv) {
        const child = createElement(cfg, el.namespaceURI);
        if (child) {
          el.appendChild(child);
        }
      }
      obj.children.$$on('#', (newv, oldv) => {
        if (isUndefined(newv)) {
          // Del
          const oldChild = oldv?.el;
          if (oldChild) {
            el.removeChild(oldChild);
          }
        } else if (isUndefined(oldv)) {
          // Add
          const newChild = createElement(newv, el.namespaceURI);
          if (newChild) {
            el.appendChild(newChild);
          }
        } else {
          // Mod
          const oldChild = oldv?.el;
          if (oldChild) {
            const newChild = createElement(newv, el.namespaceURI);
            if (newChild) {
              el.replaceChild(newChild, oldChild);
            }
          }
        }
      });
    }
  } else if (isUndefined(newv)) {
    delete el[prop];
  } else if (!isUndefined(el[prop])) {
    el[prop] = newv;
  }
}

/**
 * Create a view.
 *
 * @param {object|function} config
 * @param {object} [options]
 * @param {HTMLElement} [options.target]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createView (config, options) {
  const { target, context } = options || {};
  const state = createState(config, { context });
  const el = createElement(state);
  state.$$on('*', updateElement);
  const observer = createObserver(target || el);
  el.addEventListener('removed', (e) => {
    if (e.target === el) {
      observer.disconnect();
    }
  }, false);
  if (target) {
    target.appendChild(el);
  }
  return state;
}
