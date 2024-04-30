import { isArray, isFunction, isObject, isString, isUndefined } from './utils';
import { createState } from './state';

function isReadOnly (prop) {
  return ['tagName', 'namespaceURI', 'node'].includes(prop);
}

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
  if (!isObject(cfg)) {
    cfg = {};
  }
  const { document, Element } = window;
  const { tagName = 'div', namespaceURI, node } = cfg;
  if (namespaceURI) {
    ns = namespaceURI;
  } else if (tagName === 'svg') {
    ns = 'http://www.w3.org/2000/svg';
  } else if (ns === 'http://www.w3.org/1999/xhtml') {
    ns = null;
  }
  let el = node instanceof Element
    ? node
    : (ns
      ? document.createElementNS(ns, tagName)
      : document.createElement(tagName));
  if (isString(node)) {
    el.innerHTML = node;
    if (el.firstChild instanceof Element) {
      el = el.firstChild;
    }
  }
  const opts = { configurable: false, enumerable: true, writable: false };
  Object.defineProperties(cfg, {
    tagName: { ...opts, value: tagName },
    namespaceURI: { ...opts, value: ns },
    node: { ...opts, value: el }
  });
  for (const prop in cfg) {
    const newv = cfg[prop];
    updateElement(el, newv, undefined, prop);
  }
  return el;
}

function updateElement (el, newv, oldv, prop, obj, rest = []) {
  const { Element } = window;
  const [parent] = rest;

  let level = 0;
  for (let i = rest.length - 1, curr = el; i >= 0; i--) {
    const path = rest[i];
    curr = curr[path];
    if (!curr) {
      break;
    }
    if (curr instanceof Element) {
      el = curr;
      level = 0;
    } else {
      level++;
    }
  }

  if (level === 0) {
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
    } else if (prop === 'classList') {
      el.classList = isArray(newv) ? newv.join(' ') : (newv || '');
    } else if (prop === 'children') {
      el.innerHTML = '';
      if (isArray(newv)) {
        for (const cfg of newv) {
          const child = createElement(cfg, el.namespaceURI);
          if (child) {
            el.appendChild(child);
          }
        }
      }
    } else if (isObject(newv)) {
      if (el[prop]) {
        for (const param in newv) {
          const val = newv[param];
          if (!isUndefined(val)) {
            el[prop][param] = val;
          }
        }
        for (const param in oldv) {
          if (isUndefined(newv[param])) {
            delete el[prop][param];
          }
        }
      }
    } else if (isUndefined(newv)) {
      delete el[prop];
    } else if (!isReadOnly(prop) && !isUndefined(el[prop])) {
      el[prop] = newv;
    }
  } else if (level === 1) {
    if (parent === 'on') {
      if (isUndefined(newv)) {
        if (isFunction(oldv)) {
          el.removeEventListener(prop, oldv);
        }
      } else if (isFunction(newv)) {
        el.addEventListener(prop, newv);
      }
    } else if (parent === 'attributes') {
      if (isUndefined(newv)) {
        el.removeAttribute(prop);
      } else {
        el.setAttribute(prop, newv);
      }
    } else if (parent === 'style') {
      const { style } = el;
      if (isUndefined(newv)) {
        style.removeProperty(prop);
      } else if (/[A-Z]/u.test(prop)) {
        // camelCase
        style[prop] = newv;
      } else {
        // kebab-case
        style.setProperty(prop, newv);
      }
    } else if (parent === 'classList') {
      el.classList = isArray(obj) ? obj.join(' ') : (obj || '');
    } else if (parent === 'children') {
      if (isUndefined(newv)) {
        // Del
        const oldChild = el.children[prop];
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
        const oldChild = el.children[prop];
        const newChild = createElement(newv, el.namespaceURI);
        if (newChild && oldChild) {
          el.replaceChild(newChild, oldChild);
        }
      }
    } else if (el[parent]) {
      if (isUndefined(newv)) {
        delete el[parent][prop];
      } else {
        el[parent][prop] = newv;
      }
    }
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
  state.$$on('*', (...args) => {
    updateElement(el, ...args);
  });
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
