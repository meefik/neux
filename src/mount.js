import { isString } from './utils.js';

/**
 * Mount an element to a target element and set up MutationObserver.
 *
 * @param {Element|DocumentFragment} el Source element.
 * @param {Element|DocumentFragment|string} target Target element or selector.
 */
export function mount(el, target) {
  const { MutationObserver, CustomEvent, Element, document } = window;
  const { ELEMENT_NODE } = Element;
  const dispatchEvent = (node, event) => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const ev = new CustomEvent(event, { cancelable: true });
    node.dispatchEvent(ev);
  };
  if (isString(target)) {
    target = document.querySelector(target);
  }
  const observer = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          dispatchEvent(node, 'mounted');
        });
        mutation.removedNodes.forEach((node) => {
          dispatchEvent(node, 'removed');
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
