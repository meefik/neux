import { suite, test, before, after } from "node:test";
import { equal, deepEqual, ok } from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { render } from "./render";
import { signal } from "./signal";

const tick = () => wait(0);

/** Lifecycle handlers that count `mounted` and `removed` calls. */
function lifecycle() {
  const count = { mounted: 0, removed: 0 };
  const on = {
    mounted() {
      count.mounted++;
    },
    removed() {
      count.removed++;
    },
  };
  return { count, on };
}

/** An `updated` handler that collects event details. */
function updates() {
  const details: Array<{
    property: string;
    oldValue?: unknown;
    newValue?: unknown;
  }> = [];
  const on = {
    updated(e: CustomEvent<(typeof details)[number]>) {
      details.push(e.detail);
    },
  };
  return { details, on };
}

/** Lifecycle handlers that log `name` on `mounted` and `-name` on `removed`. */
function logger(log: string[], name: string) {
  return {
    mounted() {
      log.push(name);
    },
    removed() {
      log.push(`-${name}`);
    },
  };
}

suite("render", async () => {
  let domWindow: typeof window;
  let body: HTMLElement;

  /** Triggers a re-patch of all bindings of `el`, or only of the given properties. */
  const refresh = (el: Element, detail?: string | string[]) =>
    el.dispatchEvent(new domWindow.CustomEvent("refresh", { detail }));

  before(() => {
    const dom = new JSDOM("", {
      url: "http://localhost",
      contentType: "text/html",
    });
    domWindow = dom.window as unknown as typeof window;
    global.window = domWindow;
    body = domWindow.document.body;
  });

  after(async () => {
    await tick();
    (globalThis as Record<string, unknown>).window = undefined;
  });

  await test("renders primitives, existing nodes, and nullish configs", () => {
    const text = render("Hello");
    equal(text.nodeType, domWindow.Node.TEXT_NODE, "string is a text node");
    equal(text.textContent, "Hello");

    const num = render(5);
    equal(num.nodeType, domWindow.Node.TEXT_NODE, "number is a text node");
    equal(num.textContent, "5");

    const nodes = render(["A", "B"]);
    equal(nodes[0].textContent, "A");
    equal(nodes[1].textContent, "B");

    const node = domWindow.document.createTextNode("pass");
    equal(render(node), node, "existing node is returned as is");

    for (const value of [true, false, null, undefined]) {
      equal(render(value), null, `${value} renders nothing`);
    }
  });

  await test("sets properties: tag, id, classes, attributes, dataset, style, textContent", () => {
    const el = render<HTMLElement>({
      tagName: "p",
      id: "my-id",
      className: ["my-class1", "my-class2"],
      attributes: { for: "my-input" },
      dataset: { id: "123" },
      style: { color: "red", "background-color": "blue" },
      textContent: "Hello World",
    });

    equal(el.tagName, "P");
    equal(el.id, "my-id");
    equal(el.className, "my-class1 my-class2");
    equal(el.getAttribute("for"), "my-input");
    equal(el.dataset.id, "123");
    equal(el.style.color, "red");
    equal(el.style.backgroundColor, "blue");
    equal(el.textContent, "Hello World");
  });

  await test("sets className from arrays and single entries, skipping empty ones", () => {
    const el = render<HTMLElement>({
      children: [
        { className: ["a", "b", "c"] },
        { className: "d e f" },
        { className: ["a b", false, true, null, undefined, "", 0, "c"] },
        { className: 0 },
        { className: () => 7 },
        { className: " a   b " },
        ...[false, true, null, "", () => undefined].map((className) => ({
          className,
        })),
      ],
    });
    const classes = Array.from(el.children, (c) => c.getAttribute("class"));
    deepEqual(classes, [
      "a b c",
      "d e f",
      "a b 0 c",
      "0",
      "7",
      "a b",
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  await test("infers the namespace from the tag, or takes an explicit one", () => {
    const xhtml = "http://www.w3.org/1999/xhtml";
    const svg = "http://www.w3.org/2000/svg";
    const el = render<HTMLElement>({
      children: [
        { tagName: "svg", children: [{ tagName: "path" }] },
        {
          tagName: "math",
          children: [{ tagName: "msup", children: [{ tagName: "mi" }] }],
        },
        { tagName: "svg", namespaceURI: xhtml },
        { tagName: "g", namespaceURI: svg, children: [{ tagName: "path" }] },
        {
          tagName: "svg",
          children: [
            {
              tagName: "foreignObject",
              children: [
                { tagName: "div", children: [{ tagName: "span" }] },
                { tagName: "svg", children: [{ tagName: "path" }] },
              ],
            },
          ],
        },
      ],
    });
    const [icon, math, fallback, group, canvas] = Array.from(el.children);
    const [fo] = Array.from(canvas.children);

    equal(el.namespaceURI, xhtml);
    equal(icon.namespaceURI, svg);
    equal(icon.children[0].namespaceURI, svg, "path inherits");
    equal(math.namespaceURI, "http://www.w3.org/1998/Math/MathML");
    equal(
      math.children[0].children[0].namespaceURI,
      math.namespaceURI,
      "nested MathML inherits",
    );
    equal(
      fallback.namespaceURI,
      svg,
      "explicit XHTML falls back to tag detection",
    );
    equal(group.namespaceURI, svg, "explicit namespace is applied");
    equal(group.children[0].namespaceURI, svg, "children inherit it");

    equal(fo.namespaceURI, svg, "foreignObject itself is SVG");
    equal(fo.children[0].namespaceURI, xhtml, "its children are HTML");
    equal(fo.children[0].children[0].namespaceURI, xhtml, "and descendants");
    equal(fo.children[1].namespaceURI, svg, "a nested svg is SVG again");
    equal(fo.children[1].children[0].namespaceURI, svg, "with SVG children");
  });

  await test("use: parses tag selector, HTML markup, or reuses element", () => {
    const el1 = render<HTMLElement>({ use: "p#id1.cls1.cls2" });
    equal(el1.tagName, "P");
    equal(el1.id, "id1");
    equal(el1.className, "cls1 cls2");

    const el2 = render<HTMLElement>({
      use: "<span></span>",
      className: "cls1",
    });
    equal(el2.tagName, "SPAN");
    equal(el2.className, "cls1");

    const span = domWindow.document.createElement("span");
    equal(render({ use: span }), span, "reuses the same element");

    class MyEl extends domWindow.HTMLElement {}
    domWindow.customElements.define("my-el", MyEl);
    const el4 = render<HTMLElement>({ use: "my-el#el4-id.el4-cls" });
    equal(el4.tagName, "MY-EL", "creates a registered custom element");
    equal(el4.id, "el4-id");
    equal(el4.className, "el4-cls");

    const el5 = render<HTMLElement>({
      use: "\n  <svg viewBox='0 0 1 1'><circle/></svg>\n",
    });
    equal(el5.tagName.toLowerCase(), "svg", "markup whitespace is ignored");
    equal(el5.getAttribute("viewBox"), "0 0 1 1");

    const row = render<HTMLElement>({ use: "<tr><td>1</td></tr>" });
    equal(row.tagName, "TR", "markup that needs a specific parent is kept");
    equal(row.firstElementChild?.tagName, "TD");
    equal(row.parentNode, null, "parsed markup has no leftover parent");
    equal(
      row.ownerDocument,
      domWindow.document,
      "belongs to the main document",
    );
  });

  await test("a binding removed in the same trigger as its parent does not leak", async () => {
    const s = signal({ show: true, x: 0 });
    let runs = 0;
    render(
      {
        children: () =>
          s.show
            ? [
                {
                  textContent: () => {
                    runs++;
                    return `${s.show}-${s.x}`;
                  },
                },
              ]
            : [],
      },
      domWindow.document.createElement("div"),
    );
    s.show = false;
    await tick();
    const after = runs;
    s.x = 1;
    await tick();
    equal(runs, after, "removed child binding no longer runs");
  });

  await test("reports an error from a binding instead of swallowing it", () => {
    const errors: unknown[] = [];
    const g = globalThis as { reportError?: (e: unknown) => void };
    const prev = g.reportError;
    g.reportError = (e) => errors.push(e);
    try {
      // `list` is a read-only property: assigning it throws in strict mode.
      const el = render<HTMLElement>({
        tagName: "input",
        list: () => "x",
        id: "ok",
      });
      equal(errors.length, 1, "the failed assignment was reported");
      equal(el.id, "ok", "other bindings still applied");
    } finally {
      g.reportError = prev;
    }
  });

  await test("a dropped child binding does not re-run against state it no longer fits", async () => {
    const state = signal<{
      ids: number[];
      byId: Record<number, { name: string }>;
    }>({
      ids: [1, 2],
      byId: { 1: { name: "a" }, 2: { name: "b" } },
    });
    const errors: unknown[] = [];
    const g = globalThis as { reportError?: (e: unknown) => void };
    const prev = g.reportError;
    g.reportError = (e) => errors.push(e);
    try {
      const ul = render<HTMLElement>({
        tagName: "ul",
        children: () =>
          state.ids.map((id) => ({
            tagName: "li",
            textContent: () => state.byId[id].name,
          })),
      });
      delete state.byId[2];
      state.ids = [1];
      await tick();

      deepEqual(
        errors,
        [],
        "the dropped child did not read the deleted entity",
      );
      equal(ul.innerHTML, "<li>a</li>");
    } finally {
      g.reportError = prev;
    }
  });

  await test("a supplied node equal to an existing child is not released", async () => {
    const state = signal({ n: 0, useShared: false });
    // Distinguishable only through the reactive `n`, so at first it equals the child.
    const shared = render<HTMLElement>({
      tagName: "b",
      textContent: () => `v${state.n}`,
    });
    const lifecycleEvents = lifecycle();
    const host = render<HTMLElement>({
      children: () =>
        state.useShared
          ? [shared]
          : [{ tagName: "b", textContent: "v0", on: lifecycleEvents.on }],
    });
    const original = host.firstChild;

    state.useShared = true;
    await tick();
    equal(
      host.firstChild,
      original,
      "the equal child is kept, as for any equal sibling",
    );
    equal(lifecycleEvents.count.removed, 0, "and it is not removed");

    state.n = 1;
    await tick();
    equal(shared.textContent, "v1", "the supplied node keeps its bindings");
  });

  await test("a supplied node that differs from the existing child is inserted", async () => {
    const state = signal({ n: 0, useShared: false });
    const shared = render<HTMLElement>({
      tagName: "b",
      dataset: { id: "shared" },
      textContent: () => `v${state.n}`,
    });
    const host = render<HTMLElement>({
      children: () =>
        state.useShared ? [shared] : [{ tagName: "b", textContent: "v0" }],
    });

    state.useShared = true;
    await tick();
    equal(
      host.firstChild,
      shared,
      "a distinguishing attribute makes it a different node",
    );
    state.n = 1;
    await tick();
    equal(host.textContent, "v1", "and it stays live in the DOM");
  });

  await test("matches reordered children without comparing every pair", async () => {
    const N = 100;
    const state = signal({ ids: Array.from({ length: N }, (_, i) => i) });
    const ul = render<HTMLElement>({
      tagName: "ul",
      children: () => [
        "head",
        // Identical `hr` nodes between the items are matched in order.
        ...state.ids.flatMap((id) => [
          { tagName: "li", dataset: { id } },
          { tagName: "hr" },
        ]),
        "tail",
      ],
    });
    const before = Array.from(ul.childNodes);
    const proto = domWindow.Node.prototype;
    const isEqualNode = proto.isEqualNode;
    let compares = 0;
    proto.isEqualNode = function (this: Node, other: Node | null) {
      compares++;
      return isEqualNode.call(this, other);
    };
    try {
      state.ids.reverse();
      await tick();
    } finally {
      proto.isEqualNode = isEqualNode;
    }

    const items = Array.from(ul.children).filter((el) => el.localName === "li");
    deepEqual(
      items.map((li) => (li as HTMLElement).dataset.id),
      state.ids.map(String),
      "reordered",
    );
    deepEqual(
      Array.from(ul.childNodes).filter((n) => !items.includes(n as Element)),
      before.filter((n) => !items.includes(n as Element)),
      "text and identical nodes are kept",
    );
    equal(
      items.every((li) => before.includes(li)),
      true,
      "every item was reused",
    );
    ok(compares < N * 8, `linear number of comparisons, got ${compares}`);
  });

  await test("keeps equal detached raw DOM nodes across an unchanged re-run", async () => {
    const state = signal({ tick: 0, text: "a" });
    const li = (text: string) => {
      const node = domWindow.document.createElement("li");
      node.textContent = text;
      return node;
    };
    const ul = render<HTMLElement>({
      tagName: "ul",
      children: () => {
        state.tick;
        return [li(state.text), li("b")];
      },
    });
    const first = Array.from(ul.children);

    state.tick++;
    await tick();
    deepEqual(
      Array.from(ul.children),
      first,
      "equal raw nodes keep the existing ones",
    );

    state.text = "c";
    await tick();
    equal(
      ul.children[0].textContent,
      "c",
      "a changed raw node replaces its match",
    );
    equal(ul.children[1], first[1], "the unchanged one is still kept");
  });

  await test("renders a null-prototype config, but not an unsupported one", () => {
    const obj = Object.create(null);
    obj.tagName = "p";
    equal(render<HTMLElement>(obj).tagName, "P");

    class Widget {}
    const bad = [new Widget(), new Date(), () => ({}), Symbol("x")];
    for (const config of bad) {
      equal(render(config as never), null, "returns null");
    }

    const ul = render<HTMLElement>({
      tagName: "ul",
      children: [{ tagName: "li" }, new Widget() as never, "text"],
    });
    equal(ul.children.length, 1, "an unsupported child is skipped");
    equal(ul.textContent, "text");
  });

  await test("renders children, skipping false, null, and undefined", () => {
    const fragment = domWindow.document.createDocumentFragment();
    fragment.appendChild(domWindow.document.createElement("li")).textContent =
      "Item 3";

    const el = render<HTMLElement>({
      tagName: "ul",
      children: [
        { tagName: "li", textContent: "Item 1" },
        null,
        false,
        { tagName: "li", textContent: "Item 2" },
        fragment,
      ],
    });
    equal(
      Array.from(el.children, (c) => c.textContent).join(","),
      "Item 1,Item 2,Item 3",
    );

    const nodes = render(["A", null, undefined, false, "B", 0, ""]);
    equal(nodes.length, 4, "numbers and empty strings render as text nodes");
    equal(nodes[2].textContent, "0");
    equal(nodes[3].textContent, "");
  });

  await test("mounts element into DOM or CSS selector target", () => {
    const el1 = render<HTMLElement>({ tagName: "p" }, body);
    equal(body.firstChild, el1, "element is mounted");
    el1.remove();

    const wrapper = domWindow.document.createElement("div");
    wrapper.id = "test-mount";
    body.appendChild(wrapper);
    try {
      equal(render({ tagName: "span" }, "#test-mount"), wrapper.firstChild);
    } finally {
      wrapper.remove();
    }
  });

  await test("mounts a list of nodes into a target, firing mounted on each root", () => {
    const log: string[] = [];
    const host = domWindow.document.createElement("div");

    const nodes = render(
      [
        { tagName: "a", on: logger(log, "a") },
        "text",
        { tagName: "b", on: logger(log, "b") },
      ],
      host,
    );

    equal(nodes.length, 3);
    deepEqual(Array.from(host.childNodes), nodes, "roots appended in order");
    deepEqual(log, ["a", "b"], "each root mounted once, in order");
  });

  await test("dispatches event handlers", () => {
    let value = 1;
    const el = render<HTMLInputElement>({
      tagName: "input",
      type: "number",
      value,
      on: {
        change(e) {
          value = parseInt((e.target as HTMLInputElement).value, 10);
        },
      },
    });

    el.value = "2";
    el.dispatchEvent(new domWindow.Event("change"));
    equal(value, 2, "handler updated value");
  });

  await test("binds `this` to the node in reactive properties and handlers", () => {
    const seen: Record<string, unknown> = {};
    const el = render<HTMLElement>(
      {
        className() {
          seen.className = this;
          return [];
        },
        style() {
          seen.style = this;
          return {
            color() {
              seen.color = this;
              return "red";
            },
          };
        },
        dataset: {
          id() {
            seen.id = this;
            return "1";
          },
        },
        children() {
          seen.children = this;
          return [];
        },
        customProp() {
          seen.customProp = this;
          return "custom";
        },
        on: {
          mounted() {
            seen.mounted = this;
          },
          click() {
            seen.click = this;
          },
        },
      },
      body,
    );
    el.dispatchEvent(new domWindow.MouseEvent("click"));

    equal(Object.keys(seen).length, 8, "every callback ran");
    for (const [name, value] of Object.entries(seen)) {
      equal(value, el, `${name} \`this\` is the element`);
    }
  });

  await test("respects a bound signal context and accepts a signal as config", async () => {
    const ctx = {};
    const state = signal.bind(ctx)({ text: "text" });
    const el = render.bind(ctx)({ textContent: () => state.text });
    equal(el.textContent, "text");

    state.text = "updated";
    await tick();
    equal(el.textContent, "updated", "text updates via reactivity");

    equal(render(signal({ textContent: "Text" })).textContent, "Text");
  });

  await test("resolves async values, applying only the latest", async () => {
    const state = signal({ counter: 1 });
    const el = render<HTMLElement>({
      textContent: async () => {
        await wait(0);
        return state.counter;
      },
    });

    state.counter = 2;
    await wait(5);
    equal(el.textContent, "2", "latest async value is applied");
  });

  await test("reconciles children: reorder, insert, remove, clear", async () => {
    let list = ["A", "B", "C", "D", "E"].map((text) => ({ text }));
    const { count, on } = lifecycle();
    const el = render<HTMLElement>({
      tagName: "ul",
      children: () =>
        list.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
          on,
        })),
    });
    const texts = () => Array.from(el.children, (c) => c.textContent).join();

    list.splice(1, 2, { text: "C" }, { text: "B" });
    list.splice(3, 0, { text: "X" });
    refresh(el);
    await tick();
    equal(texts(), "A,C,B,X,D,E", "children reordered with insertion");

    list = [{ text: "Only" }];
    refresh(el);
    await tick();
    equal(texts(), "Only");
    ok(count.removed > 0, "removed event fires on reconciled child");

    list = [];
    refresh(el);
    await tick();
    equal(el.children.length, 0, "no children remain");
  });

  await test("does not leak child bindings on structural re-render", async () => {
    const state = signal({ gate: 1, items: [{ text: "one" }] });
    let fieldReads = 0;
    const el = render<HTMLElement>({
      tagName: "ol",
      children: () => [
        state.gate && null, // tracked read: bumps force a list re-render
        ...state.items.map((item) => ({
          tagName: "li",
          // A nested element, so a dropped duplicate releases its descendants too.
          children: [
            {
              tagName: "b",
              textContent: () => {
                fieldReads++;
                return item.text;
              },
            },
          ],
        })),
      ],
    });

    for (let i = 0; i < 3; i++) {
      state.gate++; // structurally identical re-render
      await tick();
      equal(el.children.length, 1, "still exactly 1 child");
    }

    fieldReads = 0;
    state.items[0].text = "ONE";
    await tick();
    equal(fieldReads, 1, "only the live child effect reacts");
    equal(el.textContent, "ONE");
  });

  await test("keeps lifecycle paired: discards are silent, real removals fire removed", async () => {
    const state = signal({ items: [{ text: "one" }, { text: "two" }] });
    const { count, on } = lifecycle();
    const el = render<HTMLElement>({
      tagName: "ul",
      children: () =>
        state.items.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
          on,
        })),
    });
    equal(count.mounted, 2, "both live children mounted");
    equal(count.removed, 0);

    // Same content, fresh nodes are dropped: they never mounted, so never remove.
    state.items = [{ text: "one" }, { text: "two" }];
    await tick();
    equal(el.children.length, 2);
    equal(count.removed, 0, "discarded duplicates do not fire removed");

    state.items = [];
    await tick();
    equal(el.children.length, 0);
    equal(count.removed, 2, "each live child fired removed exactly once");

    state.items = [{ text: "three" }];
    await tick();
    equal(count.mounted, 3, "reinserted child mounted");
    equal(count.removed, 2, "no spurious removed events");
  });

  await test("fires mounted once for nested render children", () => {
    const counts = [lifecycle(), lifecycle(), lifecycle()];
    render(
      {
        on: counts[0].on,
        children: [
          render({ on: counts[1].on, children: [{ on: counts[2].on }] }),
        ],
      },
      body,
    );
    equal(counts.map((c) => c.count.mounted).join(), "1,1,1");
  });

  await test("fires mounted and removed top-down", async () => {
    const order: string[] = [];
    const state = signal({ show: true });
    render(
      {
        tagName: "ul",
        children: () =>
          state.show && {
            tagName: "li",
            on: logger(order, "li"),
            children: [{ tagName: "b", on: logger(order, "b") }],
          },
      },
      body,
    );
    const take = () => order.splice(0).join();
    equal(take(), "li,b", "initial mount is top-down");

    state.show = false;
    await tick();
    equal(take(), "-li,-b", "removal is top-down");

    state.show = true;
    await tick();
    equal(take(), "li,b", "re-mount is top-down");
  });

  await test("rebuilds bindings when an element is re-mounted", async () => {
    const item = signal({ text: "ONE" });
    const seen: string[] = [];
    let runs = 0;
    const { count, on } = lifecycle();
    // A single reused instance toggled in and out of a reactive child list.
    const li = render<HTMLElement>({
      tagName: "li",
      textContent: () => {
        runs++;
        return item.text;
      },
      on: {
        ...on,
        mounted() {
          on.mounted();
          seen.push(this.textContent ?? "");
        },
      },
    });
    const state = signal({ show: true });
    const parent = render<HTMLElement>({
      tagName: "ul",
      children: () => (state.show ? [li] : []),
    });
    equal(parent.children.length, 1);
    equal(count.mounted, 1, "mounted once on first insert");

    // Detached: writes must not reach the DOM.
    state.show = false;
    await tick();
    equal(parent.children.length, 0);
    equal(count.removed, 1);
    item.text = "TWO";
    await tick();
    equal(li.textContent, "ONE", "not reactive while detached");

    // Re-mount: bindings are rebuilt before user handlers see the node.
    state.show = true;
    await tick();
    equal(count.mounted, 2, "mounted fires again on re-insertion");
    equal(count.removed, 1, "no spurious removed on re-insertion");
    equal(seen.join(), "ONE,TWO", "handler sees fresh content");
    item.text = "THREE";
    await tick();
    equal(li.textContent, "THREE", "content follows the signal after re-mount");

    // Each detach tears the effect down; each re-mount restores exactly one.
    runs = 0;
    for (let i = 0; i < 5; i++) {
      state.show = false;
      await tick();
      state.show = true;
      await tick();
    }
    equal(runs, 5, "one run per re-mount, no accumulation");
    item.text = "FINAL";
    await tick();
    equal(runs, 6, "exactly one effect runs per write");
  });

  await test("re-mount cascades to nested children", async () => {
    const item = signal({ badge: "1" });
    const outerHooks = lifecycle();
    const badgeHooks = lifecycle();
    const badge = render<HTMLElement>({
      tagName: "b",
      textContent: () => item.badge,
      on: badgeHooks.on,
    });
    const outer = render<HTMLElement>({
      tagName: "li",
      children: [badge],
      on: outerHooks.on,
    });
    const state = signal({ show: true });
    const host = render<HTMLElement>({
      tagName: "ul",
      children: () => (state.show ? [outer] : []),
    });
    equal(outerHooks.count.mounted, 1);
    equal(badgeHooks.count.mounted, 1);

    state.show = false;
    await tick();
    equal(host.children.length, 0);
    equal(outerHooks.count.removed, 1);
    equal(badgeHooks.count.removed, 1, "badge removed once (cascade)");

    state.show = true;
    await tick();
    equal(host.children.length, 1);
    equal(outerHooks.count.mounted, 2);
    equal(badgeHooks.count.mounted, 2, "badge mounted again (cascade)");
    equal(badgeHooks.count.removed, 1, "no spurious badge removed");
    equal(outer.children[0], badge, "badge instance is preserved");

    item.badge = "9";
    await tick();
    equal(badge.textContent, "9", "nested badge follows after re-mount");
  });

  await test("re-mount with a structurally changed child keeps lifecycle paired", async () => {
    const state = signal({ text: "one", show: true });
    const { count, on } = lifecycle();

    // The nested child is rebuilt on every render, so a structural change
    // while detached yields a fresh child on re-mount.
    const wrapper = render<HTMLElement>({
      children: () => [{ tagName: "b", textContent: () => state.text, on }],
    });
    const host = render<HTMLElement>(
      { children: () => (state.show ? [wrapper] : []) },
      body,
    );
    equal(count.mounted, 1);

    state.show = false;
    await tick();
    equal(host.children.length, 0);
    equal(count.removed, 1, "nested child removed once with its parent");

    state.text = "two";
    state.show = true;
    await tick();
    equal(host.children.length, 1);
    equal(count.mounted, 2, "fresh child mounted exactly once on re-mount");
    equal(
      count.removed,
      1,
      "already-detached child does not fire removed twice",
    );
    equal(wrapper.textContent, "two", "fresh child reflects current state");
  });

  await test("re-mount reaches text nodes it rebuilds, leaving none armed", async () => {
    const state = signal({ text: "one", show: true });
    const mountedText: string[] = [];

    const wrapper = render<HTMLElement>({
      children: () => [state.text],
    });
    const host = render<HTMLElement>(
      { children: () => (state.show ? [wrapper] : []) },
      body,
    );
    // `mounted` does not bubble, but a capturing listener still sees it.
    host.addEventListener(
      "mounted",
      (e) => {
        if (e.target instanceof domWindow.Text) {
          mountedText.push(e.target.data);
        }
      },
      true,
    );

    state.show = false;
    await tick();
    state.text = "two";
    state.show = true;
    await tick();
    equal(wrapper.textContent, "two");
    deepEqual(
      mountedText,
      ["two"],
      "the rebuilt text node is mounted by the re-mount cascade, not by a later render",
    );
  });

  await test("ignores refresh on a removed element", async () => {
    const state = signal({ show: true });
    let runs = 0;
    const parent = render<HTMLElement>({
      children: () => state.show && { textContent: () => (runs++, "x") },
    });
    const child = parent.children[0];
    state.show = false;
    await tick();

    const before = runs;
    refresh(child);
    equal(runs, before, "no bindings are rebuilt on a removed element");
  });

  await test("ignores an async children result after the element is removed", async () => {
    const lifecycleEvents = lifecycle();
    const state = signal({ show: true });
    render(
      {
        children: () =>
          state.show && {
            children: async () => {
              await wait(20);
              return [{ on: lifecycleEvents.on }];
            },
          },
      },
      body,
    );
    await tick();
    state.show = false;
    await wait(50);
    equal(lifecycleEvents.count.mounted, 0, "late result is never mounted");
    equal(lifecycleEvents.count.removed, 0, "late result never leaks");
  });

  await test("emits updated events on reactive changes", async () => {
    const state = signal({ value: 0, color: "red", text: "hello", id: "1" });
    const { details, on } = updates();
    render({
      textContent: () => String(state.value),
      style: { color: () => state.color },
      attributes: { "data-x": () => state.text },
      dataset: { id: () => state.id },
      on,
    });

    state.value = 42;
    state.color = "blue";
    state.text = "world";
    state.id = "2";
    await tick();

    equal(
      details.map((d) => d.property).join(),
      "textContent,style.color,attributes.data-x,dataset.id",
    );
    equal(details[0].oldValue, "0");
    equal(details[0].newValue, "42");
  });

  await test("does not emit updated for the first value or after a cleared binding", async () => {
    const state = signal<{ value: string | null }>({ value: "a" });
    const { details, on } = updates();
    render({ title: () => state.value, on });
    equal(details.length, 0, "the first applied value does not fire");

    state.value = "b";
    await tick();
    state.value = null;
    await tick();
    state.value = "c";
    await tick();
    state.value = "d";
    await tick();
    deepEqual(
      details.map((d) => `${d.oldValue}>${d.newValue}`),
      ["a>b", "b>undefined", "c>d"],
      "a change from a cleared binding does not fire",
    );
  });

  await test("does not emit updated for a className that resolves to the same classes", async () => {
    const state = signal({ n: 0 });
    const { details, on } = updates();
    render({
      className: () => (state.n > 0 ? ["a", state.n > 1 && "b"] : "a"),
      on,
    });

    state.n = 1;
    await tick();
    equal(details.length, 0, "same classes in a different form do not fire");
    state.n = 2;
    await tick();
    equal(details.length, 1, "a changed class set fires once");
    deepEqual(details[0].oldValue, ["a"]);
    deepEqual(details[0].newValue, ["a", "b"]);
  });

  await test("emits updated for children only when the child nodes change", async () => {
    const state = signal({ items: ["a"], tick: 0 });
    const { details, on } = updates();
    const el = render<HTMLElement>({
      children: () => {
        state.tick;
        return state.items.map((text) => ({
          tagName: "li",
          textContent: text,
        }));
      },
      on,
    });

    state.tick = 1;
    await tick();
    equal(details.length, 0, "an identical re-render does not fire");

    state.items = ["a", "b"];
    await tick();
    equal(details.length, 1, "an added child fires once");
    equal(details[0].property, "children");
    deepEqual(details[0].oldValue, [el.children[0]]);
    deepEqual(details[0].newValue, Array.from(el.childNodes));

    state.items = [];
    await tick();
    equal(details.length, 2, "removing every child fires");
    deepEqual(details[1].newValue, []);
  });

  await test("refresh re-patches all, some, or none of the bound properties", () => {
    let text = "initial";
    let color = "red";
    const el = render<HTMLElement>({
      textContent: () => text,
      className: () => text,
      style: () => ({ color, margin: "1px" }),
      attributes: () => ({ title: color }),
    });

    text = "changed";
    color = "blue";
    refresh(el, "style.color");
    equal(el.style.color, "blue", "the given property is re-patched");
    equal(el.style.margin, "1px", "a reactive map re-runs as a whole");
    equal(el.textContent, "initial", "other properties are untouched");
    equal(el.getAttribute("title"), "red", "other maps are untouched");

    refresh(el, ["textContent", "className"]);
    equal(el.textContent, "changed");
    equal(el.className, "changed");

    text = "all";
    refresh(el);
    equal(el.textContent, "all", "no detail re-patches everything");

    // A property the config does not bind is left alone, children included.
    const plain = render<HTMLElement>({
      style: { color: "red" },
      children: [{ tagName: "b", textContent: "x" }],
    });
    for (const prop of [
      "textContent",
      "style.margin",
      "toString",
      "dataset.id",
    ]) {
      refresh(plain, prop);
    }
    equal(plain.style.color, "red", "bound properties are untouched");
    equal(plain.innerHTML, "<b>x</b>", "children are not replaced");
  });

  await test("flattens nested arrays of children and configs in order", () => {
    const el = render<HTMLElement>({
      children: ["a", [{ tagName: "b" }, ["c", [{ tagName: "i" }]]], "d"],
    });
    equal(el.innerHTML, "a<b></b>c<i></i>d");

    const nodes = render([["a", ["b"]], "c"]);
    deepEqual(
      nodes.map((node) => node.textContent),
      ["a", "b", "c"],
      "a top-level list is flattened too",
    );
  });

  await test("classList is an alias of className", async () => {
    const s = signal({ on: false });
    const el = render<HTMLElement>({
      use: "div.base",
      classList: () => ["item", s.on && "active"],
    });
    equal(
      el.className,
      "item",
      "replaces the classes of the selector like className",
    );
    s.on = true;
    await tick();
    equal(
      el.className,
      "item active",
      "a reactive classList follows its signal",
    );
    equal(render<HTMLElement>({ classList: "a b" }).className, "a b");
  });

  await test("cleared reactive bindings remove values", async () => {
    const state = signal<{ attr?: string; val?: string; color?: string }>({
      attr: "present",
      val: "1",
      color: "red",
    });
    const el = render<HTMLElement>({
      attributes: { placeholder: () => state.attr, empty: "" },
      dataset: { key: () => state.val },
      style: { color: () => state.color, backgroundColor: () => state.color },
    });
    equal(el.getAttribute("placeholder"), "present");
    equal(el.dataset.key, "1");
    equal(el.style.color, "red");
    equal(el.style.backgroundColor, "red", "camelCase key is set");

    state.attr = state.val = state.color = undefined;
    await tick();

    equal(el.getAttribute("placeholder"), null, "attribute removed");
    equal(el.getAttribute("empty"), "", "empty string is kept, not removed");
    equal(el.hasAttribute("data-key"), false, "data-key removed");
    equal(el.style.getPropertyValue("color"), "", "color cleared");
    equal(el.style.backgroundColor, "", "camelCase style cleared");
  });

  await test("sets and clears a CSS custom property with uppercase letters", async () => {
    const state = signal<{ v?: string }>({ v: "red" });
    const el = render<HTMLElement>({ style: { "--myColor": () => state.v } });
    equal(el.style.getPropertyValue("--myColor"), "red");

    state.v = undefined;
    await tick();

    equal(el.style.getPropertyValue("--myColor"), "");
  });

  await test("clearing a camelCase or kebab-case style reports the same updated detail", async () => {
    const state = signal<{ on?: boolean }>({ on: true });
    const { details, on } = updates();
    render<HTMLElement>({
      style: {
        backgroundColor: () => (state.on ? "red" : null),
        "font-size": () => (state.on ? "10px" : null),
      },
      on,
    });

    state.on = false;
    await tick();
    deepEqual(details, [
      {
        property: "style.backgroundColor",
        oldValue: "red",
        newValue: undefined,
      },
      { property: "style.font-size", oldValue: "10px", newValue: undefined },
    ]);

    state.on = true;
    await tick();
    equal(details.length, 2, "setting a cleared style again is not an update");
  });

  await test("restores the original value when a property binding clears", async () => {
    const state = signal<{ text?: string; extra?: string }>({
      text: "hi",
      extra: "x",
    });
    const el = render<HTMLElement & { extra?: string }>({
      textContent: () => state.text,
      extra: () => state.extra,
    });
    equal(el.textContent, "hi");

    state.text = undefined;
    state.extra = undefined;
    await tick();
    equal(el.textContent, "", "accessor property reset");
    equal("extra" in el, false, "own property deleted");

    state.text = "back";
    await tick();
    equal(el.textContent, "back", "binding still reactive");
  });

  await test("keeps a binding whose key is a prefix of a later key", async () => {
    const state = signal({ a: 1, b: 2 });
    const el = render<HTMLInputElement>({
      tagName: "input",
      maxLength: () => state.a,
      max: () => state.b,
    });
    state.a = 7;
    await tick();
    equal(el.maxLength, 7, "longer key stays reactive");
  });

  await test("attaches a shadow root with adopted stylesheets and updates its children", async () => {
    const sheet = new domWindow.CSSStyleSheet();
    sheet.insertRule("div { color: red; }");
    const state = signal({ showChild: true });
    const el = render<HTMLElement>({
      shadowRootMode: "open",
      adoptedStyleSheets: [sheet],
      children: () =>
        state.showChild ? [{ tagName: "span", textContent: "Shaded" }] : [],
    });
    const root = el.shadowRoot!;
    equal(root.mode, "open");
    equal(root.children[0].tagName, "SPAN", "children go inside shadow");
    equal(root.adoptedStyleSheets.length, 1);

    state.showChild = false;
    await tick();
    equal(root.children.length, 0, "children removed reactively");

    state.showChild = true;
    await tick();
    equal(root.children.length, 1, "child restored");
  });

  await test("re-mounts children of a host with its own or a closed shadow root", async () => {
    class OwnShadow extends domWindow.HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
      }
    }
    domWindow.customElements.define("own-shadow", OwnShadow);
    const config = [
      { tagName: "own-shadow" },
      { shadowRootMode: "closed" as const },
    ];
    for (const hostConfig of config) {
      const state = signal({ show: true, text: "a" });
      const { count, on } = lifecycle();
      let span: Node | undefined;
      const host = render<HTMLElement>({
        ...hostConfig,
        children: [
          {
            tagName: "span",
            textContent: () => state.text,
            on: {
              ...on,
              mounted() {
                on.mounted();
                span = this;
              },
            },
          },
        ],
      });
      render({ children: () => (state.show ? host : null) }, body);
      equal(count.mounted, 1);

      state.show = false;
      await tick();
      equal(count.removed, 1, "child removed with its host");

      state.show = true;
      state.text = "b";
      await tick();
      equal(count.mounted, 2, "child mounted again");
      equal(span?.textContent, "b", "bindings are rebuilt");
    }
  });

  await test("clears keys dropped from a reactive attributes, style, or dataset map", async () => {
    const state = signal({ full: true, text: "x" });
    const el = render<HTMLElement>({
      attributes: () =>
        state.full ? { title: "t", lang: () => state.text } : { title: "t" },
      style: () =>
        state.full ? { color: "red", top: "1px" } : { color: "red" },
      dataset: () => (state.full ? { a: "1", b: "2" } : { a: "1" }),
    });
    equal(el.getAttribute("lang"), "x");
    equal(el.style.top, "1px");
    equal(el.dataset.b, "2");

    state.full = false;
    await tick();
    equal(el.getAttribute("title"), "t", "kept key stays");
    equal(el.hasAttribute("lang"), false, "dropped attribute removed");
    equal(el.style.top, "", "dropped style removed");
    equal(el.style.color, "red", "kept style stays");
    equal(el.hasAttribute("data-b"), false, "dropped data attribute removed");
    equal(el.dataset.a, "1", "kept data attribute stays");

    // The dropped key's own binding is released.
    state.text = "y";
    await tick();
    equal(el.hasAttribute("lang"), false, "released binding does not reapply");

    state.full = true;
    await tick();
    equal(el.getAttribute("lang"), "y", "key returns when the map grows again");
    equal(el.style.top, "1px");
    equal(el.dataset.b, "2");
  });

  await test("clearing a map removes only the keys it applied", async () => {
    const state = signal({ on: true });
    const el = render<HTMLElement>({
      use: "div#my-id.my-class",
      attributes: () => (state.on ? { title: "t" } : {}),
      style: () => (state.on ? { color: "red" } : {}),
      // A non-object is not allowed by the types but still clears the map.
      dataset: () => (state.on ? { a: "1" } : (undefined as never)),
    });
    el.setAttribute("lang", "en");
    el.dataset.other = "x";
    el.style.top = "1px";
    equal(el.getAttribute("title"), "t");

    state.on = false;
    await tick();
    equal(el.hasAttribute("title"), false, "applied attribute removed");
    equal(el.hasAttribute("data-a"), false, "applied data attribute removed");
    equal(el.style.color, "", "applied style removed");
    equal(el.id, "my-id", "id from `use` kept");
    equal(el.className, "my-class", "class from `use` kept");
    equal(el.getAttribute("lang"), "en", "foreign attribute kept");
    equal(el.dataset.other, "x", "foreign data attribute kept");
    equal(el.style.top, "1px", "foreign style kept");

    el.style.top = "";
    state.on = true;
    await tick();
    equal(el.getAttribute("title"), "t", "map is applied again");
    equal(el.style.color, "red");
    equal(el.dataset.a, "1");
    state.on = false;
    await tick();
    equal(el.hasAttribute("style"), false, "empty style attribute removed");
  });

  await test("refreshes a nested custom property by path without altering the config", () => {
    type Host = HTMLElement & { data?: { label?: string } };
    let label = "a";
    const config = { label: () => label };
    const el = render<Host>({ data: config });
    const fire = () => refresh(el, "data.label");

    fire();
    equal((el as Host).data?.label, "a", "nested property is re-patched");
    label = "b";
    fire();
    equal((el as Host).data?.label, "b", "config function is still reactive");
    equal(typeof config.label, "function", "config object is not mutated");

    delete el.data;
    label = "c";
    fire();
    equal((el as Host).data?.label, "c", "missing parent object is created");
  });

  await test("lifecycle cascades through a supplied wrapper element", async () => {
    const state = signal({ show: true, text: "a" });
    const { count, on } = lifecycle();
    const wrapper = domWindow.document.createElement("section");
    const inner = render<HTMLElement>(
      { textContent: () => state.text, on },
      wrapper,
    );
    const host = render<HTMLElement>(
      { children: () => (state.show ? [wrapper] : []) },
      body,
    );

    state.show = false;
    await tick();
    equal(count.removed, 1, "inner element receives removed");
    state.text = "b";
    await tick();
    equal(inner.textContent, "a", "inner bindings are released");

    state.show = true;
    await tick();
    equal(count.mounted, 2, "inner element receives mounted again");
    equal(inner.textContent, "b", "inner bindings are rebuilt");
    host.remove();
  });
});
