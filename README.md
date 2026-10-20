# Neux

[Neux](https://neux.dev "Native Element UI eXtension") is a lightweight frontend library for building dynamic user interfaces using declarative element definitions and reactive signals to modify them. It leverages native JavaScript and DOM APIs to minimize boilerplate, making it ideal for creating single page applications (SPAs) and custom web components.

**Try it in the playground:**

- 📝 [To-Do App](https://v49.livecodes.io/?x=id/yadr5hya8mm)
- 🧩 [15 Puzzle](https://v49.livecodes.io/?x=id/d752rxemyk6)
- 🎲 [Tic-Tac-Toe](https://v49.livecodes.io/?x=id/ryvyt24ixrn)
- ⏰ [SVG Clock](https://v49.livecodes.io/?x=id/ufnp33xxxv4)
- 🎨 [Sketch](https://v49.livecodes.io/?x=id/ycy3uewd3ni)
- 👑 [WebAwesome](https://v49.livecodes.io/?x=id/8jsi5xgduey)

## Features

- No JSX, no compiler — works at runtime.
- Framework-agnostic, use any part of the library independently.
- Declarative wrapper around low-level DOM APIs without complex abstractions.
- Function-based reactivity with direct DOM manipulation, no virtual DOM.
- Built-in localization support for dynamic language adaptation.
- Easy integration with CSS modules, Tailwind CSS, and other styling solutions.
- Minimal bundle size (4 KB gzipped) with zero dependencies.
- Open source and available under the MIT license.

## For AI Agents

Install the Neux skill to get tailored help when coding with this library:

```sh
npx skills add meefik/neux
```

## Getting Started

Getting started with Neux is quick and effortless. You can include `neux` directly in your project without any additional build steps. Alternatively, you can use the library with bundlers like Vite if needed.

To install `neux` via npm, run:

```sh
npm install neux
```

Or import it as an ES module:

```html
<script type="module">
  // Import Neux functions
  import { render, signal } from "https://esm.sh/neux";
  // Start building your app right away!
</script>
```

To use Neux directly in the browser without npm, add the following to your HTML page:

```html
<script src="https://unpkg.com/neux"></script>
<script>
  // Import Neux functions
  const { render, signal } = window.neux;
  // Start building your app right away!
</script>
```

Take a look at the example below. It creates a button that displays a counter. Every time the button is clicked, the count is incremented and the displayed text is automatically updated via Neux's reactive state management.

```js
import { render, signal } from "neux";
// Create reactive state
const state = signal({ count: 1 });
// Render button element and mount to document.body
render(
  {
    // Tag name
    tagName: "button",
    // Class names
    className: ["btn", "primary"],
    // Event listeners
    on: {
      // Increment count on click
      click: () => state.count++,
    },
    // Dynamic text content
    children: () => [`Count: ${state.count}`],
  },
  document.body,
);
```

The `render()` function accepts an optional second argument — a target element, `DocumentFragment`, or CSS selector string. When provided, the created element is appended to the target and a `mounted` lifecycle event is dispatched. Without a target, or when the selector matches nothing, nothing is appended and the returned node receives no `mounted` (its children do), so attach it yourself.

## Rendering Elements

Neux provides a powerful way to declaratively define HTML elements using plain JavaScript objects. You can specify various properties such as tag name, attributes, styles, event listeners, children, and other native HTML properties. The `render()` function processes these definitions and creates the corresponding DOM elements.

Use the `render()` function to create one or more DOM nodes from a declarative definition. A config that is not a plain object, array, string, number, or `Node` (a class instance, `Date`, or function, for example) renders nothing: `render()` returns `null` and `children` skips it. A single config object returns a `Node`, while an array of configs returns `Node[]`. The function is generic — `render<T>()` can be used to type the returned element. Below is an overview of the most common parameters available for element configuration:

- `tagName`: (String) Specifies the HTML tag name (e.g., "span", "button", "input"). Defaults to `div`.
- `className`: (String, Array of Strings, or Function) Specifies the element's CSS classes, replacing any it already has, including those from a `use` selector such as `"div.card"`. Entries are split on whitespace; `null`, `undefined`, and booleans are skipped, so `cond && "active"` is safe. It can be a static array or a function that returns an array based on dynamic context. When provided as a function, `this` is bound to the element.
- `classList`: (String, Array of Strings, or Function) An alias of `className`. Both set the same class list, so use only one of them.
- `attributes`: (Object or Function) Maps attribute names to their corresponding values. Use a static object for fixed attributes or a function for dynamic assignment. Uses `setAttribute`/`removeAttribute` internally: values are converted to strings (`false` becomes `"false"`), and `null` or `undefined` removes the attribute. For boolean attributes such as `disabled` or `required`, set the element property instead (`disabled: false`). When provided as a function, `this` is bound to the element.
- `style`: (Object or Function) Sets inline CSS styles via an object where keys are style property names in camelCase (`backgroundColor`) or kebab-case (`background-color`). This can also be defined as a function to handle dynamic styling. When provided as a function, `this` is bound to the element.
- `dataset`: (Object or Function) Assigns custom data attributes (`data-*`) through a static mapping or a function that returns the mapping. When provided as a function, `this` is bound to the element.
- `children`: (String, Array of Nodes, or Function) Defines the inner content of the element. This can be a direct string, an array of element definitions, or a function that returns child nodes for dynamic rendering. `null`, `undefined`, and booleans are skipped; strings and numbers render as text nodes (`0` is a value). When provided as a function, `this` is bound to the element.
- `on`: (Object) Adds event listeners to the element. Each key represents an event name (e.g., "click", "change") with its corresponding handler function. Handlers and lifecycle callbacks receive `this` bound to the element.
- `use`: (String or Element) Specifies a tag selector string (e.g., "div#id1.cls1"), an HTML markup to parse, or an existing Element to reuse directly.

Extra configuration for edge cases:

- `shadowRootMode`: (String) Defines the mode of the element's [shadow DOM](https://developer.mozilla.org/docs/Web/API/Web_components/Using_shadow_DOM), determining its accessibility and encapsulation. Options include "open" (the shadow root is accessible via the element's shadowRoot property) and "closed" (the shadow root is hidden, preventing external access).
- `adoptedStyleSheets`: (Array) Specifies one or more [CSSStyleSheet](https://developer.mozilla.org/docs/Web/API/CSSStyleSheet) objects that can be associated with the element's shadow DOM. This enables the use of constructable stylesheets for efficient, reusable styling.
- `namespaceURI`: (String) Specifies the XML namespace URI when [creating namespaced elements](https://developer.mozilla.org/docs/Web/API/Document/createElementNS), such as SVG or MathML. Usually, this property is not required because it is automatically determined by the tag name.

You can also include any other properties specific to particular DOM elements such as `id`, `textContent`, `innerHTML`, etc. A function is bound reactively only as the value of a property itself (`textContent: () => …`) or of a key inside `attributes`, `style`, or `dataset`; a function nested inside another object value, such as `data: { label: () => … }`, is assigned as is.

This flexible approach supports both static configurations and dynamic, reactive user interfaces.

```js
import { render } from "neux";

const el = render({
  tagName: "ul",
  className: ["list"],
  children: ["Item 1", "Item 2"].map((item, index) => {
    return {
      tagName: "li",
      style: { color: "red" },
      attributes: { title: item },
      dataset: { index },
      textContent: item,
    };
  }),
});
```

The `el` variable will contain an HTML element with the following markup:

```html
<ul class="list">
  <li style="color: red;" title="Item 1" data-index="0">Item 1</li>
  <li style="color: red;" title="Item 2" data-index="1">Item 2</li>
</ul>
```

To attach an HTML element to the DOM, pass a target as the second argument to `render()`. The render layer sets up lifecycle event dispatching on the created elements. These events are emitted for each element in the DOM tree:

List of lifecycle events:

- `mounted` fires when the element is appended to a parent — top-down (parent before children), the same order as `removed`, on both the initial mount and a re-mount. A previously removed element can be re-mounted: `mounted` fires again and its reactive bindings are rebuilt.
- `updated` fires when an element property is updated to a different value; it does not fire for the first applied value, nor for a change from a cleared (`null` or `undefined`) binding. For `className`, the old and new values are arrays of the applied class names; for `children`, arrays of the child nodes in the DOM.
- `removed` fires top-down when the element is removed from a parent, including children inside a shadow root, and releases its reactive bindings. Only removals made by Neux (a `children` re-render) fire it; removing an element with DOM APIs such as `el.remove()` does not.

Example of using lifecycle events:

```js
import { render, signal } from "neux";

const state = signal({ count: 0, show: false });
render(
  {
    on: {
      mounted() {
        state.show = true;
      },
    },
    children() {
      return (
        state.show && [
          {
            on: {
              mounted(e) {
                console.log("mounted", e);
                state.count++;
              },
              updated(e) {
                console.log("updated", e);
                state.show = false;
              },
              removed(e) {
                console.log("removed", e);
              },
            },
            textContent: () => `Count: ${state.count}`,
          },
        ]
      );
    },
  },
  document.body,
);
```

The `use` property lets you create elements in several ways — from a tag selector string, raw HTML markup, or an existing Element. For example, you can include any SVG icon as raw HTML and change its styles via the `className`, `style`, or `attributes` properties (raw import works with Vite):

```js
import { render } from "neux";

const svg = render({
  use: `<svg viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="50"/></svg>`,
  className: ["icon"],
  style: {
    color: "green",
  },
  attributes: {
    width: "64px",
    height: "64px",
  },
});

console.log(svg.outerHTML);
```

HTML output:

```html
<svg
  viewBox="0 0 100 100"
  fill="currentColor"
  class="icon"
  style="color: green;"
  width="64px"
  height="64px"
>
  <circle cx="50" cy="50" r="50"></circle>
</svg>
```

You can also use a tag selector string (similar to CSS selectors) to create an element with id and class names:

```js
import { render } from "neux";

const button = render({
  use: "button#my-btn.btn.primary",
  textContent: "Click Me",
});

console.log(button.outerHTML);
```

HTML output:

```html
<button id="my-btn" class="btn primary">Click Me</button>
```

Or pass an existing Element directly:

```js
import { render } from "neux";

const p = render({
  use: document.createElement("p"),
  textContent: "Hello",
});

console.log(p.outerHTML);
```

HTML output:

```html
<p>Hello</p>
```

Render a given Element only once: passing the same Element to `render()` again attaches its event listeners and reactive bindings a second time.

Passing an array of configs to `render()` returns multiple nodes as a plain `Node[]`:

```js
import { render } from "neux";

const nodes = render([
  { tagName: "span", textContent: "Item 1" },
  { tagName: "span", textContent: "Item 2" },
  { tagName: "span", textContent: "Item 3" },
]);

console.dir(nodes);
```

You probably want to change the element properties dynamically. Neux allows you to use functions for most of the element parameters. These functions are reactive and will be re-evaluated automatically when the reactive signals they depend on change.

See the example below:

```js
import { render } from "neux";

const list = [{ text: "Item 1" }, { text: "Item 2" }];
const el = render(
  {
    tagName: "ul",
    children() {
      return list.map((item) => {
        return {
          tagName: "li",
          textContent: () => item.text,
        };
      });
    },
  },
  document.body,
);
```

In this example, the `children` parameter is defined as a function that returns an array of list items. To trigger a re-evaluation of the functions and update the DOM accordingly, you can dispatch a custom `refresh` event to the target element:

```js
// Add a new item to the list
list.push({ text: "Item 3" });
// Re-render the entire element
el.dispatchEvent(new CustomEvent("refresh"));
// Update the text of the first item
list[0].text = "Updated Item 1";
// Update only specific properties
el.children[0].dispatchEvent(
  new CustomEvent("refresh", { detail: ["textContent"] }),
);
```

Note that when dispatching the `refresh` event, you can optionally provide a `detail` — a property name or an array of names, such as `"textContent"` or `"style.color"` — that specifies which properties should be updated. If no detail is provided, all reactive functions will be re-evaluated on the target element. Only the changed elements are replaced when lists like `children` are updated.

Instead of using `refresh` events, you can also use reactive signals to manage state and automatically update the DOM when the state changes. This approach is more efficient and easier to maintain, as it eliminates the need for manual event dispatching.

## Reactive Signals

Signals in Neux are reactive proxies for objects. They track changes automatically and update any linked views or computed fields. Use signals to create reactive state, derived values, and listeners for side effects or debugging. Nested plain objects and arrays (created with `{}`, `[]`, or `new Object()`) are tracked automatically. Other values, such as class instances, `Map`, `Set`, `Date`, and objects with a null prototype (`Object.create(null)`), are returned as is and are not reactive: replace them instead of mutating them.

For example:

```js
import { signal } from "neux";

const state = signal({
  // reactive fields
  count: 1,
  list: [{ text: "Item 1" }, { text: "Item 2", checked: true }],
  // computed field
  get double() {
    return this.count * 2;
  },
  // method that mutates state
  increment() {
    this.count++;
  },
});

// Modify fields
state.increment();
state.list.push({ text: "Item 3" });

// Remove the computed property
delete state.double;
```

A computed getter is re-evaluated on every read, so an effect that reads it re-runs whenever a property the getter reads changes.

**Note**

- Replacing the entire signal object breaks all existing bindings.
- Only properties accessed during the synchronous execution of a computed or effect function are tracked. Reads after an `await` are not tracked.
- Shrinking an array by assigning `length` (`list.length = 0`) re-runs only effects that read `length` (such as `list.map()`), not those that read a dropped index (`list[0]`), enumerate the keys, or test one with `in`. Use `list.splice(0)`, `pop()`, or replace the array.
- Reading a read-only, non-configurable property that holds a nested object, array, or method throws a `TypeError`. This happens with `Object.freeze()` data, such as `signal(Object.freeze({ cfg: {} })).cfg`, but not with primitives or sealed objects. Keep frozen data outside the signal, or leave it unfrozen.

Here is an example of reactivity with nested objects:

```js
import { signal, render } from "neux";

const list = signal([
  { id: 1, text: "Item 1" },
  { id: 2, text: "Item 2" },
]);

render(
  {
    tagName: "ul",
    children: () => {
      // Track changes in the list array,
      // such as adding, replacing, or deleting items
      return list.map((item) => {
        return {
          tagName: "li",
          dataset: {
            // Use unique attribute to force rerendering when item is replaced
            id: () => item.id,
          },
          // Track changes to the specific field
          textContent: () => item.text,
        };
      });
    },
  },
  document.body,
);

// Add new item to the array and then re-render the list
list.push({ id: 3, text: "Item 3" });
// Replace the existing item with a new one that has the same values
// you should change the `id` to a unique value to force rerendering
list.splice(1, 1, { id: 4, text: "Item 4" });
// Change the text content of the `li` element without replacing the element
list[0].text = "Item 1 was changed";
```

You can even use asynchronous functions to fetch data or perform other asynchronous operations before rendering the element properties:

```js
import { signal, render } from "neux";

const Header = (title) => {
  return {
    tagName: "h3",
    textContent: title,
  };
};

const Content = (body) => {
  return {
    tagName: "p",
    textContent: body,
  };
};

const Button = ({ text, disabled, onClick }) => {
  return {
    tagName: "button",
    disabled,
    textContent: text,
    on: {
      click: onClick,
    },
  };
};

const Navigation = (state) => {
  return {
    children: [
      Button({
        text: "< Prev",
        disabled: () => state.page === 1,
        onClick: () => state.prev(),
      }),
      Button({
        text: "Next >",
        disabled: () => state.page === 100,
        onClick: () => state.next(),
      }),
    ],
  };
};

const App = () => {
  const state = signal({
    page: 1,
    prev() {
      if (this.page > 1) this.page--;
    },
    next() {
      if (this.page < 100) this.page++;
    },
    async fetchPage() {
      const response = await fetch(
        `https://jsonplaceholder.typicode.com/posts/${this.page}`,
      );
      return await response.json();
    },
  });
  return {
    children: async () => {
      const data = await state.fetchPage();
      return [Header(data.title), Content(data.body), Navigation(state)];
    },
  };
};

render(App(), document.body);
```

You may encounter a problem when trying to replace an array item with a new object that contains the same values. Neux compares rendered values to detect DOM changes. In this case, the element won't be replaced, even if the object in the state is replaced. To solve this problem, add a unique identifier to each array item and use it as a data attribute key for each element.

The comparison covers attributes and children, not element properties such as `checked` or `value`. A plain value inside a `children` function (`checked: state.on`) is set only on a new element, and an equal existing element is kept with its old value. Bind such a property with a function (`checked: () => state.on`) so the element updates itself.

The same applies to event handlers. A re-rendered child that looks identical to an existing one reuses that existing element, together with its old handlers and the values they captured. For example, after removing the first of two identical `Delete` buttons, the remaining button still acts on the removed item:

```js
render(
  {
    children: () =>
      list.map((item) => ({
        tagName: "button",
        textContent: "Delete",
        // A unique attribute tells the buttons apart; without it, the
        // remaining button would keep the handler of the removed item
        dataset: { id: item.id },
        on: { click: () => remove(item) },
      })),
  },
  document.body,
);
```

The `effect()` function creates a reactive effect that computes a derived value and triggers a side effect:

```js
import { signal, effect } from "neux";

const state = signal({ count: 1 });

// Track changes to `count` and log the value
const dispose = effect(() => {
  console.log(`Count: ${state.count}`);
});

// Change the count value
state.count++;

// Stop tracking changes and clear all associated subscriptions
setTimeout(() => dispose(), 0);
```

The effect function tracks the reactive properties read during each run, starting with the initial one, and re-runs the callback whenever any of them change. Dependencies are collected again on every run, so a branch that is no longer taken stops triggering it. Re-runs are batched: an effect runs once per tick (`setTimeout`), however many of its properties changed in the meantime.

To ignore reactive reads inside an effect, use `untrack()`:

```js
import { signal, effect, untrack } from "neux";

const state = signal({ count: 1, label: "Count" });

// Track changes to `count` only
// Reading `label` inside untrack() won't subscribe the effect
effect(() => {
  const label = untrack(() => state.label);
  console.log(`${label}: ${state.count}`);
});

// Re-runs the effect
state.count++;
// Does not re-run the effect
state.label = "Total";
```

If a getter throws on the first run, the error is thrown to the caller and the effect is not created. If it throws while re-running, the effect is unsubscribed and the error is reported through `reportError` (or `console.error` where it is unavailable), so it reaches `window.onerror`. An error thrown by the optional setter, or a rejected promise returned by the getter, is reported the same way and does not stop the effect.

The `effect()` function returns a `dispose()` function that clears all reactivity subscriptions, stopping further tracking and updates.

## Internationalization

Internationalization is used to display the application interface in different languages. You can use localized number and date formatting with [Intl.NumberFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) and [Intl.DateTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat).

Usage example:

```js
import { i18n } from "neux";

const t = i18n(
  {
    en: {
      say: {
        hello: "Hello %{name}!",
      },
      number: "number: %{val}",
      date: "date: %{val}",
    },
    ru: {
      say: {
        hello: "Привет %{name}!",
      },
      number: "число: %{val}",
      date: "дата: %{val}",
    },
  },
  {
    language: navigator.language,
    fallback: "en",
  },
);

const msg = t("say.hello", { name: "World" });
console.log(msg); // Hello World!

const numberMsg = t("number", {
  val: [
    12345,
    {
      style: "currency",
      currency: "USD",
    },
  ],
});
console.log(numberMsg); // number: $12,345.00

const dateMsg = t("date", {
  val: [
    new Date(2025, 0, 15),
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ],
});
console.log(dateMsg); // date: Wednesday, January 15, 2025

const msgRu = t("say.hello", { name: "Мир" }, "ru");
console.log(msgRu); // Привет Мир!
```

A missing key, or a key that names a nested group such as `say` in `say.hello`, returns the key itself and is reported once per language through `reportError` (or `console.error` where it is unavailable), so a gap in the translations shows up during development. Numbers and dates follow the language the result comes from: a language with translations formats with its own code, while a language that has no entry, or a key found only in the fallback, formats with the fallback language (`t(1234.5, "fr")` formats as `en` when there is no `fr` locale). A regional language code such as `ru-RU` uses the `ru` translations when it has no entry of its own, and the full code is kept for number and date formatting.

## Custom Context

By default, Neux uses a global context for the `signal()`, `effect()`, `untrack()`, and `render()` functions. However, there are scenarios where you might need to use a custom context for signals and rendering. This allows you to separate multiple states, ensuring that reactivity works only within the same context. You can create an object and bind it to these functions.

Here's an example of how to use a custom context:

```js
import { signal, render } from "neux";

// Custom context
const ctx = {};
const s = signal.bind(ctx);
const r = render.bind(ctx);
// Signal with custom context
const state = s({
  count: 1,
});
// Render with the same context
r(
  {
    textContent: () => state.count,
  },
  document.body,
);
// Change the reactive value
state.count++;
```

In this example:

- A custom context object is created.
- The `signal` function is bound to the custom context using `signal.bind(context)`.
- The `render` function is also bound to the same custom context using `render.bind(context)`. These bound functions use the custom context as their `this` value.

An effect tracks only signals of its own context, so bind `effect()` and `untrack()` to the same context when you use them directly.

This approach ensures that the reactivity and rendering logic are scoped to the custom context, providing better modularity and separation of concerns in your application or within Web Components.

## Simple Routing

Neux lets you implement routing simply with reactive state. By tracking the URL hash, you can switch between views dynamically. The following example demonstrates a basic routing setup.

```js
import { signal, render } from "neux";

// Initialize routing state
const state = signal({
  path: location.hash.slice(1) || "Home",
});
// Route components
const Home = () => ({
  textContent: "Welcome to the Home Page!",
});
const About = () => ({
  textContent: "This is the About Page.",
});
const NotFound = () => ({
  textContent: "404 - Page Not Found",
});
const Button = (page) => {
  return {
    tagName: "a",
    href: `#${page}`,
    textContent: page,
  };
};
// Route views
const views = { Home, About };
// App layout with navigation and content
render(
  {
    children: [
      // Navigation links
      {
        tagName: "nav",
        style: { display: "flex", gap: "0.5rem" },
        children: [Button("Home"), Button("About"), Button("Blog")],
      },
      // Main content
      {
        tagName: "main",
        style: { padding: "1rem 0" },
        children: () => {
          const View = views[state.path];
          return View ? View() : NotFound();
        },
      },
    ],
  },
  document.body,
);
// Update state on hash change
window.addEventListener("hashchange", () => {
  state.path = location.hash.slice(1);
});
```

In this setup:

- The reactive state holds the current path.
- Navigation links update the URL hash, which triggers a state change.
- The main content area dynamically renders the corresponding view.
- If the route is not found, a default "Not Found" view is displayed.

## Building with Vite

You can use Neux with the [Vite](https://vitejs.dev) bundler.

How to set up Vite:

**1.** Create a new Vite project:

```sh
npm init vite@latest -- --template vanilla
```

**2.** Install the `neux` module:

```sh
npm install neux
```

**3.** Paste your application code into the `src/main.js` file:

```js
import { render } from "neux";

render(
  {
    textContent: "Hello World!",
  },
  "#app",
);
```

**4.** Run the project:

```sh
npm run dev
```

## Using with Tailwind CSS

It also works well with [Tailwind CSS](https://tailwindcss.com). After [installing Tailwind CSS](https://tailwindcss.com/docs/installation/using-vite) in your project, you can use CSS classes in the `className` field as `String` or `Array`.

Setup steps:

**1.** Install the required modules:

```sh
npm install --save-dev tailwindcss @tailwindcss/vite
```

**2.** Create the file `vite.config.js`:

```js
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
});
```

**3.** Update the `src/style.css` file with:

```css
@import "tailwindcss";
```

**4.** Update the `src/main.js` file with the example:

```js
import "./style.css";
import { render } from "neux";

render(
  {
    tagName: "h1",
    className: ["text-3xl", "font-bold", "underline"],
    textContent: "Hello world!",
  },
  "#app",
);
```

## Using with daisyUI

To simplify styles, you can use [daisyUI](https://daisyui.com). This is a popular component library for [Tailwind CSS](https://tailwindcss.com).

Setup steps:

**1.** Install the required module:

```sh
npm install --save-dev daisyui
```

**2.** Update the `src/style.css` file with:

```css
@plugin "daisyui";
```

**3.** Update the `src/main.js` file with the example:

```js
import "./style.css";
import { signal, render } from "neux";

const state = signal({
  count: 0,
  inc() {
    this.count < 100 && this.count++;
  },
  dec() {
    this.count > 0 && this.count--;
  },
});

render(
  {
    className: ["container", "m-auto", "p-8", "flex", "gap-4"],
    children: [
      {
        tagName: "button",
        className: ["btn", "btn-primary"],
        textContent: "-1",
        on: {
          click: () => state.dec(),
        },
      },
      {
        tagName: "input",
        type: "number",
        className: ["input", "input-bordered", "w-full"],
        attributes: { min: 0, max: 100 },
        value: () => state.count,
        on: {
          change: ({ target }) => {
            const value = parseInt(target.value) || 0;
            state.count = Math.min(100, Math.max(0, value));
            // An unchanged count does not re-run the binding, so reset the input
            target.value = state.count;
          },
        },
      },
      {
        tagName: "button",
        className: ["btn", "btn-primary"],
        textContent: "+1",
        on: {
          click: () => state.inc(),
        },
      },
    ],
  },
  "#app",
);
```

## Using with Web Components

You can use Neux along with any [Web Components](https://developer.mozilla.org/docs/Web/API/Web_Components). Many component libraries can be [found here](https://open-wc.org/guides/community/component-libraries/).

Let's look at an example with the [WebAwesome](https://webawesome.com) library:

**1.** Install the required module:

```sh
npm install @awesome.me/webawesome
```

**2.** Update the `src/main.js` file with the example:

```js
// Web Awesome styles
import "@awesome.me/webawesome/dist/styles/webawesome.css";
// Import the components you want to use
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/card/card.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/input/input.js";

import { render } from "neux";

const Input = ({ label, type, icon, required = true }) => {
  return {
    tagName: "wa-input",
    label,
    type,
    required,
    children: [
      {
        tagName: "wa-icon",
        slot: "start",
        name: icon,
      },
    ],
  };
};

const Checkbox = ({ text }) => {
  return {
    tagName: "wa-checkbox",
    textContent: text,
  };
};

const Button = ({ text, appearance, type }) => {
  return {
    tagName: "wa-button",
    appearance,
    textContent: text,
    type,
  };
};

const Card = (children) => {
  return {
    tagName: "wa-card",
    className: ["card-basic"],
    children,
  };
};

const Form = (children) => {
  return {
    tagName: "form",
    className: ["wa-stack"],
    children,
    on: {
      submit(e) {
        e.preventDefault();
        alert("All fields are valid!");
      },
    },
  };
};

const LoginForm = () => {
  return {
    className: [
      "wa-cloak",
      "wa-justify-content-center",
      "wa-align-items-center",
    ],
    style: {
      width: "100vw",
      height: "100vh",
    },
    children: [
      Card(
        Form([
          Input({ label: "Email", type: "email", icon: "envelope" }),
          Input({ label: "Password", type: "password", icon: "lock" }),
          Checkbox({ text: "Remember me" }),
          Button({ text: "Log In", appearance: "filled", type: "submit" }),
        ]),
      ),
    ],
  };
};

render(LoginForm(), "#app");
```

## Creating your own Web Component

You can create your own components using [one of the libraries](https://open-wc.org/guides/community/base-libraries/). However, you can also use Neux to create your own Web Components.

Here is an example of a custom web component:

```js
import { signal, render } from "neux";

// Create a custom web component
class Counter extends HTMLElement {
  // List of attributes to observe for changes
  static observedAttributes = ["value"];
  // The component constructor override
  constructor() {
    super();
    const ctx = {};
    this.attrs = signal.call(ctx, {});
    const shadowRoot = this.attachShadow({ mode: "open" });
    render.call(ctx, this.#config(), shadowRoot);
  }
  // Called when an observed attribute is changed
  attributeChangedCallback(name, oldv, newv) {
    this.attrs[name] = newv;
  }
  // Describe the object to render the component
  #config() {
    return [
      {
        tagName: "input",
        type: "number",
        value: () => this.attrs.value,
        attributes: {
          min: 0,
          max: 100,
        },
        on: {
          change: (e) => {
            this.attrs.value = e.target.value;
          },
        },
      },
      {
        children: [
          {
            tagName: "slot",
            name: "label",
          },
          {
            tagName: "span",
            textContent: () => this.attrs.value,
          },
        ],
      },
    ];
  }
}
// Define custom element
customElements.define("ne-counter", Counter);
```

Use this custom element:

```js
render(
  {
    tagName: "ne-counter",
    attributes: {
      value: 5,
    },
    children: [
      {
        tagName: "span",
        slot: "label",
        textContent: "Count: ",
      },
    ],
  },
  document.body,
);
```

## Code Example

This example shows how to build a simple app (a To-Do List):

```js
import { signal, render, i18n } from "neux";

const t = i18n({
  en: {
    title: "To Do",
    inputPlaceholder: "Enter your task...",
    markAll: "Mark all as complete",
    completed: "Completed %{completed} of %{total}",
  },
});

let nextId = 1;
const createTask = (text, checked = false) => ({ id: nextId++, text, checked });

const Header = () => {
  return {
    tagName: "h1",
    textContent: t("title"),
  };
};

const TaskInput = (list) => {
  return {
    tagName: "input",
    placeholder: t("inputPlaceholder"),
    autofocus: true,
    on: {
      keyup(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          list.push(createTask(e.target.value));
          e.target.value = "";
        }
      },
    },
  };
};

const MarkAll = (list) => {
  return {
    children: [
      {
        tagName: "input",
        type: "checkbox",
        on: {
          change(e) {
            const checked = e.target.checked;
            list.forEach((item) => {
              item.checked = checked;
            });
          },
        },
      },
      {
        tagName: "label",
        textContent: t("markAll"),
      },
    ],
  };
};

const TaskItem = (list, item) => {
  return {
    tagName: "li",
    style: { display: "flex", gap: "0.5rem" },
    dataset: {
      id: item.id,
    },
    children: [
      {
        tagName: "input",
        type: "checkbox",
        checked: () => item.checked,
        on: {
          change(e) {
            item.checked = e.target.checked;
          },
        },
      },
      {
        tagName: "label",
        style: {
          textDecoration: () => (item.checked ? "line-through" : "none"),
        },
        textContent: () => item.text,
      },
      {
        tagName: "button",
        textContent: "x",
        on: {
          click() {
            const index = list.indexOf(item);
            list.splice(index, 1);
          },
        },
      },
    ],
  };
};

const TaskList = (list) => {
  return {
    tagName: "ul",
    children: () => list.map((item) => TaskItem(list, item)),
  };
};

const Footer = (list) => {
  return {
    textContent: () => {
      const total = list.length;
      const completed = list.filter((item) => item.checked).length;
      return t("completed", { completed, total });
    },
  };
};

const App = () => {
  const list = signal([
    createTask("Item 1"),
    createTask("Item 2", true),
    createTask("Item 3"),
  ]);

  return {
    children: [
      Header(),
      TaskInput(list),
      MarkAll(list),
      TaskList(list),
      Footer(list),
    ],
  };
};

render(App(), document.body);
```

## License

[MIT](LICENSE) — Anton Skshidlevsky (aka meefik)
