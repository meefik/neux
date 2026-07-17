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

  await test("Renders text nodes and document fragments", () => {
    const text = render("Hello") as Node;
    equal(text.nodeType, domWindow.Node.TEXT_NODE, "Expected text node");
    equal(text.textContent, "Hello", "Expected text content");

    const frag = render(["A", "B"]) as DocumentFragment;
    equal(
      frag.nodeType,
      domWindow.Node.DOCUMENT_FRAGMENT_NODE,
      "Expected fragment",
    );
    equal(frag.childNodes[0].textContent, "A", "Expected first child");
    equal(frag.childNodes[1].textContent, "B", "Expected second child");
  });

  await test("Passes through existing Node", () => {
    const node = domWindow.document.createTextNode("pass");
    equal(render(node), node, "Expected same node");
  });

  await test("Sets properties: tag, id, classes, attributes, dataset, style, textContent", () => {
    const el = render({
      tagName: "p",
      id: "my-id",
      className: ["my-class1", "my-class2"],
      attributes: { for: "my-input" },
      dataset: { id: "123" },
      style: { color: "red", "background-color": "blue" },
      textContent: "Hello World",
    }) as HTMLElement;

    equal(el.tagName, "P", "Expected P tag");
    equal(el.id, "my-id", "Expected id");
    equal(el.className, "my-class1 my-class2", "Expected classes");
    equal(el.getAttribute("for"), "my-input", "Expected for attribute");
    equal(el.dataset.id, "123", "Expected data-id");
    equal(el.style.color, "red", "Expected red color");
    equal(el.style.backgroundColor, "blue", "Expected blue background");
    equal(el.textContent, "Hello World", "Expected text content");
  });

  await test("Sets className from array and string", () => {
    const el = render({
      children: [{ className: ["a", "b", "c"] }, { className: "d e f" }],
    }) as HTMLElement;

    equal(el.children[0].className, "a b c", "Expected array classes on child");
    equal(
      el.children[1].className,
      "d e f",
      "Expected string classes on child",
    );
  });

  await test("Infers namespace from element type", () => {
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

    equal(el.namespaceURI, xhtmlNS, "Expected XHTML namespace");
    equal(el.children[0].namespaceURI, svgNS, "Expected SVG namespace");
    equal(
      el.children[0].children[0].namespaceURI,
      svgNS,
      "Expected SVG namespace on PATH",
    );
    equal(el.children[1].namespaceURI, mathNS, "Expected MathML namespace");
    equal(
      el.children[1].children[0].namespaceURI,
      mathNS,
      "Expected MathML namespace on MSUP",
    );
  });

  await test("use: parses tag selector, HTML markup, or reuses element", () => {
    const el1 = render({
      use: "p#id1.cls1.cls2",
      textContent: "Text",
    }) as HTMLElement;
    equal(el1.tagName, "P", "Expected P tag");
    equal(el1.id, "id1", "Expected id");
    equal(el1.className, "cls1 cls2", "Expected class");

    const el2 = render({
      use: "<span></span>",
      className: "cls1",
    }) as HTMLElement;
    equal(el2.tagName, "SPAN", "Expected SPAN tag");
    equal(el2.className, "cls1", "Expected class");

    const span = domWindow.document.createElement("span");
    const el3 = render({
      use: span,
      className: "cls1",
    }) as HTMLElement;
    equal(el3, span, "Expected same element");
    equal(el3.className, "cls1", "Expected class");
  });

  await test("Renders children", () => {
    const el = render({
      tagName: "ul",
      children: [
        { tagName: "li", textContent: "Item 1" },
        { tagName: "li", textContent: "Item 2" },
      ],
    }) as HTMLElement;

    equal(el.children.length, 2, "Expected 2 children");
    equal(el.children[0].textContent, "Item 1", "Expected first item");
    equal(el.children[1].textContent, "Item 2", "Expected second item");
  });

  await test("Mounts element into DOM or CSS selector target", () => {
    const el1 = render(
      { tagName: "p" },
      domWindow.document.body,
    ) as HTMLElement;
    equal(domWindow.document.body.firstChild, el1, "Expected mounted element");
    el1.remove();

    const wrapper = domWindow.document.createElement("div");
    wrapper.id = "test-mount";
    domWindow.document.body.appendChild(wrapper);
    try {
      const el2 = render({ tagName: "span" }, "#test-mount") as HTMLElement;
      equal(wrapper.firstChild, el2, "Expected mounted element via selector");
    } finally {
      wrapper.remove();
    }
  });

  await test("Dispatches custom event handlers", () => {
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
    equal(value, 2, "Expected updated value");
  });

  await test("Fires lifecycle hooks: mounted and removed", async () => {
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

    equal(mounted, 1, "Expected mounted callback to fire once on append");
    equal(removed, 0, "Expected no removal yet");

    show = false;
    el.dispatchEvent(new domWindow.Event("refresh"));
    await tick();
    equal(removed, 1, "Expected removed callback to fire once on removal");
  });

  // ── Shared context for reactivity tests ───────────────────────────

  const ctx = {};
  const s = signal.bind(ctx);
  const r = render.bind(ctx);

  await test("Reactive textContent", async () => {
    const state = s({ text: "" });
    const el = r({
      textContent: () => state.text,
    }) as HTMLElement;

    equal(el.textContent, "", "Expected empty initial text");
    state.text = "Hello";
    await tick();
    equal(el.textContent, "Hello", "Expected updated text");
  });

  await test("Reactive style, dataset, attributes, and className", async () => {
    const state = s({
      color: "red",
      id1: "1",
      attr: "",
      cls: ["a"],
    });
    const el = r({
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
    equal(el.style.color, "red", "Expected initial red color");
    equal(el.dataset.id1, "1", "Expected initial data-id1");
    equal(el.getAttribute("for"), "", "Expected empty initial attr");
    equal(el.className, "a", "Expected initial class");

    // Update all reactive bindings
    state.color = "blue";
    state.id1 = "2";
    state.attr = "my-input";
    state.cls = ["a", "b"];
    await tick();

    equal(el.style.color, "blue", "Expected blue color");
    equal(el.dataset.id1, "2", "Expected updated data-id1");
    equal(el.getAttribute("for"), "my-input", "Expected updated attr");
    equal(el.className, "a b", "Expected updated classes");
  });

  await test("Resolves async property", async () => {
    const state = s({ counter: 1 });
    const el = r({
      textContent: async () =>
        new Promise<number>((res) => setTimeout(() => res(state.counter), 0)),
    }) as HTMLElement;

    state.counter = 2;
    await tick();
    equal(el.textContent, "2", "Expected resolved text content");
  });

  await test("Reactive children", async () => {
    const state = s({
      list: [{ text: "Item 1" }, { text: "Item 2" }],
    }) as { list: { text: string }[] };
    const el = r({
      tagName: "ul",
      children: () =>
        state.list.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
        })),
    }) as HTMLElement;

    equal(el.children.length, 2, "Expected 2 initial children");
    state.list = [{ text: "Item 3" }, { text: "Item 4" }];
    await tick();
    equal(el.children[0].textContent, "Item 3", "Expected first child");
    equal(el.children[1].textContent, "Item 4", "Expected second child");
  });

  await test("Child reconciliation: reorder, insert, remove, clear", async () => {
    let list = [
      { text: "A" },
      { text: "B" },
      { text: "C" },
      { text: "D" },
      { text: "E" },
    ];
    let removed = false;

    const el = r({
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
      "Expected reordered children with insertion",
    );

    // Remove (triggers removed event)
    list = [{ text: "Only" }];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    ok(removed, "Expected removed event on reconciled child");
    equal(el.children.length, 1, "Expected one child");

    // Clear
    list = [];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    equal(el.children.length, 0, "Expected no children");
  });

  await test("syncDOM no-op reconciliation (identical children)", async () => {
    let items = [{ text: "A" }, { text: "B" }, { text: "C" }];
    const el = r({
      tagName: "ul",
      children: () =>
        items.map((item) => ({
          tagName: "li",
          textContent: () => item.text,
        })),
    }) as HTMLElement;

    equal(el.children.length, 3, "Expected 3 initial children");

    // Re-render with identical list — should produce no changes
    items = [{ text: "A" }, { text: "B" }, { text: "C" }];
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();
    equal(el.children.length, 3, "Still 3 children after no-op refresh");
    equal(el.children[0].textContent, "A", "First child unchanged");
    equal(el.children[2].textContent, "C", "Last child unchanged");
  });

  await test("Emits updated events on reactive changes and refresh", async () => {
    const state = s({
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

    const el = r({
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

    equal(updatedDetails.length, 4, "Expected 4 updates");
    equal(updatedDetails[0].property, "textContent", "Expected textContent");
    equal(
      String(updatedDetails[0].newValue),
      "42",
      "textContent new value is 42",
    );
    equal(updatedDetails[0].oldValue, "0", "Expected old textContent value");
    equal(updatedDetails[1].property, "style.color", "Expected style.color");
    equal(
      updatedDetails[2].property,
      "attributes.data-x",
      "Expected attributes.data-x",
    );
    equal(updatedDetails[3].property, "dataset.id", "Expected dataset.id");

    // Refresh without detail re-patches all bindings
    state.value = 100;
    await tick();
    equal(
      el.textContent,
      "100",
      "All bindings re-patched after reactive change",
    );
  });

  await test("Refresh with reactive state re-patches all bindings", async () => {
    let text = "initial";
    let cls = "one";
    const el = r({
      textContent: () => text,
      className: () => cls,
    }) as HTMLElement;

    text = "changed";
    cls = "two";
    el.dispatchEvent(new domWindow.CustomEvent("refresh"));
    await tick();

    equal(el.textContent, "changed", "Expected updated text");
    equal(el.className, "two", "Expected updated class");
  });

  await test("Cleared reactive bindings remove values", async () => {
    const state = s({
      attr: "present",
      val: "1",
      color: "red",
    });
    const el = r({
      tagName: "input",
      type: "text",
      attributes: { placeholder: () => state.attr as unknown as string },
      dataset: { key: () => state.val as unknown as string },
      style: { color: () => state.color as unknown as string },
    }) as HTMLInputElement;

    equal(el.getAttribute("placeholder"), "present", "Expected placeholder");
    equal(el.dataset.key, "1", "Expected data-key");
    equal(el.style.color, "red", "Expected red color");

    state.attr = undefined;
    state.val = undefined;
    state.color = undefined;
    await tick();

    equal(el.getAttribute("placeholder"), null, "Expected removed attribute");
    equal(el.hasAttribute("data-key"), false, "Expected removed data-key");
    equal(el.style.getPropertyValue("color"), "", "Expected cleared color");
  });

  await test("Attaches shadow root with adopted stylesheets", () => {
    const sheet = new domWindow.CSSStyleSheet();
    sheet.insertRule("div { color: red; }");
    const el = render({
      shadowRootMode: "open",
      adoptedStyleSheets: [sheet],
      children: [{ tagName: "span", textContent: "Shaded" }],
    }) as HTMLElement;

    ok(el.shadowRoot, "Expected shadow root");
    equal(el.shadowRoot.mode, "open", "Expected open mode");
    equal(el.shadowRoot.children[0].tagName, "SPAN", "Expected SPAN in shadow");
    equal(
      el.shadowRoot!.adoptedStyleSheets.length,
      1,
      "Expected adopted stylesheet",
    );
  });

  await test("ShadowRoot reactive children updates", async () => {
    const state = s({ showChild: true }) as { showChild: boolean };
    const el = r({
      shadowRootMode: "open",
      children: () =>
        state.showChild ? [{ tagName: "span", textContent: "Inside" }] : [],
    }) as HTMLElement;

    ok(el.shadowRoot, "Expected shadow root");
    equal(
      el.shadowRoot!.children.length,
      1,
      "Expected one child in shadow DOM",
    );

    state.showChild = false;
    await tick();
    equal(
      el.shadowRoot!.children.length,
      0,
      "Expected zero children after reactive removal",
    );

    state.showChild = true;
    await tick();
    equal(
      el.shadowRoot!.children.length,
      1,
      "Expected one child restored in shadow DOM",
    );
  });

  await test("Calls function config without side effects", () => {
    let called = false;
    render(() => {
      called = true;
      return "";
    });
    ok(called, "Expected function to be called");
  });

  await test("createNode config function returns null", () => {
    const el = render(() => null as unknown as string);
    equal(el.nodeType, domWindow.Node.ELEMENT_NODE, "Expected element node");
    if (el instanceof domWindow.Element)
      equal(el.tagName, "DIV", "Fallback element defaults to DIV");
  });

  await test("Non-plain-object config creates default div", () => {
    const obj = Object.create(null);
    obj.tagName = "p";
    const el = render(obj as unknown as Record<string, unknown>) as HTMLElement;
    equal(el.tagName, "DIV", "Expected default DIV");
  });
});
