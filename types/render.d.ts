/**
 * Create an HTML element or fragment.
 *
 * @param tag Tag name or HTML markup or Element or configuration object.
 * @param config Configuration object or children if omitted.
 * @param children Element content or children elements.
 * @returns A new element.
 */
export function render(
  tag: string | Element | object | Array<any>,
  config?: object | Array<any>,
  children?: Array<any>
): Element | DocumentFragment;

/**
 * Mount an element to the DOM with moutation observer.
 * 
 * @param el Source element.
 * @param target Target element or selector.
 * @returns void
 */
export function mount(
  el: Element | DocumentFragment,
  target: Element | DocumentFragment | string
): void;
