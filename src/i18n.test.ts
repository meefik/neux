import { suite, test } from "node:test";
import { equal } from "node:assert/strict";
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

  await test("resolves translations in the default language", () => {
    equal(t("hello"), "Привет");
    equal(t("say.hello", { name: "Joe" }), "Привет Joe!");
  });

  await test("supports flat keys, dot paths, and multiple placeholders", () => {
    equal(t("say.goodbye"), "До свидания");
    equal(t("multi", { a: "Alice", b: "Bob" }), "Hello Alice and Bob!");
  });

  await test("overrides language with a string or third argument", () => {
    equal(t("hello", "en"), "Hello");
    equal(t("say.hello", { name: "Joe" }, "en"), "Hello Joe!");
  });

  await test("falls back to the fallback language for missing locales and keys", () => {
    equal(t("hello", "fr"), "Hello");
    equal(t("unique", "ru"), "Unique");
  });

  await test("formats numbers via Intl.NumberFormat in interpolations and directly", () => {
    const fmt = { style: "currency", currency: "USD" };
    equal(t("number", { val: [12345, fmt] }, "en"), "Number: $12,345.00");
    equal(t(12345, fmt, "en"), "$12,345.00");
  });

  await test("formats dates via Intl.DateTimeFormat in interpolations and directly", () => {
    const fmt = { dateStyle: "full" };
    const d = new Date("2021-01-01");
    equal(t("date", { val: [d, fmt] }, "en"), "Date: Friday, January 1, 2021");
    equal(t(new Date("2021-01-01"), fmt, "en"), "Friday, January 1, 2021");
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
});
