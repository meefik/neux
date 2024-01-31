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
  const state = createState({}, context);
  const el = render(config, state);
  if (el) {
    const observer = createObserver(target || el);
    el.addEventListener('removed', (e) => {
      if (e.target === el) {
        observer.disconnect();
      }
    }, false);
    if (target) {
      target.appendChild(el);
    }
  }
  return state;
}

function render (config, state, ns) {
  if (!isObject(config)) return;
  const { document } = window;
  config = { ...config };
  let node;
  // view
  if (config.view) {
    node = config.view;
    delete config.view;
    if (isFunction(node)) {
      return render(node(config), state, ns);
    } else if (isString(node)) {
      const el = document.createElement('div');
      el.innerHTML = node;
      config.view = el.firstChild;
      return render(config, state, ns);
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
  // delete config.tagName;
  // delete config.namespaceURI;
  // delete config.attributes;
  // delete config.classList;
  delete config.on;
  // delete config.children;
  if (!node) {
    node = namespaceURI
      ? document.createElementNS(namespaceURI, tagName)
      : document.createElement(tagName);
  }
  // cleanup
  node.addEventListener('removed', () => {
    state.$$off();
    delete state['*'];
  }, false);
  // events
  for (const ev in on) {
    const handler = on[ev];
    if (isFunction(handler)) {
      node.addEventListener(ev, handler);
    }
  }
  state.$$on('*', (newv, oldv, prop, obj, ...rest) => {
    if (rest.length > 1) return;
    console.log(newv, prop, obj, ...rest);
    if (rest.length > 0) {
      const parentAttr = rest[0];
      if (parentAttr === 'attributes') {
        if (isUndefined(newv)) {
          node.removeAttribute(prop);
        } else {
          node.setAttribute(prop, newv);
        }
      } else if (parentAttr !== 'children') {
        const target = rest.reduce((prev, cur) => {
          return prev ? prev[cur] : null;
        }, node);
        if (target) {
          if (isUndefined(newv)) {
            delete target[prop];
          } else {
            target[prop] = newv;
          }
        }
      }
    } else if (isObject(newv)) {
      if (prop === 'children') {
        const views = [].concat(newv);
        for (const view of views) {
          const child = render(view, state, namespaceURI);
          if (child) {
            node.appendChild(child);
          }
        }
      } else if (prop === 'attributes') {
        for (const attr in newv) {
          if (isUndefined(newv)) {
            node.removeAttribute(attr);
          } else {
            node.setAttribute(attr, newv[attr]);
          }
        }
      } else if (prop === 'classList') {
        if (isArray(newv)) {
          newv = newv.join(' ');
        }
        node[prop] = newv;
      } else {
        for (const attr in newv) {
          node[prop][attr] = newv[attr];
        }
      }
    } else if (prop !== 'tagName' && prop !== 'namespaceURI') {
      if (isUndefined(newv)) {
        delete node[prop];
      } else {
        node[prop] = newv;
      }
    }
  });
  for (const key in config) {
    state[key] = config[key];
  }
  // // attributes
  // for (const attr in attributes) {
  //   const val = attributes[attr];
  //   const setter = (newv) => {
  //     node.setAttribute(attr, newv);
  //   };
  //   if (isFunction(val)) {
  //     const key = attr;
  //     state.$$on(key, setter);
  //     state[key] = val;
  //   } else {
  //     setter(val);
  //   }
  // }
  // // classList
  // if (!isUndefined(classList)) {
  //   const setter = (newv) => {
  //     if (isArray(newv)) {
  //       newv = newv.join(' ');
  //     }
  //     node.classList = newv;
  //   };
  //   if (isFunction(classList)) {
  //     const key = 'classList';
  //     state.$$on(key, setter);
  //     state[key] = classList;
  //   } else {
  //     setter(classList);
  //   }
  // }
  // // other parameters
  // patchNode(state, node, config);
  // // children
  // if (!isUndefined(children)) {
  //   const key = 'children';
  //   const setter = (newv) => {
  //     node.innerHTML = '';
  //     if (!isUndefined(newv)) {
  //       const views = [].concat(newv);
  //       for (const view of views) {
  //         const child = render(view, context, namespaceURI);
  //         if (child) {
  //           node.appendChild(child);
  //         }
  //       }
  //     }
  //   };
  //   const updater = (newv, oldv, prop) => {
  //     if (isUndefined(newv)) {
  //       // del
  //       const oldChild = node.children[prop];
  //       if (oldChild) {
  //         node.removeChild(oldChild);
  //       }
  //     } else if (isUndefined(oldv)) {
  //       // add
  //       const newChild = render(newv, context, namespaceURI);
  //       if (newChild) {
  //         node.appendChild(newChild);
  //       }
  //     } else {
  //       // mod
  //       const oldChild = node.children[prop];
  //       const newChild = render(newv, context, namespaceURI);
  //       if (newChild && oldChild) {
  //         node.replaceChild(newChild, oldChild);
  //       }
  //     }
  //   };
  //   if (isFunction(children)) {
  //     state.$$on(key, setter);
  //     state.$$on('#' + key, updater);
  //     state[key] = children;
  //   } else {
  //     setter(children);
  //   }
  // }
  return node;
}

function patchNode (state, node, params, ...rest) {
  for (const param in params) {
    const val = params[param];
    const setter = (newv) => {
      if (isObject(newv)) {
        const target = node[param];
        if (target) patchNode(state, target, newv, ...rest, param);
      } else if (!isUndefined(newv)) {
        node[param] = newv;
      }
    };
    if (isFunction(val)) {
      const key = [].concat(rest, param).join('.');
      state.$$on(key, setter);
      state[key] = val;
    } else {
      setter(val);
    }
  }
}

function createObserver (el) {
  const { MutationObserver, CustomEvent, Node } = window;
  const ELEMENT_NODE = Node.ELEMENT_NODE;
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
        const attributeName = mutation.attributeName;
        const oldValue = mutation.oldValue;
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
