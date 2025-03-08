/**
 * Create a reactive state.
 *
 * @param data Initial state data.
 * @returns An object containing the reactive state.
 */
export function signal(data?: object): {
  [key: string]: any
};

/**
 * Subscribe to reactive field changes.
 *
 * @param getter Getter function that will be called when the reactive state changes.
 * @param setter Setter function that will be called after the getter function.
 * @returns Dispose function.
 */
export function effect(
  getter: () => any,
  setter?: (value: any) => void
): () => void;

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

/**
 * Create a localization.
 * 
 * @param locales Localized translations.
 * @param options Localization options.
 */
export function l10n(
  locales: { [key: string]: { [key: string]: string } },
  options?: {
    language?: string,
    fallback?: string,
  }
): (path: string, data?: object | string, lang?: string) => string;
