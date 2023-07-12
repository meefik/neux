import { getContext } from './context';
import EventListener from './listener';

/**
 * View
 *
 * @param {object} config
 * @param {HTMLElement} target
 * @returns {HTMLElement}
 */
export function createView (config, target) {
  const el = render(config);
  const node = target || el;
  const observer = createObserver(node);
  node.addEventListener('removed', () => observer.disconnect(), false);
  if (target && el) {
    target.appendChild(el);
  }
  return el;
}

function render (config, ns) {
  if (typeof config === 'function') {
    return render(config());
  }
  if (typeof config !== 'object') return;
  const attrs = { ...config };
  let node;
  if (attrs.view) {
    node = attrs.view;
    delete attrs.view;
    if (typeof node === 'function') {
      return render(node(attrs));
    } else if (typeof node === 'string') {
      const el = document.createElement('div');
      el.innerHTML = node;
      attrs.view = el.firstChild;
      return render(attrs);
    }
  }
  if (!ns && `${attrs.tagName}`.toUpperCase() === 'SVG') {
    ns = 'http://www.w3.org/2000/svg';
  }
  const {
    tagName = 'DIV',
    namespaceURI = ns,
    attributes,
    on,
    children
  } = attrs;
  delete attrs.tagName;
  delete attrs.namespaceURI;
  delete attrs.attributes;
  delete attrs.on;
  delete attrs.children;
  if (!node) {
    node = namespaceURI
      ? document.createElementNS(namespaceURI, tagName)
      : document.createElement(tagName);
  }
  const cleaner = new EventListener();
  node.addEventListener('removed', () => cleaner.emit('*'), false);
  patch(attrs, node, cleaner);
  for (const attr in attributes) {
    let val = attributes[attr];
    if (typeof val !== 'undefined') {
      if (typeof val === 'function') {
        const fn = val;
        const updater = () => node.setAttribute(attr, fn());
        val = getContext(fn, (obj, prop) => {
          obj.$$on(prop, updater);
          cleaner.once(attr, () => obj.$$off(prop, updater));
        });
      }
      node.setAttribute(attr, val);
    }
  }
  for (const ev in on) {
    const handler = on[ev];
    if (typeof handler === 'function') {
      node.addEventListener(ev, handler);
    }
  }
  let _children = children;
  if (typeof children === 'function') {
    _children = getContext(children, (obj, prop, fn) => {
      if (Array.isArray(obj) && prop === '$each' && typeof fn === 'function') {
        const add = (newv, prop, obj) => {
          if (isNaN(prop)) return;
          const index = parseInt(prop);
          const newView = fn(newv, index, obj);
          if (newView) {
            const newChild = render(newView, namespaceURI);
            if (newChild) {
              node.appendChild(newChild);
            }
          }
        };
        obj.$$on('#add', add);
        cleaner.once(prop, () => obj.$$off('#add', add));
        const mod = (newv, prop, obj) => {
          if (isNaN(prop)) return;
          const index = parseInt(prop);
          const oldChild = node.children[index];
          const newView = fn(newv, index, obj);
          if (newView) {
            const newChild = render(newView, namespaceURI);
            if (newChild && oldChild) {
              node.replaceChild(newChild, oldChild);
            }
          }
        };
        obj.$$on('#mod', mod);
        cleaner.once(prop, () => obj.$$off('#mod', mod));
        const del = (newv, prop, obj) => {
          if (isNaN(prop)) return;
          const index = parseInt(prop);
          const oldChild = node.children[index];
          if (oldChild) {
            node.removeChild(oldChild);
          }
        };
        obj.$$on('#del', del);
        cleaner.once(prop, () => obj.$$off('#del', del));
      } else {
        const fn = children;
        const updater = () => {
          const views = [].concat(fn());
          node.innerHTML = '';
          for (const view of views) {
            const child = render(view, namespaceURI);
            if (child) {
              node.appendChild(child);
            }
          }
        };
        obj.$$on(prop, updater);
        cleaner.once(prop, () => obj.$$off(prop, updater));
      }
    });
  }
  if (typeof _children === 'object') {
    const views = [].concat(_children);
    for (const view of views) {
      const child = render(view, namespaceURI);
      if (child) {
        node.appendChild(child);
      }
    }
  }
  return node;
}

function patch (source, target, cleaner, level = 0) {
  const setValue = (obj, key, val) => {
    if (key === 'classList' && !level) {
      val = val.join(' ');
    }
    if (val !== null && typeof val === 'object') {
      patch(val, obj[key], cleaner, level + 1);
    } else {
      if (obj[key] !== val) obj[key] = val;
    }
  };
  for (const key in source) {
    let value = source[key];
    if (typeof value === 'function') {
      const fn = value;
      const updater = () => setValue(target, key, fn());
      value = getContext(fn, (obj, prop) => {
        obj.$$on(prop, updater);
        cleaner.once(key, () => obj.$$off(prop, updater));
      });
    }
    setValue(target, key, value);
  }
}

function createObserver (el) {
  const observer = new MutationObserver(function (mutationList) {
    const dispatchEvent = (node, event) => {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        dispatchEvent(children[i], event);
      }
      const ev = new Event(event);
      node.dispatchEvent(ev);
    };
    for (const mutation of mutationList) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        dispatchEvent(node, 'mounted');
      });
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        dispatchEvent(node, 'removed');
      });
    }
  });
  observer.observe(el, { childList: true, subtree: true });
  return observer;
}
