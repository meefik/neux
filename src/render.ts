import { effect, untrack } from "./signal";

/** XML namespace URIs for auto-detection and explicit assignment. */
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const MATH_NS = "http://www.w3.org/1998/Math/MathML";

/** Regular expressions for tag parsing and casing detection. */
const HTML_RE = /[^a-zA-Z0-9-_.#]/u;
const PARSE_TAG_RE = /([.#]?[^\s#.]+)/gu;
const UPPER_CASE_RE = /[A-Z]/u;

/**
 * A value that is either the desired type directly, or a function that returns it.
 *
 * When a function is provided, it will be called inside a reactive
 * {@link effect} so that its return value updates automatically when
 * tracked properties change.
 *
 * @category Render
 *
 * @typeParam T The type of the value.
 */
export type ReactiveValue<T> = T | (() => T);

/**
 * A child node config value that can be passed to render or used as children.
 *
 * @category Render
 */
export type RenderChild = string | Node | RenderConfig;

/**
 * Configuration object passed to {@link render} or used as a child element.
 *
 * Known keys (`tagName`, `className`, `attributes`, `dataset`, `style`, `children`,
 * `shadowRootMode`, `adoptedStyleSheets`, `namespaceURI`, `on`, `use`) are handled
 * by the renderer. All other keys are treated as element properties and bound reactively.
 *
 * @category Render
 */
export interface RenderConfig extends Record<string, ReactiveValue<unknown>> {
  /** A tag string, optionally with id and class selectors
   * (e.g., `"div#id1.cls1.cls2"`), an HTML markup, or existing element. */
  use?: string | Element;
  /** Map of event names to handler functions. Includes native DOM events and
   * lifecycle events: `mounted`, `removed`, `updated`. */
  on?: Record<string, (event: Event) => void>;
  /** Tag name. */
  tagName?: string;
  /** CSS class name(s) applied to the element. */
  className?: ReactiveValue<string | string[]>;
  /** Map of HTML attributes to set on the element. */
  attributes?: ReactiveValue<Record<string, unknown>>;
  /** Map of `data-*` attributes to set on the element. */
  dataset?: ReactiveValue<Record<string, unknown>>;
  /** Map of inline CSS styles to apply. */
  style?: ReactiveValue<Record<string, unknown>>;
  /** Child nodes or config objects rendered inside the element. */
  children?: ReactiveValue<RenderChild[]>;
  /** Shadow DOM mode for attaching a shadow root to the element. */
  shadowRootMode?: "open" | "closed";
  /** Style sheets adopted by the shadow root. */
  adoptedStyleSheets?: CSSStyleSheet[];
  /** Explicit namespace URI; auto-detected for SVG and MathML when omitted. */
  namespaceURI?: string;
}

/**
 * Lifecycle event handlers for elements, triggered by {@link render}.
 *
 * @category Events
 */
export interface LifecycleEvents {
  /** Fired top-down when an element is appended to a parent. */
  mounted: (event: CustomEvent) => void;
  /** Fired top-down before cleanup when an element is removed from a parent. */
  removed: (event: CustomEvent) => void;
  /** Fired on the bound element after its property value changes. */
  updated: (
    event: CustomEvent & {
      detail: {
        /** The name of the changed property. */
        property: string;
        /** The property value before the change. */
        oldValue: unknown;
        /** The property value after the change. */
        newValue: unknown;
      };
    },
  ) => void;
}

/**
 * Checks whether a value is a plain Object or an Array.
 */
function isPlainObjectOrArray(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value.constructor === Object || value.constructor === Array)
  );
}

/**
 * Dispatches a custom event on the target element.
 */
function dispatchEvent(
  target: EventTarget,
  event: keyof LifecycleEvents,
  detail?: unknown,
): void {
  const { CustomEvent } = window;
  target.dispatchEvent(new CustomEvent(event, { detail }));
}

/**
 * Dispatch lifecycle events to child elements.
 */
function dispatchChildren(
  source: ParentNode,
  event: keyof LifecycleEvents,
): void {
  for (const child of source.children) {
    dispatchEvent(child, event);
  }
}
/**
 * Updates the element's class list by removing all current classes and adding new ones.
 */
function updateClassList(el: Element, classList: string[]): void {
  el.classList.remove(...el.classList);
  el.classList.add(...classList.filter(Boolean));
}

/**
 * Creates a DOM element from a tag string that may contain optional id and class selectors.
 */
function createElement(use: unknown, ns?: string | null): Element {
  const { document, Element, customElements } = window;
  const classList: string[] = [];
  let tagName = "div";
  let id, el;

  if (typeof use === "string") {
    if (HTML_RE.test(use)) {
      // Parse HTML markup string.
      const div = document.createElement("div");
      div.innerHTML = use;
      if (div.firstChild instanceof Element) {
        el = div.firstChild;
        tagName = el.tagName;
      }
    } else {
      // Parse tag string with optional id and class selectors.
      const match = use.match(PARSE_TAG_RE) || [];
      for (const item of match) {
        const firstChar = item[0];
        if (firstChar === ".") classList.push(item.slice(1));
        else if (firstChar === "#") id = item.slice(1);
        else tagName = item;
      }
    }
  } else if (use instanceof Element) {
    // Return existing element.
    el = use;
    tagName = el.tagName;
  }

  if (!el) {
    const CustomElement = customElements?.get(tagName);
    if (CustomElement) return new CustomElement();

    // Resolve namespace: explicit > auto-detect from tag. XHTML is default.
    const lowNS = tagName.toLowerCase();
    let resolvedNs = ns === XHTML_NS ? null : ns;
    if (!resolvedNs) {
      const nsMap = { svg: SVG_NS, math: MATH_NS } as Record<string, string>;
      resolvedNs = nsMap[lowNS];
    }

    el = resolvedNs
      ? document.createElementNS(resolvedNs, tagName)
      : document.createElement(tagName);
  }

  // Apply id and class names.
  if (id) el.id = id;
  if (classList.length) updateClassList(el, classList);

  return el;
}

/**
 * Creates a DOM node from a configuration value.
 */
function createNode(
  context: object | void,
  config: unknown,
  ns: string | null = null,
): Node {
  const { document, Node } = window;

  if (typeof config === "function") {
    const fn = config;
    config = untrack.call(context, () => fn());
  }
  if (config instanceof Node) {
    return config;
  }
  if (typeof config === "string") {
    return document.createTextNode(config);
  }
  if (Array.isArray(config)) {
    const fragment = document.createDocumentFragment();
    for (const item of config) {
      const child = createNode(context, item, ns);
      fragment.appendChild(child);
    }
    return fragment;
  }

  const {
    use,
    tagName = "div",
    namespaceURI = ns,
    shadowRootMode,
    adoptedStyleSheets,
    on,
    ...rest
  } = isPlainObjectOrArray(config) ? (config as Record<string, any>) : {};

  // Create or parse the element.
  const el = createElement(use || tagName, namespaceURI);
  ns = el.namespaceURI;

  // Binding lifecycle management.
  const bindings = new Map<string, Array<() => void>>();
  const prevValues = new Map<string, unknown>();

  const dispose = (key?: string) => {
    for (const [k, fns] of bindings.entries()) {
      if (!key || k.startsWith(key)) {
        for (const fn of fns) fn();
        if (!key) break;
        bindings.delete(k);
      }
    }
    if (!key) bindings.clear();
  };

  const allocate = (key: string, fn: () => void) => {
    const fns = bindings.get(key);
    if (fns) fns.push(fn);
    else bindings.set(key, [fn]);
  };

  // Attach shadow root.
  let shadowRoot: ShadowRoot | undefined;
  if (shadowRootMode) {
    shadowRoot = el.attachShadow({ mode: shadowRootMode });
    if (adoptedStyleSheets?.length)
      shadowRoot.adoptedStyleSheets = adoptedStyleSheets;
  }

  // Bind event listeners.
  if (on) {
    for (const ev in on) {
      if (typeof on[ev] === "function") {
        el.addEventListener(ev, on[ev].bind(el));
      }
    }
  }

  el.addEventListener("removed", (e: Event) => {
    dispose();
    dispatchChildren(el, "removed");
  });

  el.addEventListener("refresh", (e: Event) => {
    const custom = e as CustomEvent<unknown>;
    if (!custom.detail) {
      patchNode(rest);
    } else {
      for (const prop of Array.isArray(custom.detail)
        ? custom.detail
        : [custom.detail]) {
        const str = String(prop);
        const pathParts = str.split(".");
        const params = pathParts.reduce<Record<string, unknown> | undefined>(
          (acc, k, index) => {
            if (acc === undefined) return;
            if (index >= pathParts.length - 1) return { [k]: acc[k] };
            return acc[k] as Record<string, unknown>;
          },
          rest,
        );
        patchNode(params, pathParts.slice(0, -1));
      }
    }
  });

  // Apply reactive bindings.
  const patchNode = (
    params: Record<PropertyKey, unknown> | undefined,
    path: string[] = [],
  ): void => {
    if (!params) return;

    // Helpers defined once per patch call.
    const isEmpty = (v: unknown) => v == null;
    const isClear = (val: unknown) =>
      !isPlainObjectOrArray(val) ||
      Object.keys(val as Record<PropertyKey, unknown>).length === 0;

    for (const key in params) {
      const subpath = [...path, key];
      const pathKey = subpath.join(".");
      const [root, prop] = subpath;
      const getter = params[key];

      // Invariant flags — computed once per property binding.
      const isChildren = root === "children";
      const isClass = root === "className" || root === "classList";
      const isStyleProp = root === "style";
      const isDataProp = root === "dataset";

      const setter = (value: unknown) => {
        let newValue: unknown;
        // Children.
        if (isChildren) {
          const target = shadowRoot ?? el;
          const fragment = createNode(context, value, ns);
          if (fragment instanceof Node) {
            const newNodesList =
              fragment.nodeType === Node.DOCUMENT_FRAGMENT_NODE
                ? Array.from(fragment.childNodes)
                : [fragment];
            const [added, removed] = syncDOM(
              target,
              Array.from(target.childNodes),
              newNodesList,
            );
            newValue = newNodesList;
            for (const node of removed) dispatchEvent(node, "removed");
            for (const node of added) dispatchEvent(node, "mounted");
          } else {
            dispatchChildren(target, "removed");
            if ("innerHTML" in target) target.innerHTML = "";
            dispose(pathKey + ".");
          }
        }
        // Class name.
        else if (isClass) {
          const classList = Array.isArray(value)
            ? value
            : String(value || "").split(" ");
          updateClassList(el, classList);
          newValue = classList;
        }
        // Attributes.
        else if (root === "attributes") {
          if (prop) {
            if (isEmpty(value)) el.removeAttribute(prop);
            else {
              const attrValue = String(value);
              el.setAttribute(prop, attrValue);
              newValue = attrValue;
            }
          } else if (isClear(value)) {
            while (el.attributes.length > 0)
              el.removeAttribute(el.attributes[0].name);
            dispose(pathKey + ".");
          } else {
            patchNode(value as Record<string, unknown>, subpath);
          }
        }
        // Inline style.
        else if (isStyleProp) {
          const style = (el as HTMLElement).style;
          if (prop && style) {
            if (UPPER_CASE_RE.test(prop)) {
              // Handle camelCase properties directly on the style object.
              const styleValue = isEmpty(value) ? "" : String(value);
              (style as unknown as Record<string, string>)[prop] = styleValue;
              newValue = styleValue;
            } else if (isEmpty(value)) {
              style.removeProperty(prop);
            } else {
              // Handle kebab-case properties via CSS property API.
              const styleValue = String(value);
              style.setProperty(prop, styleValue);
              newValue = styleValue;
            }
          } else if (isClear(value)) {
            el.removeAttribute("style");
            dispose(pathKey + ".");
          } else {
            patchNode(value as Record<string, unknown>, subpath);
          }
        }
        // Data attributes.
        else if (isDataProp) {
          const data = (el as HTMLElement).dataset;
          if (prop && data) {
            if (isEmpty(value)) {
              delete data[prop];
            } else {
              const dataValue = String(value);
              data[prop] = dataValue;
              newValue = dataValue;
            }
          } else if (isClear(value)) {
            Object.keys(data).forEach((dk) => delete data[dk]);
            dispose(pathKey + ".");
          } else {
            patchNode(value as Record<string, unknown>, subpath);
          }
        }
        // Custom properties.
        else {
          let current = el as unknown as Record<PropertyKey, unknown>;
          let finalKey = key;
          for (let i = 0; i < subpath.length - 1; i++) {
            const segment = subpath[i];
            if (!(segment in current)) current[segment] = {};
            current = current[segment] as Record<PropertyKey, unknown>;
            finalKey = subpath[i + 1];
          }
          if (isEmpty(value)) {
            delete current[finalKey];
            dispose(pathKey + ".");
          } else {
            current[finalKey] = value;
            newValue = value;
          }
        }

        // Dispatch "updated" on value change.
        const oldValue = prevValues.get(pathKey);
        if (oldValue !== undefined && newValue !== oldValue) {
          dispatchEvent(el, "updated", {
            property: pathKey,
            oldValue,
            newValue,
          });
        }
        prevValues.set(pathKey, newValue);
      };

      dispose(pathKey);
      if (typeof getter === "function") {
        allocate(pathKey, effect.call(context, getter.bind(el), setter));
      } else {
        setter(getter);
      }
    }
  };

  // Initial render.
  patchNode(rest);

  return el;
}

/**
 * Synchronizes a parent node children by diffing old and new node lists.
 * Returns a tuple of newly inserted and removed nodes.
 */
function syncDOM(
  parent: Node,
  oldList: Node[],
  newList: Node[],
): [Node[], Node[]] {
  let oldStart = 0;
  let newStart = 0;
  let oldEnd = oldList.length - 1;
  let newEnd = newList.length - 1;

  // Skip matching prefix.
  while (
    oldStart <= oldEnd &&
    newStart <= newEnd &&
    oldList[oldStart].isEqualNode(newList[newStart])
  ) {
    oldStart++;
    newStart++;
  }

  // Skip matching suffix.
  while (
    oldStart <= oldEnd &&
    newStart <= newEnd &&
    oldList[oldEnd].isEqualNode(newList[newEnd])
  ) {
    oldEnd--;
    newEnd--;
  }

  // Diff remaining nodes.
  const used = new Set<number>();
  const newNodes: Node[] = [];
  let prev: Node | null = oldStart > 0 ? oldList[oldStart - 1] : null;

  for (let i = newStart; i <= newEnd; i++) {
    const newNode = newList[i];
    let match = -1;

    // Find structural match in remaining old nodes.
    for (let j = oldStart; j <= oldEnd; j++) {
      if (!used.has(j) && oldList[j].isEqualNode(newNode)) {
        match = j;
        break;
      }
    }

    const existing = match >= 0 ? oldList[match] : newNode;
    if (match >= 0) used.add(match);

    // Insert if not already in the correct position.
    const target = prev ? prev.nextSibling : parent.firstChild;
    if (existing !== target) {
      parent.insertBefore(existing, target);
    }
    // Track new nodes.
    if (match < 0) {
      newNodes.push(existing);
    }

    prev = existing;
  }

  // Remove unmatched old nodes.
  const oldNodes: Node[] = [];
  for (let i = oldEnd; i >= oldStart; i--) {
    if (!used.has(i)) {
      const node = oldList[i];
      oldNodes.push(node);
      parent.removeChild(node);
    }
  }

  return [newNodes, oldNodes];
}

/**
 * Creates a DOM node from a configuration value.
 *
 * Handles the following config types:
 * - `Function` — invoked in the given context (untracked), result processed recursively.
 * - `Node` — returned as-is.
 * - `string` — becomes a text node.
 * - `Array` — becomes a `DocumentFragment` with rendered children.
 * - `object` — parsed as a {@link RenderConfig} with reactive bindings via effects.
 *
 * Lifecycle events are dispatched by the render layer (see {@link LifecycleEvents}):
 * - `mounted` — fires top-down when the element is appended to a parent.
 * - `removed` — fires top-down when the element is removed from a parent.
 * - `updated` — fires when a specific property is updated.
 *
 * @category Render
 *
 * @this {object} Reactive context for signal tracking; defaults to the global context when omitted.
 *     See {@link signal} for the reactive context API.
 * @param config A node configuration — string, Node, object, or array.
 * @param target A parent element or CSS selector string to append the result into.
 *
 * @example
 * ```ts
 * const state = signal({ count: 0 });
 * const el = render({
 *   tagName: "button",
 *   className: () => state.count > 0 ? "active" : "",
 *   textContent: () => `Counter: ${state.count}`,
 *   on: { click: () => state.count++ },
 * }, document.body);
 * // el is `<button>Counter: 0</button>`
 * ```
 */
export function render(
  this: object | void,
  config?: ReactiveValue<RenderChild> | ReactiveValue<RenderChild[]>,
  target?: Element | DocumentFragment | string,
): Node {
  const { document, DocumentFragment } = window;
  const el = createNode(this, config);
  const parent =
    typeof target === "string" ? document.querySelector(target) : target;
  if (parent) {
    parent.appendChild(el);
    dispatchChildren(parent, "mounted");
  } else if (el instanceof DocumentFragment) {
    dispatchChildren(el, "mounted");
  } else {
    dispatchEvent(el, "mounted");
  }
  return el;
}
