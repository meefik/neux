import { suite, test, before, after, beforeEach } from "node:test";
import { equal, deepEqual } from "node:assert/strict";
import { i18n } from "./i18n";

const LOCALES = {
  en: {
    hello: "Hello",
    say: { hello: "Hello %{name}!" },
    "say.goodbye": "Goodbye",
    number: "Number: %{val}",
    date: "Date: %{val}",
    unique: "Unique",
    multi: "Hello %{a} and %{b}!",
  },
  ru: {
    hello: "Привет",
    say: { hello: "Привет %{name}!" },
    "say.goodbye": "До свидания",
    number: "Число: %{val}",
    date: "Дата: %{val}",
  },
};

suite("i18n", async () => {
  const t = i18n(LOCALES, { language: "ru", fallback: "en" });
  const g = globalThis as { reportError?: (e: unknown) => void };
  const prev = g.reportError;
  let errors: Error[] = [];

  before(() => {
    g.reportError = (e) => errors.push(e as Error);
  });
  beforeEach(() => {
    errors = [];
  });
  after(() => {
    g.reportError = prev;
  });

  await test("resolves flat keys, dot paths, and multiple placeholders", () => {
    equal(t("hello"), "Привет");
    equal(t("say.hello", { name: "Joe" }), "Привет Joe!");
    equal(t("say.goodbye"), "До свидания");
    equal(t("multi", { a: "Alice", b: "Bob" }), "Hello Alice and Bob!");
  });

  await test("overrides the language, falling back for missing locales and keys", () => {
    equal(t("hello", "en"), "Hello");
    equal(t("say.hello", { name: "Joe" }, "en"), "Hello Joe!");
    equal(t("hello", "fr"), "Hello");
    equal(t("unique", "ru"), "Unique");
  });

  await test("formats numbers and dates via Intl in interpolations and directly", () => {
    const money = { style: "currency", currency: "USD" };
    equal(t("number", { val: [12345, money] }, "en"), "Number: $12,345.00");
    equal(t(12345, money, "en"), "$12,345.00");

    const day = { dateStyle: "full" };
    const d = new Date("2021-01-01");
    equal(t("date", { val: [d, day] }, "en"), "Date: Friday, January 1, 2021");
    equal(t(d, day, "en"), "Friday, January 1, 2021");
  });

  await test("returns unknown keys as-is and leaves missing placeholders intact", () => {
    equal(t("say.hi"), "say.hi");
    equal(t("number", {}, "en"), "Number: %{val}");
    equal(t("number", { other: 1 }, "en"), "Number: %{val}");
    equal(
      t("number", { val: ["plain", { style: "decimal" }] }, "en"),
      "Number: plain",
    );
  });

  await test("ignores inherited object keys and placeholder data", () => {
    equal(t("toString"), "toString");
    equal(t("constructor.name"), "constructor.name");
    equal(t("hello.length"), "hello.length", "no string properties");
    equal(t("hello", "constructor"), "Hello", "inherited language falls back");
    equal(t("hello", "__proto__"), "Hello");

    const tr = i18n({ en: { a: "%{toString} %{x}" } }, { language: "en" });
    equal(tr("a", { x: 1 }), "%{toString} 1", "inherited key is not data");
  });

  await test("treats a key naming a nested group as missing", () => {
    equal(t("say"), "say", "group key returns the key");
    equal(t("say", "ru"), "say", "group key in the language and fallback");
    const tr = i18n({ en: { say: "Hi" }, ru: { say: { hello: "Привет" } } });
    equal(
      tr("say", "ru"),
      "Hi",
      "group in the language falls back to the fallback text",
    );
  });

  await test("reports a missing key once per language, and not a resolved one", () => {
    const tr = i18n(LOCALES, { language: "ru", fallback: "en" });
    equal(tr("nope"), "nope", "the key is still returned");
    equal(tr("nope"), "nope");
    equal(errors.length, 1, "repeated lookups report once");
    equal(errors[0].message, 'i18n: no translation for "nope" in "ru"');

    equal(tr("nope", "en"), "nope");
    equal(errors.length, 2, "another language reports again");
    equal(errors[1].message, 'i18n: no translation for "nope" in "en"');

    equal(tr("say"), "say", "a group key counts as missing");
    equal(errors.length, 3);

    // Keys that resolve in the language or the fallback are not reported.
    errors = [];
    tr("hello");
    tr("unique", "ru");
    tr("hello", "fr");
    tr(1234, { style: "decimal" });
    deepEqual(errors, []);
  });

  await test("formats with the language the result comes from", () => {
    const tr = i18n(
      {
        en: { price: "Price: %{v}", onlyEn: "Only: %{v}" },
        ru: { price: "Цена: %{v}" },
      },
      { language: "ru", fallback: "en" },
    );
    const n = 1234.5;
    const val = [n];
    equal(
      tr("price", { v: val }),
      `Цена: ${n.toLocaleString("ru")}`,
      "a language with the key keeps its own format",
    );
    equal(
      tr("price", { v: val }, "ru-RU"),
      `Цена: ${n.toLocaleString("ru-RU")}`,
      "and its full code",
    );
    equal(
      tr("onlyEn", { v: val }),
      `Only: ${n.toLocaleString("en")}`,
      "a key found only in the fallback formats as the fallback",
    );
    equal(
      tr("price", { v: val }, "fr"),
      `Price: ${n.toLocaleString("en")}`,
      "a language without a locale formats as the fallback",
    );
    equal(
      tr(n, "ru"),
      n.toLocaleString("ru"),
      "a direct value uses a language that has a locale",
    );
    equal(tr(n, "fr"), n.toLocaleString("en"), "and the fallback otherwise");
  });

  await test("matches a regional language to its base translations", () => {
    const tr = i18n(LOCALES, { language: "ru-RU", fallback: "en" });
    equal(tr("hello"), "Привет", "uses `ru` for `ru-RU`");
    equal(tr("unique"), "Unique", "falls back for missing keys");
    equal(tr("hello", "de-AT"), "Hello", "unknown language uses the fallback");
    equal(
      tr(1234.5, "ru-RU"),
      (1234.5).toLocaleString("ru-RU"),
      "formats with the full tag",
    );
    equal(tr("hello", "en-US"), "Hello", "`en-US` uses `en`");

    const regionalFallback = i18n(LOCALES, {
      language: "de",
      fallback: "en-US",
    });
    equal(regionalFallback("hello"), "Hello", "`en-US` fallback uses `en`");
    equal(regionalFallback(1234.5), (1234.5).toLocaleString("en-US"));
  });

  await test("handles a fallback language without translations", () => {
    const tr = i18n(
      { ru: { hello: "Привет" } },
      { language: "ru", fallback: "en" },
    );
    equal(tr("hello"), "Привет", "the language still resolves");
    equal(tr("nope"), "nope", "a missing key returns the key");
    equal(errors.length, 1, "and is reported");
    equal(
      tr("hello", "fr"),
      "hello",
      "an unknown language has no fallback text",
    );
    equal(
      tr(1234.5, "fr"),
      (1234.5).toLocaleString("en"),
      "and formats as the fallback",
    );
  });
});
