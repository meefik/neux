/**
 * Declarative DOM rendering with reactive bindings.
 *
 * Parses tag selectors, creates elements (including SVG/MathML), and diffs
 * reactive children directly against the real DOM, with no virtual DOM.
 * Property accesses inside callbacks are tracked by signal effects, so updates
 * flow automatically on change.
 *
 * @module render
 */

import { getOrCreate, hasOwn } from "./helpers.js";
import { effect } from "./signal.js";

/** XML namespace URIs for auto-detection and explicit assignment. */
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const MATH_NS = "http://www.w3.org/1998/Math/MathML";

/** Namespaces auto-detected from the tag name. */
const NS_BY_TAG: Record<string, string> = { svg: SVG_NS, math: MATH_NS };

/** Patterns for detecting markup, parsing tag selectors, and splitting class names. */
const HTML_RE = /[^a-zA-Z0-9-_.#]/u;
const PARSE_TAG_RE = /([.#]?[^\s#.]+)/gu;
const WHITESPACE_RE = /\s+/u;

/**
 * A value that is either the desired type directly, or a function that returns it.
 *
 * When a function is provided, it will be called inside a reactive
 * {@link effect} so that its return value updates automatically when
 * tracked properties change. The function may be async: only the latest
 * resolved value is applied.
 *
 * @category Render
 *
 * @typeParam T The type of the value.
 */
export type ReactiveProperty<T> = T | ((this: Node) => T | Promise<T>);

/**
 * A single class name entry. `null`, `undefined`, and booleans are skipped;
 * strings and numbers are used as is (`0` is a value, and an empty string adds
 * no class). Entries are split on whitespace.
 *
 * @category Render
 */
export type ClassName = string | number | boolean | null | undefined;

/**
 * A child node config value that can be passed to render or used as children.
 * `null`, `undefined`, and booleans are skipped; strings and numbers are used
 * as is (`0` is a value, and an empty string renders an empty text node).
 *
 * @category Render
 */
export type NodeConfig =
  Node | string | number | boolean | null | undefined | ElementConfig;

/**
 * A list of child node configs. Nested lists are flattened in order, so a
 * component may return a list inside a list.
 *
 * @category Render
 */
export type NodeConfigList = (NodeConfig | NodeConfigList)[];

/**
 * Configuration object passed to {@link render} or used as a child config.
 *
 * Known keys (`tagName`, `className`, `classList`, `attributes`, `dataset`, `style`, `children`,
 * `shadowRootMode`, `adoptedStyleSheets`, `namespaceURI`, `on`, `use`) are handled
 * by the renderer. All other keys are treated as element properties and bound reactively; a function nested inside an object value is assigned as is, not bound.
 *
 * @category Render
 */
export type ElementConfig = {
  /** Tag name. */
  tagName?: string;
  /** CSS class name(s) applied to the element. `null`, `undefined`, and booleans are skipped; strings and numbers are used as is; entries are split on whitespace. */
  className?: ReactiveProperty<ClassName | ClassName[]>;
  /** Alias of `className`; the two share one class list, so set only one of them. */
  classList?: ReactiveProperty<ClassName | ClassName[]>;
  /** Map of HTML attributes to set on the element. Values are converted to strings (`false` becomes `"false"`); `null` or `undefined` removes the attribute. Set boolean attributes such as `disabled` as element properties instead. */
  attributes?: ReactiveProperty<
    Record<string, ReactiveProperty<unknown>> & ThisType<Node>
  >;
  /** Map of `data-*` attributes to set on the element. */
  dataset?: ReactiveProperty<
    Record<string, ReactiveProperty<unknown>> & ThisType<Node>
  >;
  /** Map of inline CSS styles to apply. Keys are style property names in camelCase (`backgroundColor`) or kebab-case (`background-color`); `null` or `undefined` clears the property. */
  style?: ReactiveProperty<
    Record<string, ReactiveProperty<unknown>> & ThisType<Node>
  >;
  /** Child nodes or config objects rendered inside the element. `null`, `undefined`, and booleans are skipped; strings and numbers render as text nodes (`0` is a value). An existing `Node` is inserted as is, unless an equal child is already there: that child is kept instead, and the supplied node is left untouched. */
  children?: ReactiveProperty<NodeConfig | NodeConfigList>;
  /** Shadow DOM mode for attaching a shadow root to the element. */
  shadowRootMode?: "open" | "closed";
  /** Style sheets adopted by the shadow root. */
  adoptedStyleSheets?: CSSStyleSheet[];
  /** Explicit namespace URI; auto-detected for SVG and MathML when omitted. */
  namespaceURI?: string;
  /** Map of event names to handler functions. Includes native DOM events and
   * lifecycle events: `mounted`, `removed`, `updated`. */
  on?: Partial<ElementLifecycle> &
    Record<string, (this: Node, event: any) => void>;
  /** A tag string, optionally with id and class selectors
   * (e.g., `"div#id1.cls1.cls2"`), HTML markup, or an existing element;
   * takes precedence over `tagName`. Render a given element only once:
   * rendering it again attaches its event listeners and bindings a second time. */
  use?: string | Element;
} & Record<string, ReactiveProperty<unknown>> &
  ThisType<Node>;

/**
 * Lifecycle event handlers for elements, triggered by {@link render}.
 *
 * @category Events
 */
export interface ElementLifecycle {
  /** Fired top-down (this element before its children), the same order as `removed`, when the element is appended to a parent — on both the initial mount and a re-mount. */
  mounted: (this: Node, event: CustomEvent) => void;
  /** Fired top-down before cleanup when a `children` update removes the element from a parent; DOM removals such as `el.remove()` do not fire it. Always paired with `mounted`: nodes discarded by a reactive re-render are never inserted, so they are disposed internally without firing it. */
  removed: (this: Node, event: CustomEvent) => void;
  /** Fired on the bound element after its property value changes; not fired when a re-run resolves to the same value, for the first applied value, or for a change from a cleared (`null` or `undefined`) binding. For `className`, the values are the applied class names; for `children`, the child nodes in the DOM. */
  updated: (
    this: Node,
    event: CustomEvent<{
      /** The name of the changed property. */
      property: string;
      /** The property value before the change. */
      oldValue: unknown;
      /** The property value after the change. */
      newValue: unknown;
    }>,
  ) => void;
}

/**
 * Checks whether a value is a plain object (including one with a null
 * prototype) or an array.
 */
function isPlainObjectOrArray(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (Array.isArray(value) ||
      [Object.prototype, null].includes(Object.getPrototypeOf(value)))
  );
}

/**
 * Dispatches a custom event on the target element.
 */
function dispatchEvent(
  target: EventTarget,
  event: keyof ElementLifecycle,
  detail?: unknown,
): void {
  target.dispatchEvent(new window.CustomEvent(event, { detail }));
}

/** Neux state kept on a node, under the private {@link STATE} key. */
interface NodeState {
  /**
   * Releases the reactive bindings of an element built by `createNode`, so a
   * node discarded without any lifecycle event can release its effects.
   */
  dispose?: () => void;
  /** The shadow root attached by `createNode`, including a closed one that `shadowRoot` hides. */
  shadow?: ShadowRoot;
  /**
   * Set while the node is inserted into a parent and not yet removed. Keeps
   * `mounted`/`removed` strictly paired: without it, rebuilding a re-mounted
   * element re-fires `mounted` for a child the re-patch already inserted, and
   * the re-patch diff re-fires `removed` for a child already detached with its
   * parent.
   */
  mounted?: boolean;
}

/** Key of the {@link NodeState} on a node; it is collected with the node. */
const STATE: unique symbol = Symbol();

/** A node that may carry Neux state. */
type StatefulNode = Node & { [STATE]?: NodeState };

/** Returns the state of a node, creating it on first use. */
function stateOf(node: Node): NodeState {
  const stateful = node as StatefulNode;
  return stateful[STATE] ?? (stateful[STATE] = {});
}

/**
 * The synchronous build in progress: a {@link render} call, a `children`
 * update, or a re-mount rebuild. A `mounted` request is only *armed*; the
 * whole build flushes top-down once the outermost build finishes, so the event
 * order matches the documented contract (parent before children) instead of
 * the build order (children before parent).
 */
let depth = 0;
/** Nodes armed for `mounted`, flushed by {@link flushMounts}. */
const armed = new Set<Node>();

/**
 * Lists the child nodes of a node in tree order: those of its shadow root
 * (attached by Neux or by the element itself), then its light DOM children.
 */
function childNodesOf(node: Node): Node[] {
  const root =
    (node as StatefulNode)[STATE]?.shadow ?? (node as Element).shadowRoot;
  return [...(root?.childNodes ?? []), ...node.childNodes];
}

/**
 * Releases a node's own reactive bindings, and recursively those of its child
 * nodes, without firing any lifecycle events. Used for a freshly created node
 * that the diff did not keep: it was never inserted into the DOM, so it never
 * received `mounted` — and must not fire `removed` either. Its descendants are
 * disarmed, so none of them receives `mounted` either.
 */
function destroyNode(root: Node): void {
  armed.delete(root);
  (root as StatefulNode)[STATE]?.dispose?.();
  for (const child of childNodesOf(root)) destroyNode(child);
}

/** Runs `fn` as a build: `mounted` requests armed inside it fire once the outermost build ends. */
function build<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    flushMounts();
  }
}

/**
 * Fires `mounted` on `node` and then, in tree order, on each of its child
 * nodes (shadow-root children included) — a top-down cascade. Text nodes are
 * reached too, so none stays armed after a re-mount rebuilds its children.
 * Reused or already-mounted descendants are skipped, and a `mounted` handler
 * that mutates the child list is respected because the children are
 * snapshotted after the node's own event is dispatched (so children a handler
 * rebuilds are still reached, in order).
 */
function fireMount(node: Node): void {
  const state = stateOf(node);
  if (state.mounted) return;
  armed.delete(node);
  state.mounted = true;
  dispatchEvent(node, "mounted");
  for (const child of childNodesOf(node)) fireMount(child);
}

/**
 * Leaves the current build and, at the outermost boundary, fires the armed
 * `mounted` requests top-down, in document order: an armed node is reached by
 * its ancestor's cascade, so by the time its own turn comes it is already
 * mounted and skipped. Nodes the diff dropped were already disarmed by
 * {@link destroyNode}, preserving the `mounted`/`removed` pairing.
 */
function flushMounts(): void {
  if (--depth) return;
  // Document order puts an ancestor before its descendants, which `fireMount`
  // reaches through the ancestor's cascade; armed order is children first.
  // 4 is `Node.DOCUMENT_POSITION_FOLLOWING`.
  const nodes = [...armed].sort((a, b) =>
    a.compareDocumentPosition(b) & 4 ? -1 : 1,
  );
  armed.clear();
  for (const node of nodes) fireMount(node);
}

/**
 * Dispatches `removed` on `node`, at most once per insertion, and then, in tree
 * order, on each of its child nodes (shadow-root children included) — the
 * top-down mirror of {@link fireMount}. The cascade passes through nodes that
 * Neux did not build, such as a supplied wrapper element, so the Neux elements
 * inside them still release their bindings.
 */
function unmountNode(node: Node): void {
  const state = (node as StatefulNode)[STATE];
  if (!state?.mounted) return;
  state.mounted = false;
  dispatchEvent(node, "removed");
  for (const child of childNodesOf(node)) unmountNode(child);
}

/**
 * Updates the element's class list by removing all current classes and adding new ones.
 * `null`, `undefined`, and booleans are skipped; entries are split on whitespace.
 * Returns the applied class names without duplicates.
 */
function updateClassList(el: Element, classList: ClassName[]): string[] {
  const names = new Set(
    classList.flatMap((c) =>
      c == null || typeof c === "boolean" ? [] : String(c).split(WHITESPACE_RE),
    ),
  );
  names.delete("");
  el.classList.remove(...el.classList);
  el.classList.add(...names);
  return [...names];
}

/**
 * Creates an element from a tag string with optional id and class selectors,
 * parses one from HTML markup, or returns a given element as is. Registered
 * custom elements are constructed directly.
 */
function createElement(use: unknown, ns?: string | null): Element {
  const { document, Element, customElements } = window;
  const classList: string[] = [];
  let tagName = "div";
  let id: string | undefined;
  let el: Element | undefined;

  if (typeof use === "string") {
    // Surrounding whitespace is not part of a tag or markup.
    const source = use.trim();
    if (HTML_RE.test(source)) {
      // Parse HTML markup string. A template accepts any element, such as `<tr>`.
      const template = document.createElement("template");
      template.innerHTML = source;
      const content = document.importNode(template.content, true);
      el = content.firstElementChild ?? undefined;
      el?.remove();
    } else {
      // Parse tag string with optional id and class selectors.
      for (const item of source.match(PARSE_TAG_RE) ?? []) {
        if (item[0] === ".") classList.push(item.slice(1));
        else if (item[0] === "#") id = item.slice(1);
        else tagName = item;
      }
    }
  } else if (use instanceof Element) {
    // Return existing element.
    el = use;
  }

  if (!el) {
    const CustomElement = customElements?.get(tagName);
    if (CustomElement) el = new CustomElement();
    else {
      // Resolve namespace: explicit > auto-detect from tag. XHTML is default.
      const resolvedNs =
        (ns !== XHTML_NS && ns) || NS_BY_TAG[tagName.toLowerCase()];
      el = resolvedNs
        ? document.createElementNS(resolvedNs, tagName)
        : document.createElement(tagName);
    }
  }

  // Apply id and class names.
  if (id) el.id = id;
  if (classList.length) updateClassList(el, classList);

  return el;
}

/**
 * Creates a DOM node from a configuration value; an array yields a flat list
 * of nodes, and a value that renders nothing yields `null`. Each element built
 * with bindings is pushed to `created`, so the caller can release the ones it
 * discards; a supplied `Node` is not, as it may be live elsewhere.
 */
function createNode(
  context: object | void,
  config: unknown,
  ns: string | null = null,
  created?: Node[],
): Node | Node[] | null {
  if (config == null || typeof config === "boolean") {
    return null;
  }
  const { document, Node } = window;

  if (config instanceof Node) return config;
  if (typeof config === "string" || typeof config === "number") {
    return document.createTextNode(String(config));
  }
  if (Array.isArray(config)) {
    return config.flatMap(
      (item) => createNode(context, item, ns, created) ?? [],
    );
  }

  if (!isPlainObjectOrArray(config)) return null;

  const {
    use,
    tagName = "div",
    namespaceURI = ns,
    shadowRootMode,
    adoptedStyleSheets,
    on,
    ...rest
  } = config as Record<string, any>;

  // Create or parse the element.
  const el = createElement(use || tagName, namespaceURI);
  // Children of `foreignObject` are HTML again.
  ns = el.localName === "foreignObject" ? XHTML_NS : el.namespaceURI;

  // Binding lifecycle management.
  const bindings = new Map<string, Array<() => void>>();
  const prevValues = new Map<string, unknown>();
  // Keys applied by each reactive map (`attributes`, `style`, `dataset`), so keys it drops are cleared.
  const mapKeys = new Map<string, Set<string>>();
  // Property values from before the first binding, restored when a binding is cleared.
  const originals = new Map<string, unknown>();

  // Releases all bindings; with `key`, only that binding and its nested ones
  // (`key.*`); with `nested`, only the nested ones.
  const dispose = (key?: string, nested = false) => {
    for (const [k, fns] of bindings) {
      if (!key || (!nested && k === key) || k.startsWith(`${key}.`)) {
        for (const fn of fns) fn();
        bindings.delete(k);
      }
    }
  };

  // Register the disposer so `destroyNode` can release these bindings if
  // this node is discarded without ever being inserted.
  const state = stateOf(el);
  state.dispose = dispose;
  created?.push(el);

  // Attach shadow root.
  let shadowRoot: ShadowRoot | undefined;
  if (shadowRootMode) {
    shadowRoot = state.shadow = el.attachShadow({ mode: shadowRootMode });
    if (adoptedStyleSheets?.length)
      shadowRoot.adoptedStyleSheets = adoptedStyleSheets;
  }

  // Tracks whether this element currently holds live reactive bindings.
  let alive = true;

  // A node removed from the tree may be inserted again later (e.g. a reused
  // instance toggled in and out of a child list). Removal releases its
  // bindings, so a genuine re-mount must rebuild them; otherwise the node
  // would be inert. Skipped on the first mount, where bindings are already live.
  // Registered before the user's listeners so their `mounted` handlers see the
  // rebuilt state. The child cascade is handled by `fireMount`, which walks
  // down after this listener has rebuilt the fresh children.
  el.addEventListener("mounted", () => {
    if (alive) return;
    alive = true;
    // The rebuild may create fresh children. Their `mounted` is only armed:
    // no flush happens here, because this runs inside `fireMount`, whose
    // cascade reaches them after this element's own handlers have run.
    depth++;
    try {
      patchNode(rest);
    } finally {
      depth--;
    }
  });

  // Bind event listeners.
  if (on) {
    for (const ev in on) {
      if (typeof on[ev] === "function") {
        el.addEventListener(ev, on[ev].bind(el));
      }
    }
  }

  // The child cascade is handled by `unmountNode`, after this listener.
  el.addEventListener("removed", () => {
    alive = false;
    dispose();
  });

  el.addEventListener("refresh", (e) => {
    // A removed element holds no bindings; a re-mount rebuilds them.
    if (!alive) return;
    const { detail } = e as CustomEvent<unknown>;
    if (!detail) return patchNode(rest);
    for (const prop of Array.isArray(detail) ? detail : [detail]) {
      // Re-patch a single property, e.g. "style.color" from `rest.style`.
      // A function on the way is a reactive map, which re-runs as a whole.
      const keys = String(prop).split(".");
      let parent: any = rest;
      let i = 0;
      while (
        i < keys.length - 1 &&
        parent &&
        typeof parent[keys[i]] !== "function"
      ) {
        parent = parent[keys[i++]];
      }
      const key = keys[i];
      // A property the config does not bind is left as is.
      if (parent && hasOwn(parent, key)) {
        patchNode({ [key]: parent[key] }, keys.slice(0, i));
      }
    }
  });

  // Applies a map value key by key; keys dropped since its last run are
  // cleared, so a non-object value clears only what the map itself applied.
  const patchMap = (value: unknown, subpath: string[], pathKey: string) => {
    const map = isPlainObjectOrArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const keys = new Set(Object.keys(map));
    for (const k of mapKeys.get(pathKey) ?? []) {
      if (!keys.has(k)) patchNode({ [k]: undefined }, subpath);
    }
    mapKeys.set(pathKey, keys);
    patchNode(map, subpath);
  };

  // Apply reactive bindings.
  const patchNode = (
    params: Record<PropertyKey, unknown> | undefined,
    path: string[] = [],
  ): void => {
    if (!params) return;

    for (const key in params) {
      const subpath = [...path, key];
      const pathKey = subpath.join(".");
      const [root, prop] = subpath;
      const getter = params[key];

      const setter = (value: unknown) => {
        let newValue: unknown;
        // Children.
        if (root === "children") {
          const target = shadowRoot ?? el;
          // Fresh descendants arm their `mounted`; the build fires them top-down
          // at the outermost boundary instead of during creation (before their parent).
          build(() => {
            const created: Node[] = [];
            try {
              const newNodes = createNode(
                context,
                [value],
                ns,
                created,
              ) as Node[];
              const [added, removed] = syncDOM(
                target,
                Array.from(target.childNodes),
                newNodes,
              );
              for (const node of removed) unmountNode(node);
              for (const node of added) armed.add(node);
            } finally {
              // syncDOM may keep an old node and drop a fresh one (structural
              // match), and a binding that throws aborts the build. A node that
              // never entered the DOM must not fire `removed`; release its
              // bindings silently. Supplied nodes may be live elsewhere and are
              // left alone.
              for (const node of created) {
                if (node.parentNode !== target) destroyNode(node);
              }
            }
          });
          // The nodes now in the DOM; the previous array is kept when they are unchanged.
          const nodes = Array.from(target.childNodes);
          const prev = prevValues.get(pathKey) as Node[] | undefined;
          const same =
            prev?.length === nodes.length &&
            prev.every((node, i) => node === nodes[i]);
          newValue = same ? prev : nodes;
        }
        // Class name.
        else if (root === "className" || root === "classList") {
          const names = updateClassList(
            el,
            Array.isArray(value) ? value : [value],
          );
          // Keep the previous array for an unchanged class set, so no `updated` fires.
          const prev = prevValues.get(pathKey) as string[] | undefined;
          newValue = prev?.join(" ") === names.join(" ") ? prev : names;
        }
        // Attributes, inline style, and data attributes.
        else if (
          root === "attributes" ||
          root === "style" ||
          root === "dataset"
        ) {
          const { style, dataset } = el as HTMLElement;
          if (prop && (root === "attributes" || (style && dataset))) {
            const str = value == null ? undefined : String(value);
            newValue = str;
            if (root === "attributes") {
              if (str === undefined) el.removeAttribute(prop);
              else el.setAttribute(prop, str);
            } else if (root === "dataset") {
              if (str === undefined) delete dataset[prop];
              else dataset[prop] = str;
            } else if (prop.includes("-")) {
              // Kebab-case and custom properties (`--myColor`, case-sensitive)
              // go through the CSS API; an empty value removes the property.
              style.setProperty(prop, str ?? "");
            } else {
              (style as unknown as Record<string, string>)[prop] = str ?? "";
            }
          } else {
            patchMap(value, subpath, pathKey);
            if (root === "style" && !style?.length) el.removeAttribute("style");
          }
        }
        // Custom properties.
        else {
          let current = el as unknown as Record<PropertyKey, unknown>;
          for (const segment of path) {
            // Copy plain objects, so the user's config keeps its functions.
            const next = current[segment];
            current[segment] = isPlainObjectOrArray(next)
              ? Object.assign(Array.isArray(next) ? [] : {}, next)
              : (next ?? {});
            current = current[segment] as Record<PropertyKey, unknown>;
          }
          if (!originals.has(pathKey)) originals.set(pathKey, current[key]);
          if (value == null) {
            // Own properties are deleted; accessors (e.g. `textContent`) are reset.
            const original = originals.get(pathKey);
            if (original === undefined) delete current[key];
            else current[key] = original;
            dispose(pathKey, true);
          } else {
            current[key] = value;
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
        getOrCreate(bindings, pathKey, () => []).push(
          effect.call(context, getter.bind(el), setter),
        );
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
 * Checks whether an old child can stand in for a desired node: the same node,
 * or a structurally equal one. Equal-looking siblings are interchangeable, so a
 * node that must stay distinct needs a distinguishing attribute.
 */
function isSame(oldNode: Node, newNode: Node): boolean {
  return oldNode === newNode || oldNode.isEqualNode(newNode);
}

/**
 * Returns a key that equal nodes share (their markup, or their type and text),
 * so old candidates are found by lookup instead of by comparing every pair.
 * Nodes with the same key are still checked with {@link isSame}.
 */
function keyOf(node: Node): string {
  return node instanceof window.Element
    ? node.outerHTML
    : `${node.nodeType}:${node.nodeValue}`;
}

/**
 * Synchronizes a parent node's children by diffing old and new node lists.
 * Returns a tuple of newly inserted and removed nodes.
 */
function syncDOM(
  parent: Node,
  oldList: (Node | null)[],
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
    isSame(oldList[oldStart]!, newList[newStart])
  ) {
    oldStart++;
    newStart++;
  }

  // Skip matching suffix.
  while (
    oldStart <= oldEnd &&
    newStart <= newEnd &&
    isSame(oldList[oldEnd]!, newList[newEnd])
  ) {
    oldEnd--;
    newEnd--;
  }

  // Diff remaining nodes. Old nodes are indexed by key, in list order; a
  // matched one is cleared from `oldList`, so what is left is removed.
  const added: Node[] = [];
  const index = new Map<string, number[]>();
  for (let j = oldStart; j <= oldEnd; j++) {
    getOrCreate(index, keyOf(oldList[j]!), () => []).push(j);
  }
  let prev = oldStart > 0 ? oldList[oldStart - 1] : null;

  for (let i = newStart; i <= newEnd; i++) {
    const newNode = newList[i];
    let existing: Node | null = null;

    // Take the first unused old node with the same key that is the same.
    const candidates = index.get(keyOf(newNode));
    while (candidates?.length && !existing) {
      const j = candidates.shift()!;
      if (isSame(oldList[j]!, newNode)) {
        existing = oldList[j];
        oldList[j] = null;
      }
    }
    if (!existing) added.push((existing = newNode));

    // Insert if not already in the correct position.
    const target = prev ? prev.nextSibling : parent.firstChild;
    if (existing !== target) parent.insertBefore(existing, target);

    prev = existing;
  }

  // Remove unmatched old nodes.
  const removed: Node[] = [];
  for (let i = oldEnd; i >= oldStart; i--) {
    const node = oldList[i];
    if (node) removed.push(parent.removeChild(node));
  }

  return [added, removed];
}

/**
 * Creates DOM nodes from an array of configurations.
 *
 * @category Render
 *
 * @this {object} Reactive context for signal tracking; defaults to the global context when omitted.
 * @param config An array of node configurations; nested arrays are flattened in order.
 * @param target A parent element or CSS selector string to append the results into. Without a target, or when the selector matches nothing, nothing is appended and the roots do not receive `mounted`; their children do.
 * @returns The created DOM nodes, in order.
 */
export function render<T extends Node[] = Node[]>(
  this: object | void,
  config: NodeConfigList,
  target?: Element | DocumentFragment | string,
): T;

/**
 * Renders nothing for a `boolean`, `null`, or `undefined` configuration.
 *
 * @category Render
 *
 * @this {object} Reactive context for signal tracking; defaults to the global context when omitted.
 * @param config A `boolean`, `null`, or `undefined` value.
 * @param target Ignored.
 * @returns Always `null`.
 */
export function render(
  this: object | void,
  config: boolean | null | undefined,
  target?: Element | DocumentFragment | string,
): null;

/**
 * Creates a DOM node from a configuration value.
 *
 * Handles the following config types:
 * - `Node` — returned as-is.
 * - `string` or `number` — becomes a text node.
 * - `Array` — becomes an array of rendered nodes (see the array overload).
 * - `boolean`, `null`, `undefined` — render nothing and return `null`.
 * - `object` — a plain object (or one with a null prototype) is parsed as a {@link ElementConfig} with reactive bindings via effects.
 * - anything else, such as a class instance, `Date`, function, or symbol — render nothing and return `null`; a `children` list skips it.
 *
 * Lifecycle events are dispatched by the render layer (see {@link ElementLifecycle}):
 * - `mounted` — fires top-down (this element before its children), the same order as `removed`, when the element is appended to a parent, on both the initial mount and a re-mount.
 * - `removed` — fires top-down when a `children` update removes the element from a parent. Always paired with `mounted`; nodes never inserted (e.g., replaced by an equal node during re-render) are destroyed silently.
 * - `updated` — fires when a specific property is updated to a different value; not for its first applied value, nor for a change from a cleared (`null` or `undefined`) binding. For `className`, the old and new values are arrays of the applied class names; for `children`, arrays of the child nodes in the DOM.
 *
 * @category Render
 *
 * @this {object} Reactive context for signal tracking; defaults to the global context when omitted.
 * @param config A node configuration — string, number, Node, or object.
 * @param target A parent element or CSS selector string to append the result into. Without a target, or when the selector matches nothing, nothing is appended and the root does not receive `mounted`; its children do.
 * @returns The created DOM `Node`, appended to the target when one is given. At runtime a `boolean`, `null`, `undefined`, or unsupported config yields `null`; the type is `null` only when that is known statically (see the previous overload).
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
export function render<T extends Node = Node>(
  this: object | void,
  config: NodeConfig,
  target?: Element | DocumentFragment | string,
): T;

export function render(
  this: object | void,
  config: NodeConfig | NodeConfigList,
  target?: Element | DocumentFragment | string,
): Node | Node[] | null {
  return build(() => {
    const el = createNode(this, config);
    const parent =
      typeof target === "string"
        ? window.document.querySelector(target)
        : target;
    if (el && parent) {
      // Arm the root(s); the build fires the whole tree top-down.
      for (const node of Array.isArray(el) ? el : [el]) {
        parent.appendChild(node);
        armed.add(node);
      }
    }
    return el;
  });
}
