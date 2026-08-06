import { suite, test, before, after } from "node:test";
import { equal, ok } from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { render } from "./render";
import { signal } from "./signal";

const tick = () => wait(0);

suite("render", async () => {
  let domWindow: typeof window;

  before(() => {
    const dom = new JSDOM("", {
      url: "http://localhost",
      contentType: "text/html",
    });
    domWindow = dom.window as unknown as typeof window;
    global.window = domWindow;
  });

  after(async () => {
    await tick();
    (globalThis as Record<string, unknown>).window = undefined;
  });

  await test("renders text nodes", () => {
    const text = render("Hello");
    equal(text.nodeType, domWindow.Node.TEXT_NODE, "is text node");
    equal(text.textContent, "Hello", "has correct text content");

    const nodes = render(["A", "B"]);
    equal(nodes[0].textContent, "A", "first child renders");
    equal(nodes[1].textContent, "B", "second child renders");
  });

  await test("passes through existing Node", () => {
    const node = domWindow.document.createTextNode("pass");
    equal(render(node), node, "returns the same node");
  });

  await test("sets properties: tag, id, classes, attributes, dataset, style, textContent", () => {
    const el = render({
      tagName: "p",
      id: "my-id",
      className: ["my-class1", "my-class2"],
      attributes: { for: "my-input" },
      dataset: { id: "123" },
      style: { color: "red", "background-color": "blue" },
      textContent: "Hello World",
    }) as HTMLElement;

    equal(el.tagName, "P", "has P tag");
    equal(el.id, "my-id", "has correct id");
    equal(el.className, "my-class1 my-class2", "joins classes");
    equal(el.getAttribute("for"), "my-input", "sets for attribute");
    equal(el.dataset.id, "123", "sets data-id");
    equal(el.style.color, "red", "has red color");
    equal(el.style.backgroundColor, "blue", "has blue background");
    equal(el.textContent, "Hello World", "has text content");
  });

  await test("sets className from array and string", () => {
    const el = render({
      children: [{ className: ["a", "b", "c"] }, { className: "d e f" }],
    }) as HTMLElement;

    equal(el.children[0].className, "a b c", "joins array classes");
    equal(el.children[1].className, "d e f", "uses string classes directly");
  });

  await test("infers namespace from element type", () => {
    const el = render({
      children: [
        {
          tagName: "svg",
          className: "icon",
          children: [{ tagName: "path" }],
        },
        {
          tagName: "math",
          children: [
            {
              tagName: "msup",
              children: [
                { tagName: "mi", textContent: "\u03c0" },
                { tagName: "mn", textContent: 2 },
              ],
            },
          ],
        },
      ],
    }) as HTMLElement;

    const xhtmlNS = "http://www.w3.org/1999/xhtml";
    const svgNS = "http://www.w3.org/2000/svg";
    const mathNS = "http://www.w3.org/1998/Math/MathML";

    equal(el.namespaceURI, xhtmlNS, "has XHTML namespace");
    equal(el.children[0].namespaceURI, svgNS, "has SVG namespace");
    equal(
      el.children[0].children[0].namespaceURI,
      svgNS,
      "SVG path inherits parent namespace",
    );
    equal(el.children[1].namespaceURI, mathNS, "has MathML namespace");
    equal(
      el.children[1].children[0].namespaceURI,
      mathNS,
      "MathML msup inherits parent namespace",
    );
  });

  await test("use: parses tag selector, HTML markup, or reuses element", () => {
    const el1 = render({
      use: "p#id1.cls1.cls2",
      textContent: "Text",
    }) as HTMLElement;
    equal(el1.tagName, "P", "has P tag");
    equal(el1.id, "id1", "has correct id");
    equal(el1.className, "cls1 cls2", "joins classes from selector");

    const el2 = render({
      use: "<span></span>",
      className: "cls1",
    }) as HTMLElement;
    equal(el2.tagName, "SPAN", "has SPAN tag");
    equal(el2.className, "cls1", "has correct class");

    const span = domWindow.document.createElement("span");
    const el3 = render({
      use: span,
      className: "cls1",
    }) as HTMLElement;
    equal(el3, span, "reuses the same element");
    equal(el3.className, "cls1", "has correct class");
  });

  await test("renders children", () => {
    const fragment = domWindow.document.createDocumentFragment();
    const span = domWindow.document.createElement("li");
    span.textContent = "Item 3";
    fragment.appendChild(span);

    const el = render({
      tagName: "ul",
      children: [
        { tagName: "li", textContent: "Item 1" },
        { tagName: "li", textContent: "Item 2" },
        fragment,
      ],
    }) as HTMLElement;

    equal(el.children.length, 3, "has 3 children");
    equal(el.children[0].textContent, "Item 1", "first item renders");
    equal(el.children[1].textContent, "Item 2", "second item renders");
    equal(el.children[2].textContent, "Item 3", "fragment item renders");
  });

  await test("mounts element into DOM or CSS selector target", () => {
    const el1 = render(
      { tagName: "p" },
      domWindow.document.body,
    ) as HTMLElement;
    equal(domWindow.document.body.firstChild, el1, "element is mounted");
    el1.remove();

    const wrapper = domWindow.document.createElement("div");
    wrapper.id = "test-mount";
    domWindow.document.body.appendChild(wrapper);
    try {
      const el2 = render({ tagName: "span" }, "#test-mount") as HTMLElement;
      equal(wrapper.firstChild, el2, "element is mounted via selector");
    } finally {
      wrapper.remove();
    }
  });

  await test("dispatches custom event handlers", () => {
    let value = 1;
    const el = render({
      tagName: "input",
      type: "number",
      value,
      on: {
        change(e: Event) {
          value = parseInt((e.target as HTMLInputElement).value, 10);
        },
      },
    }) as HTMLInputElement;

    el.value = "2";
    el.dispatchEvent(
      new domWindow.Event("change", { bubbles: true, cancelable: true }),
    );
    equal(value, 2, "handler updated value");
  });

  await test("fires lifecycle hooks: mounted and removed", async () => {
    let mounted = 0;
    let removed = 0;
    let show = true;

    const el = render(
      {
        children: () =>
          show
            ? [
                {
                  textContent: "Hello",
                  on: {
                    mounted() {
                      mounted++;
                    },
                    removed() {
                      removed++;
                    },
                  },
                },
              ]
            : [],
      },
      domWindow.document.body,
    ) as HTMLElement;

    equal(mounted, 1, "mounted callback fires once on append");
    equal(removed, 0, "no removal yet");

    show = false;
    el.dispatchEvent(new domWindow.Event("refresh"));
    await tick();
    equal(removed, 1, "removed callback fires once on removal");
  });

  await test("fires mounted once for nested render children", async () => {
    let countA = 0;
    let countB = 0;
    let countC = 0;

    render(
      {
        on: {
          mounted() {
            countA++;
          },
        },
        children: [
          render({
            on: {
              mounted() {
                countB++;
              },
            },
            children: [
              {
                on: {
                  mounted() {
                    countC++;
                  },
                },
              },
            ],
          }),
        ],
      },
      domWindow.document.body,
    );

    equal(countA, 1, "outer mounted fires once");
    equal(countB, 1, "inner mounted fires once");
    equal(countC, 1, "nested mounted fires once");
  });

  await test("bind: respects bound signal for reactive updates", async () => {
    const ctx = {};
    const s = signal.bind(ctx);
    const r = render.bind(ctx);

    const state = s({ textContent: "text" });
    const el = r({
      textContent: () => state.textContent,
    });
    equal(el.textContent, "text", "has initial text content from bound signal");

    state.textContent = "updated";
    await tick();
    equal(el.textContent, "updated", "text updates via reactivity");
  });

  await test("accepts bound signal as config for render", async () => {
    const state = signal({ textContent: "Text" });

    const el = render(state) as HTMLElement;
    equal(el.textContent, "Text", "has text content from signal");
  });

  await test("reactive textContent", async () => {
    const state = signal({ text: "" });
    const el = render({
      textContent: () => state.text,
    }) as HTMLElement;

    equal(el.textContent, "", "initial text is empty");
    state.text = "Hello";
    await tick();
    equal(el.textContent, "Hello", "text updates reactively");
  });

  await test("reactive style, dataset, attributes, and className", async () => {
    const state = signal({
      color: "red",
      id1: "1",
      attr: "",
      cls: ["a"],
    });
    const el = render({
      style() {
        return { color: state.color };
      },
      dataset() {
        return { id1: state.id1 };
      },
      attributes: { for: () => state.attr },
      className: () => state.cls,
    }) as HTMLElement;

    // Initial values
    equal(el.style.color, "red", "has initial red color");
    equal(el.dataset.id1, "1", "has initial data-id1");
    equal(el.getAttribute("for"), "", "attr is initially empty");
    equal(el.className, "a", "has initial class");

    // Update all reactive bindings
    state.color = "blue";
    state.id1 = "2";
    state.attr = "my-input";
    state.cls = ["a", "b"];
    await tick();

    equal(el.style.color, "blue", "color updates to blue");
    equal(el.dataset.id1, "2", "data-id1 updates");
    equal(el.getAttribute("for"), "my-input", "attr updates");
    equal(el.className, "a b", "classes update");
  });

  await test("resolves async property", async () => {
    const state = signal({ counter: 1 });
    const el = render({
      textContent: async () =>
        new Promise<number>((res) => setTimeout(() => res(state.counter), 0)),
    }) as HTMLElement;

    state.counter = 2;
    await tick();
    equal(el.textContent, "2", "async text resolves");
  });

  await test("reactive children", async () => {
    const state = signal({
      list: [{ text: "Item 1" }, { text: "Item 2" }],
    }) as { list: { text: string }[] };
    const el = render({
      tagName: "ul",
      children: () =>
        state.list.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
        })),
    }) as HTMLElement;

    equal(el.children.length, 2, "has 2 initial children");
    state.list = [{ text: "Item 3" }, { text: "Item 4" }];
    await tick();
    equal(el.children[0].textContent, "Item 3", "first child updates");
    equal(el.children[1].textContent, "Item 4", "second child updates");
  });

  await test("child reconciliation: reorder, insert, remove, clear", async () => {
    let list = [
      { text: "A" },
      { text: "B" },
      { text: "C" },
      { text: "D" },
      { text: "E" },
    ];
    let removed = false;

    const el = render({
      tagName: "ul",
      children: () =>
        list.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
          on: {
            removed() {
              removed = true;
            },
          },
        })),
    }) as HTMLElement;

    // Reorder and insert
    list.splice(1, 2, { text: "C" }, { text: "B" });
    list.splice(3, 0, { text: "X" });
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();

    equal(
      Array.from(el.children)
        .map((c) => c.textContent)
        .join(","),
      "A,C,B,X,D,E",
      "children reordered with insertion",
    );

    // Remove (triggers removed event)
    list = [{ text: "Only" }];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    ok(removed, "removed event fires on reconciled child");
    equal(el.children.length, 1, "has one child");

    // Clear
    list = [];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    equal(el.children.length, 0, "no children remain");
  });

  await test("reconciles identical children as no-op", async () => {
    let items = [{ text: "A" }, { text: "B" }, { text: "C" }];
    const el = render({
      tagName: "ul",
      children: () =>
        items.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
        })),
    }) as HTMLElement;

    equal(el.children.length, 3, "has 3 initial children");

    // Re-render with identical list — should produce no changes
    items = [{ text: "A" }, { text: "B" }, { text: "C" }];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    equal(el.children.length, 3, "still has 3 children after no-op refresh");
    equal(el.children[0].textContent, "A", "first child unchanged");
    equal(el.children[2].textContent, "C", "last child unchanged");
  });

  await test("emits updated events on reactive changes and refresh", async () => {
    const state = signal({
      value: 0,
      color: "red",
      text: "hello",
      id: "1",
    });
    const updatedDetails: Array<{
      property: string;
      oldValue?: unknown;
      newValue?: unknown;
    }> = [];

    const el = render({
      textContent: () => String(state.value),
      style: { color: () => state.color },
      attributes: { "data-x": () => state.text },
      dataset: { id: () => state.id },
      on: {
        updated(e: Event) {
          const detail = (
            e as CustomEvent<{
              property: string;
              oldValue?: unknown;
              newValue?: unknown;
            }>
          ).detail;
          updatedDetails.push(detail);
        },
      },
    }) as HTMLElement;

    // Reactive changes emit updated events with old/new values
    state.value = 42;
    state.color = "blue";
    state.text = "world";
    state.id = "2";
    await tick();

    equal(updatedDetails.length, 4, "has 4 updates");
    equal(
      updatedDetails[0].property,
      "textContent",
      "first update is textContent",
    );
    equal(
      String(updatedDetails[0].newValue),
      "42",
      "textContent new value is 42",
    );
    equal(updatedDetails[0].oldValue, "0", "has old textContent value");
    equal(
      updatedDetails[1].property,
      "style.color",
      "second update is style.color",
    );
    equal(
      updatedDetails[2].property,
      "attributes.data-x",
      "third update is attributes.data-x",
    );
    equal(
      updatedDetails[3].property,
      "dataset.id",
      "fourth update is dataset.id",
    );

    // Refresh without detail re-patches all bindings
    state.value = 100;
    await tick();
    equal(
      el.textContent,
      "100",
      "all bindings re-patched after reactive change",
    );
  });

  await test("refresh with reactive state re-patches all bindings", async () => {
    let text = "initial";
    let cls = "one";
    const el = render({
      textContent: () => text,
      className: () => cls,
    }) as HTMLElement;

    text = "changed";
    cls = "two";
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();

    equal(el.textContent, "changed", "text updates");
    equal(el.className, "two", "class updates");
  });

  await test("cleared reactive bindings remove values", async () => {
    const state = signal<{
      attr?: string;
      val?: string;
      color?: string;
    }>({
      attr: "present",
      val: "1",
      color: "red",
    });
    const el = render({
      tagName: "input",
      type: "text",
      attributes: { placeholder: () => state.attr as unknown as string },
      dataset: { key: () => state.val as unknown as string },
      style: { color: () => state.color as unknown as string },
    }) as HTMLInputElement;

    equal(el.getAttribute("placeholder"), "present", "has placeholder");
    equal(el.dataset.key, "1", "has data-key");
    equal(el.style.color, "red", "has red color");

    state.attr = undefined;
    state.val = undefined;
    state.color = undefined;
    await tick();

    equal(el.getAttribute("placeholder"), null, "attribute removed");
    equal(el.hasAttribute("data-key"), false, "data-key removed");
    equal(el.style.getPropertyValue("color"), "", "color cleared");
  });

  await test("attaches shadow root with adopted stylesheets", () => {
    const sheet = new domWindow.CSSStyleSheet();
    sheet.insertRule("div { color: red; }");
    const el = render({
      shadowRootMode: "open",
      adoptedStyleSheets: [sheet],
      children: [{ tagName: "span", textContent: "Shaded" }],
    }) as HTMLElement;

    ok(el.shadowRoot, "has shadow root");
    equal(el.shadowRoot.mode, "open", "is in open mode");
    equal(el.shadowRoot.children[0].tagName, "SPAN", "SPAN is inside shadow");
    equal(
      el.shadowRoot!.adoptedStyleSheets.length,
      1,
      "has adopted stylesheet",
    );
  });

  await test("shadowRoot reactive children updates", async () => {
    const state = signal({ showChild: true }) as { showChild: boolean };
    const el = render({
      shadowRootMode: "open",
      children: () =>
        state.showChild ? [{ tagName: "span", textContent: "Inside" }] : [],
    }) as HTMLElement;

    ok(el.shadowRoot, "has shadow root");
    equal(el.shadowRoot!.children.length, 1, "has one child in shadow DOM");

    state.showChild = false;
    await tick();
    equal(el.shadowRoot!.children.length, 0, "children removed reactively");

    state.showChild = true;
    await tick();
    equal(el.shadowRoot!.children.length, 1, "child restored in shadow DOM");
  });

  await test("skips falsy children in arrays", () => {
    const nodes = render([
      "A",
      null,
      undefined,
      "B",
      {
        children: ["C", null, undefined, { textContent: "D" }],
      },
    ]);
    equal(nodes.length, 3, "renders only non-falsy children");
    equal(nodes[0].textContent, "A", "first child is A");
    equal(nodes[1].textContent, "B", "second child is B");

    const nested = nodes[2];
    ok(nested instanceof domWindow.Element);
    equal(
      nested.childNodes.length,
      2,
      "nested element has 2 non-falsy children",
    );
    equal(nested.childNodes[0].textContent, "C", "first nested child is C");
    equal(nested.childNodes[1].textContent, "D", "second nested child is D");
  });

  await test("non-plain-object config creates default div", () => {
    const obj = Object.create(null);
    obj.tagName = "p";
    const el = render(obj as unknown as Record<string, unknown>) as HTMLElement;
    equal(el.tagName, "DIV", "creates default DIV");
  });
});
