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
    equal(
      t("hello", "ru", "en"),
      "Hello",
      "`lang` takes precedence over a string `dataOrLang`",
    );
    equal(t("hello", "en", "ru"), "Привет", "and over the default language");
  });

  await test("formats numbers and dates via Intl in interpolations and directly", () => {
    const money = { style: "currency", currency: "USD" };
    equal(t("number", { val: [12345, money] }, "en"), "Number: $12,345.00");
    equal(t(12345, money, "en"), "$12,345.00");

    const day = { dateStyle: "full" };
    const d = new Date(2021, 0, 1);
    equal(t("date", { val: [d, day] }, "en"), "Date: Friday, January 1, 2021");
    equal(t(d, day, "en"), "Friday, January 1, 2021");
  });

  await test("returns unknown keys as-is and leaves missing placeholders intact", () => {
    equal(t("say.hi"), "say.hi");
    equal(t("number", {}, "en"), "Number: %{val}");
    equal(
      t("number", { val: ["plain", { style: "decimal" }] }, "en"),
      "Number: plain",
    );
  });

  await test("ignores inherited object keys and placeholder data", () => {
    equal(t("toString"), "toString");
    equal(t("constructor.name"), "constructor.name");
    equal(t("hello.length"), "hello.length", "no string properties");
    equal(t("hello", "__proto__"), "Hello");

    const tr = i18n({ en: { a: "%{toString} %{x}" } }, { language: "en" });
    equal(tr("a", { x: 1 }), "%{toString} 1", "inherited key is not data");
  });

  await test("treats a key naming a nested group as missing", () => {
    equal(
      t("say"),
      "say",
      "a group key is missing in the language and the fallback",
    );
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

  await test("reports a missing key once per locale, not per tag spelling", () => {
    const tr = i18n(LOCALES, { language: "ru-RU", fallback: "en" });
    equal(tr("nope"), "nope");
    equal(tr("nope", "ru"), "nope", "the same locale under another spelling");
    equal(tr("nope", "ru_RU.UTF-8"), "nope");
    equal(errors.length, 1, "all spellings of `ru` report once");
    equal(errors[0].message, 'i18n: no translation for "nope" in "ru"');

    equal(tr("nope", "fr"), "nope", "an unmatched language reports on its own");
    equal(errors.length, 2);
    equal(errors[1].message, 'i18n: no translation for "nope" in "fr"');

    equal(tr("nope", "123"), "nope", "an unparseable tag reports as given");
    equal(errors.length, 3);
    equal(errors[2].message, 'i18n: no translation for "nope" in "123"');
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

    const latin = i18n(
      { "sr-Latn": { month: "%{d}" } },
      { language: "sr-Latn-RS" },
    );
    const d = new Date(2026, 0, 5);
    const opts = { month: "long" } as const;
    equal(
      latin("month", { d: [d, opts] }),
      d.toLocaleString("sr-Latn-RS", opts),
      "a script subtag is kept for formatting",
    );
  });

  await test("matches a regional language to its base translations", () => {
    const tr = i18n(LOCALES, { language: "ru-RU", fallback: "en" });
    equal(tr("hello"), "Привет", "uses `ru` for `ru-RU`");
    equal(
      tr(1234.5, "ru-RU"),
      (1234.5).toLocaleString("ru-RU"),
      "formats with the full tag",
    );
    equal(tr("hello", "en-US"), "Hello", "`en-US` uses `en`");
    equal(tr("hello", "ru_RU.UTF-8"), "Привет", "odd separators use the base");
    equal(
      tr(1234.5, "ru_RU.UTF-8"),
      (1234.5).toLocaleString("ru"),
      "and formats with the base, not the raw tag",
    );
    equal(tr("hello", "RU-RU"), "Привет", "matching is case-insensitive");
    equal(tr("hello", " ru "), "Привет", "and trims the tag");
    equal(
      tr(1234.5, "ru-12"),
      (1234.5).toLocaleString("ru"),
      "a tag Intl rejects resolves to its base instead of throwing",
    );
    equal(tr("hello", "i-klingon"), "Hello", "and so does a grandfathered tag");
    equal(
      tr("hello", "run"),
      "Hello",
      "a 3-letter code prefixing `ru` does not match it",
    );
    equal(tr("hello", "run-BI"), "Hello", "nor does a regional variant of it");

    const regionalFallback = i18n(LOCALES, {
      language: "de",
      fallback: "en-US",
    });
    equal(regionalFallback("hello"), "Hello", "`en-US` fallback uses `en`");
    equal(regionalFallback(1234.5), (1234.5).toLocaleString("en-US"));
  });

  await test("matches locale keys case-insensitively, including regional entries", () => {
    const tr = i18n(
      { "en-US": { hello: "Hello US" }, en: { hello: "Hello" } },
      { language: "en-US" },
    );
    equal(
      tr("hello"),
      "Hello US",
      "an exact regional entry wins over its base",
    );
    equal(tr("hello", "en"), "Hello", "the base entry still resolves");
    equal(tr("hello", "en-GB"), "Hello", "an unmatched region uses the base");

    const upper = i18n({ RU: { hello: "Привет" } }, { language: "ru" });
    equal(upper("hello"), "Привет", "an uppercase key matches a lowercase tag");

    const regionalOnly = i18n(
      { "ru-RU": { hello: "Привет РФ" } },
      { language: "ru-RU", fallback: "en" },
    );
    equal(regionalOnly("hello"), "Привет РФ", "a regional-only entry resolves");
  });

  await test("matches separator and case variants of a locale", () => {
    const tr = i18n(
      {
        ru: { hello: "RU" },
        ru_RU: { hello: "RURU" },
        ru_BY: { hello: "RUBY" },
      },
      { language: "ru", fallback: "en" },
    );
    equal(tr("hello", "ru_RU"), "RURU", "an underscore key matches as-is");
    equal(
      tr("hello", "ru-RU"),
      "RURU",
      "a dash request matches the underscore key",
    );
    equal(tr("hello", "ru_BY"), "RUBY", "another underscore key");
    equal(tr("hello"), "RU", "the base `ru` resolves the base key");
    equal(
      tr("hello", "ru-KZ"),
      "RU",
      "an unknown region falls back to the base",
    );
    equal(tr("hello", "ru-kz"), "RU", "and is case- and separator-insensitive");

    const onlyRegional = i18n(
      { en: { hello: "EN" }, ru_RU: { hello: "RURU" } },
      { language: "ru", fallback: "en" },
    );
    equal(
      onlyRegional("hello", "ru_KZ"),
      "EN",
      "with no base `ru`, an unknown region falls to the fallback",
    );
  });

  await test("matches a locale by its nearest key, not just its base", () => {
    const tr = i18n(
      {
        aB3: { hello: "AB3" },
        ru: { hello: "RU" },
        zh: { hello: "ZH" },
        "zh-Hant": { hello: "ZH-HANT" },
      },
      { language: "aB3", fallback: "en" },
    );
    equal(tr("hello", "aB3"), "AB3", "an exact key matches as-is");
    equal(tr("hello"), "AB3", "and the default language does");
    equal(
      tr("hello", "aB3-sa43t2w"),
      "AB3",
      "a longer tag matches the key at a subtag boundary",
    );
    equal(
      tr("hello", "zh-Hant-TW"),
      "ZH-HANT",
      "the longest matching key wins",
    );
    equal(tr("hello", "ZH_hant_tw"), "ZH-HANT", "and is case-insensitive");
    equal(tr("hello", "zh-Hans-CN"), "ZH", "another script uses the base");
    equal(
      tr("hello", "aB3xgd"),
      "hello",
      "a word that only prefixes the key does not match",
    );
    equal(
      tr("hello", "aB3xgd-sa43t2w"),
      "hello",
      "nor does one followed by more subtags",
    );
    equal(
      tr("hello", "ru-kz"),
      "RU",
      "an unknown region still falls back to the base key",
    );
    equal(tr("hello", "  "), "hello", "and a blank language reports as given");
  });

  await test("does not throw on an unparseable fallback", () => {
    const tr = i18n(
      { ru: { hello: "Привет" } },
      { language: "fr", fallback: "123" },
    );
    equal(
      tr(1234.5),
      (1234.5).toLocaleString("en"),
      "an unparseable fallback formats as the default `en`",
    );
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
