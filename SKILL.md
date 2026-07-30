---
name: neux
description: Keeps real DOM in sync with reactive signals through plain config objects. Use when creating signal state, defining components, binding properties, rendering lists with diffing, wiring side effects and lifecycle hooks, or adding i18n from the Neux library.
---

# Neux — Developer Skill

Neux keeps the real DOM **sync** with reactive signal state through plain config objects. Follow the steps to create, mount, and sync UI correctly.

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
  // computed — re-evaluated when dependencies change
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

- A **signal** is a reactive `Proxy` wrapping an object or array. Property reads inside an active effect are tracked; writes schedule a debounced re-run of subscriber effects that stay in sync.
- Nested plain objects and arrays wrap automatically.
- Methods bind automatically; access `this.foo` inside them to read reactive fields.
- Getters become computed derived values that keep their callers in sync.
- Replacing a nested property (`state.items = []`) keeps everything in sync — the new value is auto-wrapped reactively, and effects track the replacement on next run.
- Transitive tracking through getters and methods — reading a computed getter or calling a method inside an effect subscribes to both the outer access **and** any underlying `this` fields it reads. For example, `state.double` where the getter reads `this.count` stays in sync with changes to `double` **and** `count`, just as if you had read `state.count` directly.

**Done when:** state shape matches the UI requirements and all mutable operations are expressed as methods or computed getters on the signal.

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

function Submit({ label, onClick }) {
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

`render(config, target)` creates real DOM nodes from the config tree and appends them to `target`. It returns the created `Node`. Omit `target` to get an unmounted node you can attach later.

On mount (append to parent), Neux dispatches a `mounted` custom event top-down through every created element:

```js
render(
  {
    tagName: "input",
    on: {
      mounted() {
        // wait for DOM to be ready before focusing
        queueMicrotask(() => this.focus());
      },
    },
  },
  document.body,
);
```

**Done when:** `render()` returns without error and the target contains expected child nodes.

### 4. Bind reactive properties in configs

- A **config** is a plain-object descriptor (`RenderConfig`) that tells `render()` which element to create, what properties to bind, and how children stay in sync.
- Any property on a config that isn't a known key (`tagName`, `className`, `on`, etc.) becomes a reactively-bound element property. Provide a function value to subscribe it to signal changes so the DOM stays in sync:

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
    // falsy values are automatically filtered by Neux
    className: () => [
      "counter",
      state.count > 0 ? "active" : "",
      !state.activeCount ? "empty" : "",
    ],
  },
  document.body,
);
```

Known config keys and what they do:

- `tagName` (`string`) — Tag name (e.g., "div", "span"). Defaults to "div".
- `use` (`string | Element`) — Selector string (`div#id.cls`), HTML snippet, or existing element to reuse. Overrides `tagName`. See [Tag selector syntax](#tag-selector-syntax-in-use).
- `className` (`ReactiveValue<string | string[]>`) — Sets CSS classes. Array values are joined with spaces automatically; falsy entries are automatically filtered.
- `style` (`ReactiveValue<Record<string, unknown>>`) — Inline styles applied as camelCase or kebab-case properties.
- `attributes` (`ReactiveValue<Record<string, unknown>>`) — Arbitrary HTML attributes (`for`, `aria-label`, etc.). Use for non-property attributes.
- `dataset` (`ReactiveValue<Record<string, unknown>>`) — Sets `element.dataset` entries (renders as `data-` attributes).
- `children` (`ReactiveValue<(string | Node | RenderConfig)[]>`) — Child nodes or configs. Arrays render as a `DocumentFragment`. Falsy entries are skipped automatically.
- `on` (`Record<string, handler>`) — Event listeners. Keys are event names (`click`, `change`, `keydown`, etc.). Handlers receive the event; `this` is bound to the element. Also accepts lifecycle keys: `mounted`, `removed`, `updated`.
- `shadowRootMode` (`"open" | "closed"`) — Attaches a Shadow DOM root. Children render inside the shadow tree.
- `adoptedStyleSheets` (`CSSStyleSheet[]`) — Style sheets adopted by the shadow root.
- `namespaceURI` (`string`) — Explicit namespace URI; auto-detected for SVG and MathML when omitted.

Boolean element properties like `checked`, `disabled`, or `value` stay in sync directly on the config (not inside `attributes`). Provide a function to make them reactive:

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

- Returning `undefined` from a reactive function clears the binding (removes the attribute, style property, or dataset entry).

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
        // reactive identity so Neux can sync DOM nodes during diffing
        dataset: { id: () => item.id },
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
- Each child must carry a **reactive** distinguishing attribute (`data-id`, `id`, etc.). If two siblings have the same structure and different values, Neux uses `isEqualNode` to diff — it sees them as equal and skips updates unless the distinguishing attribute syncs first.

**Done when:** list renders correctly on push, splice, and individual item property changes. Every child carries a reactive distinguishing attribute for identity matching.

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

- The getter runs immediately; every signal property read inside is subscribed. Conditional branches subscribe only the active path — stale dependencies are pruned when conditions flip.
- Returns value → setter receives the synchronous result.
- Returns `Promise` → setter receives the resolved value in sync when ready.
- Throwing effects unsubscribe permanently — handle errors inside the getter if recovery is needed.
- Always call the returned dispose function when the effect is no longer needed — wire it to `removed` in lifecycle handlers (step 7).

**Done when:** side effects are created and wired for disposal on removal.

### 7. Use lifecycle events

Neux dispatches custom DOM events you can listen for in `on`:

- `mounted` — Element appended to parent (top-down, no detail)
- `removed` — Element removed from parent or reactive tree rebuilds (top-down, no detail)
- `updated` — A bound property changed on the element. Detail: `{ property, oldValue, newValue }`

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

// Intl formatting via placeholder arrays [value, options] or direct calls
t("price", { amount: [12345.67, { style: "currency", currency: "EUR" }] }); // Price: €12,345.67
t("birthday", { date: [new Date(), { dateStyle: "long" }] }); // Birthday: July 30, 2026

t(12345.67, { style: "currency", currency: "EUR" }); // €12,345.67
t(new Date(), { dateStyle: "long" }); // Friday, July 30, 2026
```

To support dynamic locale changes at runtime, pass the current language as the third argument:

```js
const state = signal({ lang: "en" });
render({
  textContent: () => t("greeting", { name: "Mundo" }, state.lang),
});
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
```

Use when building plugins or libraries where signals must not interfere with the host app's reactivity.

### Tag selector syntax in `use`

The `use` field accepts several formats:

**CSS-like selector** — sets tag, `id`, and `className`:

```js
render({ use: "div#my-id.primary.large" });
// <div id="my-id" class="primary large">
```

**HTML markup string** — parsed via `innerHTML` to create the element:

```js
render({ use: "<span data-info='x'>content</span>", className: "highlight" });
// <span data-info="x" class="highlight">content</span>
```

**Existing Element instance** — reused directly instead of creating a new node:

```js
const el = document.createElement("div");
render({ use: el, className: "reused" }); // returns `el` with classes applied
```

### Refresh a binding manually

Fire a `refresh` custom event to re-sync reactive bindings without state mutation:

```js
element.dispatchEvent(new CustomEvent("refresh", { detail: ["textContent"] })); // refresh one or more properties
element.dispatchEvent(new CustomEvent("refresh")); // refresh all bindings
```

Useful when external code mutated DOM or signal state outside the normal sync path.

### Exported TypeScript types

- `ReactiveValue<T>` — `T | (() => T)` — a static value or function that returns one
- `RenderChild` — `string | Node | RenderConfig` — valid child config values
- `RenderConfig` — full config interface with all known keys and reactive properties
- `LifecycleEvents` — typed handlers for `mounted`, `removed`, `updated` events
- `Translator` — function signature returned by `i18n()`

Use these types to annotate component props, state shape, and translation functions in typed projects.
