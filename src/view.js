import { createState } from './state';
import { isObject, isArray, isFunction, isString, isUndefined } from './utils';

/**
 * Create a view.
 *
 * @param {object|function} config
 * @param {object} [options]
 * @param {HTMLElement} [options.target]
 * @param {object} [options.context]
 * @returns {HTMLElement}
 */
export function createView (config, options) {
  const { target, context } = options || {};
  const el = render(config, context);
  const node = target || el;
  if (node) {
    const observer = createObserver(node);
    node.addEventListener('removed', () => observer.disconnect(), false);
    if (target && el) {
      target.appendChild(el);
    }
  }
  return el;
}

function render (config, context, ns) {
  if (!isObject(config)) return;
  config = { ...config };
  let node;
  // view
  if (config.view) {
    node = config.view;
    delete config.view;
    if (isFunction(node)) {
      return render(node(config), context, ns);
    } else if (isString(node)) {
      const el = document.createElement('div');
      el.innerHTML = node;
      config.view = el.firstChild;
      return render(config, context, ns);
    }
  }
  if (!ns && `${config.tagName}`.toUpperCase() === 'SVG') {
    ns = 'http://www.w3.org/2000/svg';
  }
  const {
    tagName = 'DIV',
    namespaceURI = ns,
    attributes,
    classList,
    on,
    children
  } = config;
  delete config.tagName;
  delete config.namespaceURI;
  delete config.attributes;
  delete config.classList;
  delete config.on;
  delete config.children;
  if (!node) {
    node = namespaceURI
      ? document.createElementNS(namespaceURI, tagName)
      : document.createElement(tagName);
  }
  const state = createState({}, context);
  // cleanup
  node.addEventListener('removed', () => {
    delete state['*'];
  }, false);
  // events
  for (const ev in on) {
    const handler = on[ev];
    if (isFunction(handler)) {
      node.addEventListener(ev, handler);
    }
  }
  // attributes
  for (const attr in attributes) {
    const val = attributes[attr];
    const setter = (newv) => {
      node.setAttribute(attr, newv);
    };
    if (isFunction(val)) {
      const getter = val;
      const newv = state.$$watch(`attributes.${attr}`, getter, setter);
      setter(newv);
    } else {
      setter(val);
    }
  }
  // classList
  if (!isUndefined(classList)) {
    const setter = (newv) => {
      if (isArray(newv)) {
        newv = newv.join(' ');
      }
      node.classList = newv;
    };
    if (isFunction(classList)) {
      const getter = classList;
      const newv = state.$$watch('classList', getter, setter);
      setter(newv);
    } else {
      setter(classList);
    }
  }
  // other parameters
  patchNode(state, node, config);
  // children
  if (!isUndefined(children)) {
    const key = 'children';
    const setter = (newv, oldv, prop) => {
      if (prop === key) {
        // replace
        if (!isUndefined(newv)) {
          node.innerHTML = '';
          const views = [].concat(newv);
          for (const view of views) {
            const child = render(view, context, namespaceURI);
            if (child) {
              node.appendChild(child);
            }
          }
        }
      } else if (isUndefined(newv)) {
        // del
        const oldChild = node.children[prop];
        if (oldChild) {
          node.removeChild(oldChild);
        }
      } else if (isUndefined(oldv)) {
        // add
        const newChild = render(newv, context, namespaceURI);
        if (newChild) {
          node.appendChild(newChild);
        }
      } else {
        // mod
        const oldChild = node.children[prop];
        const newChild = render(newv, context, namespaceURI);
        if (newChild && oldChild) {
          node.replaceChild(newChild, oldChild);
        }
      }
    };
    if (isFunction(children)) {
      const getter = children;
      const val = state.$$watch(key, getter, setter);
      setter(val, undefined, key);
    } else {
      setter(children, undefined, key);
    }
  }
  return node;
}

function patchNode (state, node, params, ...rest) {
  for (const param in params) {
    const val = params[param];
    if (isObject(val)) {
      const target = node[param];
      if (target) patchNode(state, target, val, ...rest, param);
    } else if (!isUndefined(val)) {
      const setter = (newv) => {
        node[param] = newv;
      };
      if (isFunction(val)) {
        const key = [].concat(rest, param).join('.');
        const getter = val;
        const newv = state.$$watch(key, getter, setter);
        setter(newv);
      } else {
        setter(val);
      }
    }
  }
}

function createObserver (el) {
  const observer = new MutationObserver(function (mutationList) {
    const dispatchEvent = (node, event) => {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        dispatchEvent(children[i], event);
      }
      const ev = new CustomEvent(event);
      node.dispatchEvent(ev);
    };
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            dispatchEvent(node, 'mounted');
          }
        });
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            dispatchEvent(node, 'removed');
          }
        });
      } else if (mutation.type === 'attributes') {
        const node = mutation.target;
        const ev = new CustomEvent('changed', {
          detail: {
            attributeName: mutation.attributeName,
            oldValue: mutation.oldValue,
            newValue: node.getAttribute(mutation.attributeName)
          }
        });
        node.dispatchEvent(ev);
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
