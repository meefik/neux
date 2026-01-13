import { isArray, isFunction, isObject, isString, isUndefined, isEmpty } from './utils.js';
import { createContext } from './context.js';
import { effect } from './signal.js';

/**
 * Create an element from a tag string, HTML markup or an Element.
 *
 * @param {string|Element} tag Tag string, HTML markup or Element.
 * @param {string} [ns] Namespace URI.
 * @returns {Element}
 */
function createElement(tag, ns) {
  const { document, customElements, Element } = window;
  const classList = [];
  let el, id, tagName = 'div';

  if (isString(tag)) {
    if (/[^a-zA-Z0-9-_.#]/u.test(tag)) {
      // if tag is HTML markup
      const div = document.createElement('div');
      div.innerHTML = tag;
      if (div.firstChild instanceof Element) {
        el = div.firstChild;
        tagName = el.tagName;
      }
    }
    else {
      // if tag is a tag string with optional id and class names
      const match = tag.match(/([.#]?[^\s#.]+)/ug) || [];
      for (let item of match) {
        const firstChar = item[0];
        if (firstChar === '.') classList.push(item.slice(1));
        else if (firstChar === '#') id = item.slice(1);
        else tagName = item;
      }
    }
  }
  else if (tag instanceof Element) {
    // if tag is an Element
    el = tag;
    tagName = el.tagName;
  }

  // create element if not exists
  if (!el) {
    // create custom element if exists
    const CustomElement = customElements?.get(tagName);
    if (CustomElement) {
      el = new CustomElement();
    }
    else {
      // create element with namespace if defined
      if (ns === 'http://www.w3.org/1999/xhtml') {
        ns = null;
      }
      if (!ns) {
        switch (`${tagName}`.toLowerCase()) {
          case 'svg':
            ns = 'http://www.w3.org/2000/svg';
            break;
          case 'math':
            ns = 'http://www.w3.org/1998/Math/MathML';
            break;
        }
      }
      el = ns
        ? document.createElementNS(ns, tagName)
        : document.createElement(tagName);
    }
  }
  // set id and classList if defined
  if (id) el.id = id;
  if (classList.length) el.className = classList.join(' ');

  return el;
}

/**
 * Create a node with specified configuration.
 *
 * @param {any} [config] Node configuration.
 * @param {string} [ns] Namespace URI.
 * @returns {Node}
 */
function createNode(config, ns) {
  const { document, Node, CustomEvent } = window;
  const context = createContext(this);
  if (isFunction(config)) {
    config = config.call(context);
  }
  if (isString(config)) {
    return document.createTextNode(config);
  }
  if (!isObject(config)) {
    return config;
  }
  if (isArray(config)) {
    const fragment = document.createDocumentFragment();
    for (let item of config) {
      const child = createNode.call(context, item, ns);
      if (child instanceof Node) {
        fragment.appendChild(child);
      }
    }
    return fragment;
  }
  const {
    tag,
    tagName = 'div',
    namespaceURI = ns,
    shadowRootMode,
    adoptedStyleSheets,
    on,
    ref,
    ...rest
  } = config;
  // allocate and dispose bindings
  const bindings = new Map();
  const dispose = (key) => {
    if (key) {
      for (let k of bindings.keys()) {
        if (k.startsWith(key)) {
          for (let fn of bindings.get(k)) fn();
          bindings.delete(k);
        }
      }
    }
    else {
      for (let fns of bindings.values()) {
        for (let fn of fns) fn();
      }
      bindings.clear();
    }
  };
  const allocate = (key, fn) => {
    if (bindings.has(key)) bindings.get(key).push(fn);
    else bindings.set(key, [fn]);
  };
  // create element
  const el = (isObject(tag) || isFunction(tag))
    ? createNode.call(context, tag, namespaceURI)
    : createElement(tag || tagName, namespaceURI);
  ns = el.namespaceURI;
  // create shadow root if defined
  let shadowRoot;
  if (shadowRootMode) {
    shadowRoot = el.attachShadow({ mode: shadowRootMode });
    if (shadowRoot && adoptedStyleSheets) {
      shadowRoot.adoptedStyleSheets = adoptedStyleSheets;
    }
  }
  // parse event handlers
  if (!isUndefined(on)) {
    for (let ev in on) {
      const handler = on[ev];
      if (isFunction(handler)) {
        el.addEventListener(ev, e => handler.call(context, e));
      }
    }
  }
  // add custom event listeners
  const dispatchEvent = ({ children }, event) => {
    for (let child of children) {
      const ev = new CustomEvent(event, { cancelable: true });
      child.dispatchEvent(ev);
    }
  };
  el.addEventListener('mounted', (e) => {
    if (!e.defaultPrevented) {
      dispatchEvent(el, 'mounted');
    }
  });
  el.addEventListener('removed', (e) => {
    if (!e.defaultPrevented) {
      dispose();
      dispatchEvent(el, 'removed');
    }
  });
  el.addEventListener('refresh', (e) => {
    if (!e.defaultPrevented) {
      if (!e.detail) {
        patchNode(rest);
      }
      else {
        const props = [].concat(e.detail);
        for (let prop of props) {
          const path = prop.split('.');
          const params = path.reduce((acc, key, index) => {
            return acc && (index >= path.length - 1
              ? { [key]: acc[key] }
              : acc[key]);
          }, rest);
          patchNode(params, path.slice(0, -1));
        }
      }
    }
  });
  // apply parameters to the element
  const patchNode = (params, path = []) => {
    for (let key in params) {
      const subpath = [...path, key];
      const pathKey = subpath.join('.');
      const [root, prop] = subpath;
      const getter = params[key];
      dispose(pathKey);
      const dp = effect.call(context, getter, (value) => {
        const off = value === null || value === undefined;
        // children
        if (root === 'children') {
          const target = shadowRoot || el;
          const fragment = createNode.call(context, value, ns);
          if (fragment instanceof Node) {
            const oldChildren = Array.from(target.childNodes);
            const isFragment = fragment.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
            const newChildren = isFragment ? Array.from(fragment.childNodes) : [fragment];
            syncDOM(target, oldChildren, newChildren);
          }
          else {
            target.innerHTML = '';
            dispose(pathKey + '.');
          }
          value = fragment;
        }
        // classList
        else if (root === 'classList') {
          if (Array.isArray(value)) {
            value = value.filter(Boolean).join(' ');
          }
          else if (!isString(value)) {
            value = '';
          }
          el.classList = value;
        }
        // attributes
        else if (root === 'attributes') {
          if (prop) {
            if (off) el.removeAttribute(prop);
            else el.setAttribute(prop, value);
          }
          else if (isEmpty(value)) {
            const keys = Object.keys(el[root]);
            for (let key of keys) {
              const name = el[root][key]?.name;
              if (name) el.removeAttribute(name);
            }
            dispose(pathKey + '.');
          }
          else {
            return patchNode(value, subpath);
          }
        }
        // style
        else if (root === 'style') {
          if (prop) {
            if (/[A-Z]/u.test(prop)) { // camelCase
              el[root][prop] = off ? '' : value;
            }
            else { // kebab-case
              if (off) el[root].removeProperty(prop);
              else el[root].setProperty(prop, value);
            }
          }
          else if (isEmpty(value)) {
            el.removeAttribute('style');
            dispose(pathKey + '.');
          }
          else {
            return patchNode(value, subpath);
          }
        }
        // dataset
        else if (root === 'dataset') {
          if (prop) {
            if (off) delete el[root][prop];
            else el[root][prop] = value;
          }
          else if (isEmpty(value)) {
            const keys = Object.keys(el[root]);
            for (let key of keys) {
              delete el[root][key];
            }
            dispose(pathKey + '.');
          }
          else {
            return patchNode(value, subpath);
          }
        }
        // other properties
        else {
          const { obj, key } = subpath.reduce((acc, key, index) => {
            if (index === subpath.length - 1) {
              return { obj: acc, key };
            }
            else if (isUndefined(acc[key])) {
              acc[key] = {};
            }
            return acc[key];
          }, el);
          if (isUndefined(value)) {
            delete obj[key];
            dispose(pathKey + '.');
          }
          else {
            obj[key] = value;
          }
        }
        // dispatch the "updated" event
        el.dispatchEvent(new CustomEvent('updated', {
          detail: { property: pathKey, value },
          cancelable: true,
        }));
      });
      if (dp) allocate(pathKey, dp);
    }
  };
  // initial patch
  patchNode(rest);
  // set reference
  if (isFunction(ref)) {
    ref.call(context, el);
  }
  return el;
}

/**
 * Create an element, text node, or fragment using HyperScript-like syntax.
 *
 * @param {string|Node|object|any[]} [tag] Tag name or HTML markup or element or configuration object.
 * @param {object|any[]} [config] Configuration object or children if omitted.
 * @param {any[]} [children] Element content or children elements.
 * @returns {Element|DocumentFragment}
 */
export function render(tag, config, children) {
  if (isArray(tag)) {
    return createNode.call(this, tag);
  }
  if (isObject(tag)) {
    children = config;
    config = tag;
    tag = null;
  }
  if (!isObject(config) || isArray(config)) {
    children = config;
    config = {};
  }
  if (!isUndefined(children)) {
    config = { children, ...config };
  }
  return createNode.call(this, { tag, ...config });
}

/**
 * Mount an element to a target element and set up MutationObserver.
 *
 * @param {Element|DocumentFragment} el Source element.
 * @param {Element|DocumentFragment|string} target Target element or selector.
 */
export function mount(el, target) {
  const { MutationObserver, CustomEvent, Node, document } = window;
  const dispatchEvent = (node, event) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const ev = new CustomEvent(event, { cancelable: true });
    node.dispatchEvent(ev);
  };
  if (isString(target)) {
    target = document.querySelector(target);
  }
  const observer = new MutationObserver((mutationList) => {
    for (let mutation of mutationList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.parentNode) dispatchEvent(node, 'mounted');
        });
        mutation.removedNodes.forEach((node) => {
          if (!node.parentNode) dispatchEvent(node, 'removed');
          if (node === el) observer.disconnect();
        });
      }
      else if (mutation.type === 'attributes') {
        const node = mutation.target;
        const { attributeName } = mutation;
        const { oldValue } = mutation;
        const newValue = node.getAttribute(attributeName);
        if (oldValue !== newValue) {
          const ev = new CustomEvent('changed', {
            detail: { attributeName, oldValue, newValue },
          });
          node.dispatchEvent(ev);
        }
      }
    }
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributeOldValue: true,
  });
  target.appendChild(el);
}

/**
 * Sync DOM children between old and new lists with minimal operations.
 *
 * @param {Node} parent Parent node.
 * @param {Node[]} oldList Old nodes.
 * @param {Node[]} newList New nodes.
 */
function syncDOM(parent, oldList, newList) {
  let oldStart = 0;
  let newStart = 0;
  let oldEnd = oldList.length - 1;
  let newEnd = newList.length - 1;

  // 1. Prefix sync
  while (oldStart <= oldEnd && newStart <= newEnd) {
    if (oldList[oldStart].isEqualNode(newList[newStart])) {
      oldStart++;
      newStart++;
    }
    else break;
  }

  // 2. Suffix sync
  while (oldStart <= oldEnd && newStart <= newEnd) {
    if (oldList[oldEnd].isEqualNode(newList[newEnd])) {
      oldEnd--;
      newEnd--;
    }
    else break;
  }

  // 3. Simple addition (new elements only)
  if (oldStart > oldEnd) {
    const referenceNode = oldList[oldEnd + 1] || null;
    while (newStart <= newEnd) {
      parent.insertBefore(newList[newStart++], referenceNode);
    }
  }
  // 4. Simple removal (old elements only)
  else if (newStart > newEnd) {
    while (oldStart <= oldEnd) {
      parent.removeChild(oldList[oldStart++]);
    }
  }
  // 5. Complex Diff (Moves, Additions, Removals)
  else {
    const oldMap = new Map();
    // Optimization: Use a Map of the remaining old nodes
    for (let i = oldStart; i <= oldEnd; i++) {
      oldMap.set(oldList[i], i);
    }

    while (newStart <= newEnd) {
      const newNode = newList[newStart];
      let oldMatch = null;

      // Find a matching old node
      for (let [oldNode] of oldMap) {
        if (oldNode.isEqualNode(newNode)) {
          oldMatch = oldNode;
          break;
        }
      }

      // Reference node is the CURRENT node at the oldStart position
      const referenceNode = parent.childNodes[oldStart];

      if (oldMatch) {
        // Move existing node to current position
        parent.insertBefore(oldMatch, referenceNode);
        oldMap.delete(oldMatch);
      }
      else {
        // It's a brand new node
        parent.insertBefore(newNode, referenceNode);
      }

      newStart++;
      oldStart++; // Keep live DOM index in sync with newStart
    }

    // Cleanup nodes that weren't reused
    for (let [node] of oldMap) {
      parent.removeChild(node);
    }
  }
}
