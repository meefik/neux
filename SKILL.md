---
name: neux
description: Keeps real DOM in sync with reactive signals through plain config objects. Use when creating signal state, defining components, binding properties, rendering lists with diffing, wiring side effects and lifecycle hooks, or adding i18n from the Neux library.
---

# Neux — Developer Skill

Neux keeps the real DOM **in sync** with reactive signal state through plain config objects. Follow the steps to create, mount, and sync UI correctly.

---

## Process

### Prerequisite — Install and import Neux

```sh
npm install neux
```

```js
import { render, signal, effect, untrack, i18n } from "neux";
```

**Done when:** `neux` is installed and required exports are imported.

### 1. Create reactive state with signal

```js
const state = signal({
  count: 0,
  items: [{ id: 1, text: "First", done: false }],
  // computed — re-evaluated on every read, tracked through the fields it reads
  get activeCount() {
    return this.items.filter((i) => !i.done).length;
  },
  // method — bound to the proxy so `this` works
  toggle(id) {
    const item = this.items.find((i) => i.id === id);
    if (item) item.done = !item.done;
  },
});
```

- A **signal** is a reactive `Proxy` wrapping an object or array. Property reads inside an active effect are tracked; writes schedule one batched re-run per tick of subscriber effects that stay in sync.
- Nested plain objects and arrays (`{}`, `[]`) wrap automatically. Class instances, `Map`, `Set`, `Date`, and null-prototype objects (`Object.create(null)`) do not: they are returned as is and are not reactive, so replace them instead of mutating them.
- A method stored in a signal reads as a bound copy: `state.fn === fn` is `false`, though `state.fn === state.fn` is `true`. A class is returned as is.
- Reading a read-only, non-configurable property that holds a nested object, array, or method throws a `TypeError`. This happens with `Object.freeze()` data, such as `signal(Object.freeze({ cfg: {} })).cfg`, but not with primitives or sealed objects. Keep frozen data outside the signal, or leave it unfrozen.
- Defining a property with `Object.defineProperty()` (or `Reflect.defineProperty()`) on a signal does not re-run effects. Assign the property instead.
- Methods bind automatically; access `this.foo` inside them to read reactive fields.
- Getters become computed derived values that keep their callers in sync.
- Replacing a nested property (`state.items = []`) keeps everything in sync — the new value is auto-wrapped reactively, and effects track the replacement on next run.
- Transitive tracking through getters and methods — reading a computed getter or calling a method inside an effect subscribes to both the outer access **and** any underlying `this` fields it reads. For example, `state.double` where the getter reads `this.count` stays in sync with changes to `double` **and** `count`, just as if you had read `state.count` directly.

**Done when:** state shape matches the UI requirements, mutations are expressed as methods, and derived values as computed getters on the signal.

### 2. Define components

Components follow plain function convention — return a **config** from any function.

```js
function Input({ name, type, placeholder, value, onChange }) {
  return {
    tagName: "input",
    type,
    name,
    value,
    placeholder,
    on: {
      change() {
        onChange(this.value.trim());
      },
    },
  };
}

function Submit({ label }) {
  return {
    tagName: "button",
    type: "submit",
    textContent: label,
  };
}
```

For stateful components, call `signal()` inside the component body so each instance gets isolated state in sync with its own subtree:

```js
function Form({ onSubmit }) {
  const state = signal({
    login: "",
    password: "",
    get isEmpty() {
      return !this.login || !this.password;
    },
  });
  return {
    tagName: "form",
    style: {
      display: "flex",
      flexDirection: "column",
      border: () => `2px solid ${state.isEmpty ? "red" : "green"}`,
    },
    children: [
      Input({
        name: "login",
        type: "text",
        placeholder: "Your login",
        value: () => state.login,
        onChange: (v) => (state.login = v),
      }),
      Input({
        name: "password",
        type: "password",
        placeholder: "Your password",
        value: () => state.password,
        onChange: (v) => (state.password = v),
      }),
      Submit({ label: "Login" }),
    ],
    on: {
      submit(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        onSubmit(Object.fromEntries(fd));
      },
    },
  };
}
```

**Done when:** every reusable UI unit is a component function with isolated state where needed.

### 3. Mount with render

```js
render(App(), document.body);
// or with a selector
render(App(), "#app");
```

`render(config, target)` creates real DOM nodes from the config tree and appends them to `target`. A config that is not a plain object, array, string, number, or `Node` (a class instance, `Date`, or function) renders nothing; `render()` returns `null` for it, and `children` skips it. A single config object returns a `Node`; passing an array of configs returns `Node[]`. Omit `target` to get detached nodes you can attach later; a selector that matches nothing behaves the same. A detached root receives no `mounted` (its children do). The function is generic — `render<T>()` returns `T`, so you can type the result as `render<HTMLElement>(...)`.

On mount (append to parent), Neux dispatches a `mounted` custom event on every created element — top-down (parent before children), the same order as `removed`, on both the initial mount and a re-mount:

```js
render(
  {
    tagName: "input",
    on: {
      mounted() {
        // already attached to the target when `mounted` fires
        this.focus();
      },
    },
  },
  document.body,
);
```

**Done when:** `render()` returns without error and the target contains expected child nodes.

### 4. Bind reactive properties in configs

- A **config** is a plain-object descriptor (`ElementConfig`) that tells `render()` which element to create, what properties to bind, and how children stay in sync.
- Any property on a config that isn't a known key (`tagName`, `className`, `on`, etc.) becomes a reactively-bound element property. Provide a function value to subscribe it to signal changes so the DOM stays in sync; a function nested inside an object value (`data: { label: () => … }`) is assigned as is, not bound. Reactive functions receive `this` bound to the rendered Node, and event handlers have `this` bound to the element.

```js
render(
  {
    tagName: "p",
    // static — set once
    style: { color: "red" },
    // subproperties that stay in sync with state.count
    dataset: { count: () => state.count },
    // reactive — syncs when state.count changes
    textContent: () => `Count: ${state.count}`,
    // derived className from multiple signal properties
    // null, undefined, and boolean entries are skipped
    className: () => [
      "counter",
      state.count > 0 ? "active" : null,
      !state.activeCount ? "empty" : null,
    ],
  },
  document.body,
);
```

Known config keys and what they do:

- `tagName` (`string`) — Tag name (e.g., "div", "span"). Defaults to "div".
- `use` (`string | Element`) — Selector string (`div#id.cls`), HTML snippet, or existing element to reuse. Overrides `tagName`. See [Tag selector syntax](#tag-selector-syntax-in-use).
- `className` (`ReactiveProperty<ClassName | ClassName[]>`) — Sets CSS classes, replacing any the element already has (including those from a `use` selector). Array entries become separate classes (entries containing spaces are split); `null`, `undefined`, and booleans are skipped, strings and numbers are used as is.
- `classList` (`ReactiveProperty<ClassName | ClassName[]>`) — An alias of `className`; both set the same class list, so use only one of them.
- `style` (`ReactiveProperty<Record<string, unknown>>`) — Inline styles. Keys are camelCase (`backgroundColor`) or kebab-case (`background-color`); `null` or `undefined` clears the property.
- `attributes` (`ReactiveProperty<Record<string, unknown>>`) — Arbitrary HTML attributes (`for`, `aria-label`, etc.). Use for non-property attributes. Values are converted to strings (`false` becomes `"false"`); `null` or `undefined` removes the attribute.
- `dataset` (`ReactiveProperty<Record<string, unknown>>`) — Sets `element.dataset` entries (renders as `data-` attributes).
- `children` (`ReactiveProperty<NodeConfig | NodeConfigList>`) — Child nodes or configs; nested arrays are flattened in order. `null`, `undefined`, and booleans are skipped; strings and numbers render as text nodes (`0` is a value).
- `on` (`Record<string, handler>`) — Event listeners. Keys are event names (`click`, `change`, `keydown`, etc.). Handlers receive the event; `this` is bound to the element. Also accepts lifecycle keys: `mounted`, `removed`, `updated`.
- `shadowRootMode` (`"open" | "closed"`) — Attaches a Shadow DOM root. Children render inside the shadow tree.
- `adoptedStyleSheets` (`CSSStyleSheet[]`) — Style sheets adopted by the shadow root.
- `namespaceURI` (`string`) — Explicit namespace URI; auto-detected for SVG and MathML when omitted.

Element properties such as `checked`, `disabled`, `required`, or `value` stay in sync directly on the config (not inside `attributes`: `attributes: { disabled: false }` sets `disabled="false"`, which still disables the element). Provide a function to make them reactive:

```js
render(
  {
    tagName: "input",
    type: "checkbox",
    // stays in sync with item.done changes
    checked: () => item.done,
  },
  document.body,
);
```

Reactive functions can also be **async** — when they return a `Promise`, Neux updates the DOM in sync with the resolved value:

```js
const state = signal({
  page: 1,
  async fetchPage() {
    const res = await fetch(
      `https://jsonplaceholder.typicode.com/posts/${this.page}`,
    );
    return res.json();
  },
});
render(
  {
    children: async () => {
      const data = await state.fetchPage();
      return [{ tagName: "h3", textContent: data.title }];
    },
  },
  document.body,
);
```

- Returning `undefined` or `null` from a reactive function clears the binding: it removes the attribute, style property, or dataset entry, and restores the original value of a plain element property (for example `textContent` becomes empty).
- A reactive function that returns a `Promise` applies only the latest result; a result that arrives after the function re-ran or the element was removed is ignored.

**Done when:** all dynamic properties use reactive functions and static values are set directly.

### 5. Render lists reactively

To render a list that syncs with push, splice, and item mutations:

```js
render(
  {
    tagName: "ul",
    children() {
      return state.items.map((item) => ({
        tagName: "li",
        // identity so Neux can match DOM nodes during diffing
        dataset: { id: item.id },
        // syncs the property only, not the entire element
        textContent: () => item.text,
      }));
    },
  },
  document.body,
);
```

- The `children` function tracks the array itself — every reactive mutation syncs by re-invoking it, but Neux updates only DOM nodes that actually changed.
- Individual field accesses inside the callback track those specific properties.
- An existing `Node` you return (a cached component, for example) is compared like any other child. If an equal child is already there, that child is kept and your node is left untouched: it stays live, but it is not shown. Give it a distinguishing attribute, as for configs, so it counts as a different node. Detached raw DOM nodes (from `document.createElement`) match equal children too, so an unchanged re-run keeps the existing nodes.
- The diff compares attributes and children, not element properties. Inside a `children` function, bind properties such as `checked` or `value` with a function (`checked: () => item.done`); a plain value (`checked: item.done`) is ignored when an equal existing child is kept.
- Each child must carry a distinguishing attribute (`data-id`, `id`, etc.), static (`id: item.id`) or reactive (`id: () => item.id`). Neux diffs with `isEqualNode`, so siblings that render the same markup are interchangeable: an equal existing child is kept with its old bindings and handlers, even if it was built from a different item.

**Done when:** list renders correctly on push, splice, and individual item property changes. Every child carries a distinguishing attribute for identity matching.

### 6. Handle side effects with effect

For non-UI side reactions (logging, debounced persistence, analytics):

```js
const dispose = effect(
  () => state.count, // getter — reads tracked properties
  (val) => console.log(val), // setter — called with getter return value
);

// Later, clean up to avoid memory leaks
dispose();
```

To read signal properties without subscribing them inside an effect, wrap the read in `untrack()`:

```js
effect(() => {
  // subscribes: tracks state.count
  console.log("Count:", state.count);
  untrack(() => {
    // does not subscribe: reads without tracking
    console.log("Items length:", state.items.length);
  });
});
```

- The getter runs immediately; every signal property read inside is subscribed. Re-runs are batched: one per tick (`setTimeout`), however many subscribed properties changed. Conditional branches subscribe only the active path — stale dependencies are pruned when conditions flip.
- Returns value → setter receives the synchronous result.
- Returns `Promise` → setter receives the resolved value, unless the effect re-ran or was disposed before it resolved.
- A getter that throws on a re-run unsubscribes the effect permanently — handle errors inside the getter if recovery is needed. An error from a re-run getter, from the setter, or from a rejected promise of the latest run is reported through `reportError` (or `console.error` where unavailable), so it reaches `window.onerror`; the first run's getter error is thrown to the caller and leaves the effect disposed.
- Always call the returned dispose function when the effect is no longer needed — wire it to `removed` in lifecycle handlers (step 7).

**Done when:** side effects are created and wired for disposal on removal.

### 7. Use lifecycle events

Neux dispatches custom DOM events you can listen for in `on`:

- `mounted` — Element appended to parent (top-down, same order as `removed`, on both the initial mount and a re-mount; no detail). A previously removed node may be re-mounted; `mounted` fires again and its reactive bindings are rebuilt.
- `removed` — Element removed from a parent (top-down, no detail); dispatched to children inside shadow roots as well. Its reactive bindings are released. Always paired with `mounted`: fresh nodes that a re-render discards because an identical child is already there are destroyed silently (no `mounted`/`removed` for them).
- `updated` — A bound property changed to a different value on the element; a re-run that resolves to the same value, the first applied value, and a change from a cleared (`null` or `undefined`) binding do not fire it. Detail: `{ property, oldValue, newValue }`; for `className`, the values are arrays of the applied class names, and for `children`, arrays of the child nodes in the DOM.

Clean up effects and subscriptions in `removed`:

```js
render(
  {
    children() {
      let dispose;
      return {
        tagName: "button",
        on: {
          mounted() {
            dispose = effect(() => {
              /* ... */
            });
          },
          removed() {
            dispose?.();
          },
        },
      };
    },
  },
  document.body,
);
```

`removed` fires only for elements removed by Neux's reactive tree. Wire direct-DOM removals (`el.remove()`, `parent.removeChild(el)`) to their own cleanup path instead.

Lifecycle events follow only the elements Neux inserts (a `children` list or a `render()` target). A rendered element appended with DOM APIs, such as into a wrapper built with `document.createElement()`, never receives `mounted`; removing the wrapper later does not fire its `removed`, so its bindings stay live. Build the wrapper with Neux (`{ tagName: "section", children: [inner] }`) or render into it with `render(inner, wrapper)`.

**Done when:** effects are created on mount and disposed on removal, with every dispose path accounted for.

### 8. Add internationalization with i18n

```js
const t = i18n(
  {
    en: {
      greeting: "Hello, %{name}!",
      nav: { home: "Home", about: "About" },
      price: "Price: %{amount}",
      birthday: "Birthday: %{date}",
    },
    es: {
      greeting: "Hola, %{name}!",
      nav: { home: "Inicio", about: "Acerca de" },
      price: "Precio: %{amount}",
      birthday: "Cumpleaños: %{date}",
    },
  },
  { language: navigator.language },
);

// Flat and dot-separated keys both work
t("greeting", { name: "Mundo" }); // Hello, Mundo!
t("nav.home"); // Home
t("nav"); // nav — a group of keys is not a translation, so the key is returned
// a key found in no locale is also reported once per locale through reportError (console.error as a fallback)
// formatting follows the language the result comes from: t(1234.5, "fr") formats as the fallback ("en") when there is no `fr` locale

// Intl formatting via placeholder arrays [value, options] or direct calls
t("price", { amount: [12345.67, { style: "currency", currency: "EUR" }] }); // Price: €12,345.67
t("birthday", { date: [new Date(2026, 6, 30), { dateStyle: "long" }] }); // Birthday: July 30, 2026

t(12345.67, { style: "currency", currency: "EUR" }); // €12,345.67
t(new Date(2026, 6, 30), { dateStyle: "long" }); // July 30, 2026
```

To support dynamic locale changes at runtime, pass the current language as the third argument:

```js
const state = signal({ lang: "en" });
render(
  {
    textContent: () => t("greeting", { name: "Mundo" }, state.lang),
  },
  document.body,
);
```

**Done when:** all user-facing string literals are passed through `t()` with a key.

---

## Reference

### Reactive contexts (isolation)

By default all signals share a global reactive context. To isolate groups of signals so they stay in sync only within their own scope:

```js
const ctx = {};
const isolatedState = signal.call(ctx, { count: 0 });
// Only effects also called with `ctx` will track this signal
effect.call(ctx, () => console.log(isolatedState.count));
// Bind render (and untrack) to the same context so bindings track it too
render.call(ctx, { textContent: () => isolatedState.count }, document.body);
```

Use when building plugins or libraries where signals must not interfere with the host app's reactivity.

### Tag selector syntax in `use`

The `use` field accepts several formats:

**CSS-like selector** — sets tag, `id`, and `className`:

```js
render({ use: "div#my-id.primary.large" });
// <div id="my-id" class="primary large">
```

**HTML markup string** — parsed through a `<template>` to create the element:

```js
render({ use: "<span data-info='x'>content</span>", className: "highlight" });
// <span data-info="x" class="highlight">content</span>
```

**Existing Element instance** — reused directly instead of creating a new node:

```js
const el = document.createElement("div");
render({ use: el, className: "reused" }); // returns `el` with classes applied
```

Render a given element only once: passing the same element to `render()` again attaches its event listeners and reactive bindings a second time.

### Refresh a binding manually

Fire a `refresh` custom event to re-sync reactive bindings without state mutation:

```js
element.dispatchEvent(new CustomEvent("refresh", { detail: ["textContent"] })); // refresh one or more properties, e.g. "style.color"
element.dispatchEvent(new CustomEvent("refresh")); // refresh all bindings
```

Useful when external code mutated DOM or signal state outside the normal sync path.

### Exported TypeScript types

- `ReactiveProperty<T>` — `T | ((this: Node) => T | Promise<T>)` — a static value or a (possibly async) function that returns one, with `this` bound to the element
- `NodeConfig` — `ElementConfig | Node | string | number | boolean | null | undefined` — valid child config values (`null`, `undefined`, and booleans are skipped; strings and numbers render as text nodes)
- `NodeConfigList` — `(NodeConfig | NodeConfigList)[]` — a list of child configs, which may contain further lists (flattened in order)
- `ClassName` — `string | number | boolean | null | undefined` — a single `className` entry; `null`, `undefined`, and booleans are skipped
- `ElementConfig` — full config interface with all known keys and reactive properties
- `ElementLifecycle` — typed handlers for `mounted`, `removed`, `updated` events
- `Translator` — function signature returned by `i18n()`

Use these types to annotate component props, state shape, and translation functions in typed projects.
