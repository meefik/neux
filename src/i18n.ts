/**
 * Internationalization utilities for resolving translations and interpolating placeholders.
 *
 * Creates a translation function that looks up strings by dot-separated keys,
 * uses a fallback language for missing keys, and formats values with `Intl` APIs.
 *
 * @module i18n
 */

import { hasOwn, report } from "./helpers.js";

/**
 * Signature of the translation function returned by {@link i18n}.
 */
export interface Translator {
  /**
   * A translation function that resolves and interpolates a translation string.
   *
   * @param keyOrValue Translation key, or a value to format directly.
   * @param dataOrLang Object providing interpolation data, or a language code used when `lang` is omitted.
   * @param lang Optional language code; takes precedence over `dataOrLang` and the default language.
   * @returns The resolved and interpolated translation string.
   */
  (
    keyOrValue: string | number | Date,
    dataOrLang?: Record<string, unknown> | string,
    lang?: string,
  ): string;
}

/** Reads an own property of an object; inherited keys such as `toString` are not translations. */
function own(obj: any, key: string): any {
  return obj && typeof obj === "object" && hasOwn(obj, key)
    ? obj[key]
    : undefined;
}

/**
 * The matching form of a tag: trimmed, lowercased, and with `_` written as `-`,
 * so `ru_RU` and `ru-RU` compare equal.
 */
function norm(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * The `Intl` form of a tag: its leading 2-3 letter language, plus its script
 * and region when they are valid; `en` when there is no language. So
 * `sr-Latn-RS` stays whole, `ru-12` and `ru-RU.UTF-8` reduce to `ru`, and
 * formatting never throws.
 */
function formatLang(tag: string): string {
  const [lang, ...rest] = norm(tag).split("-");
  const base = lang.match(/^[a-z]{2,3}/)?.[0];
  if (!base) return "en";
  const script = /^[a-z]{4}$/.test(rest[0]) ? rest.shift() : undefined;
  const region = /^[a-z]{2}$|^[0-9]{3}$/.test(rest[0]) ? rest[0] : undefined;
  return [base, script, region].filter(Boolean).join("-");
}

/** Looks up a translation by dot-separated path or flat key from a locale map; a key naming a nested group is not a translation. */
function resolve(
  locales: Record<string, any>,
  key: string,
  lang: string,
): unknown {
  const map = own(locales, lang);
  const text = map && (own(map, key) ?? key.split(".").reduce(own, map));
  return typeof text === "object" ? undefined : text;
}

/** Replaces `%{key}` placeholders with own values from data; missing keys, including inherited ones such as `toString`, are left as-is. */
function fill(
  text: string,
  lang: string,
  data?: Record<string, unknown>,
): string {
  return data
    ? text.replace(/%\{([^}]+)\}/g, (_, k) => {
        const v = own(data, k);
        const [val, opts] = Array.isArray(v) ? v : [v];
        const out = val?.toLocaleString?.(lang, opts) ?? val;
        return out === undefined ? `%{${k}}` : String(out);
      })
    : text;
}

/**
 * Creates a translation function.
 *
 * The returned function resolves a translation string by dot-separated path
 * (or a flat key), interpolates `%{key}`-style placeholders from a data
 * object, and formats a non-string first argument directly via
 * `toLocaleString`.
 *
 * A requested language is matched case- and separator-insensitively to an
 * exact locale key, or — when there is none — to the nearest one: the longest
 * key the language starts with at a subtag boundary (`ru-RU` matches `ru`,
 * and `zh-Hant-TW` matches `zh-Hant`, but `run-BI` does not match `ru`).
 *
 * Formatting follows the language the result comes from: a language with
 * translations (an exact entry, or its base such as `ru` for `ru-RU`) formats
 * with its full code; a language without an entry, and a key found only in
 * the fallback, format with the fallback instead, so a value never mixes one
 * language's text with another's formatting.
 *
 * Language-sensitive formatting:
 * - [Intl.DateTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
 * - [Intl.NumberFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
 *
 * @category I18n
 *
 * @param locales A map of language codes to translation objects. Keys are matched case- and separator-insensitively, so `ru_RU` and `ru-RU` are equivalent.
 * @param options Configuration options.
 * @param options.language Default language code; defaults to the browser language. Resolved case- and separator-insensitively; a regional code such as `"ru-RU"` (or `"ru_RU"`) uses the `"ru"` translations when it has no entry of its own.
 * @param options.fallback Fallback language code when the default is unavailable; defaults to `"en"`. Resolved case- and separator-insensitively; a regional code such as `"en-US"` (or `"en_US"`) uses the `"en"` translations when it has no entry of its own.
 * @returns A translation function. Missing keys, fallback misses, and keys naming a nested group instead of a string return the key itself. Each such key is also reported once per locale through `reportError` (or `console.error` where it is unavailable).
 *
 * @example
 * ```ts
 * const t = i18n({
 *   en: {
 *     say: { hello: "Hello, %{name}!" },
 *     speed: "Speed: %{value}",
 *     birthday: "Birthday: %{date}",
 *   },
 *   de: {
 *     say: { hello: "Hallo, %{name}!" },
 *     speed: "Geschwindigkeit: %{value}",
 *     birthday: "Geburtstag: %{date}",
 *   },
 * });
 *
 * // text with variables
 * t("say.hello", { name: "Alice" }); // Hello, Alice!
 * // explicitly specified locale
 * t("say.hello", { name: "Emma" }, "de"); // Hallo, Emma!
 *
 * // Intl.NumberFormat
 * t("speed", { value: [15, { style: "unit", unit: "kilometer-per-hour" }] }); // Speed: 15 km/h
 * t(1234, { style: "currency", currency: "USD" }); // $1,234.00
 *
 * // Intl.DateTimeFormat
 * t("birthday", { date: [new Date(2021, 0, 1), { dateStyle: "short" }] }); // Birthday: 1/1/21
 * t(new Date(2021, 0, 1), { dateStyle: "full" }); // Friday, January 1, 2021
 * ```
 */
export function i18n(
  locales: Record<string, Record<string, any>>,
  options?: { language?: string; fallback?: string },
): Translator {
  const {
    language = (typeof navigator !== "undefined" && navigator.language) || "en",
    fallback = "en",
  } = options ?? {};
  // Locale keys in matching form, longest first, so the nearest match is the
  // first that fits; the original key is kept for lookups.
  const keys = Object.keys(locales)
    .map((k) => [norm(k), k])
    .sort((a, b) => b[0].length - a[0].length);

  // The locale for a tag: the longest key the tag starts with that ends at a
  // subtag boundary — the whole tag, or one followed by `-`. So `ru-RU` matches
  // `ru` and `zh-Hant-TW` matches `zh-Hant`, while `run-BI` does not match `ru`.
  function find(tag: string): string | undefined {
    const t = norm(tag);
    for (const [key, orig] of keys) {
      if (
        t.startsWith(key) &&
        (t.length === key.length || t[key.length] === "-")
      ) {
        return orig;
      }
    }
    return undefined;
  }

  // The fallback locale and language, resolved once; an unparseable one
  // (no language) formats as `en`.
  const fallbackKey = find(fallback) ?? "";
  const fallbackLang = formatLang(fallback);
  const missing = new Set<string>();
  return (keyOrValue, dataOrLang, lang) => {
    const curLang =
      lang ?? (typeof dataOrLang === "string" ? dataOrLang : language);
    const data = typeof dataOrLang === "object" ? dataOrLang : undefined;
    const matched = find(curLang);
    // Translations come from the matched locale; formatting keeps the full code.
    const effectiveLang = matched ? formatLang(curLang) : fallbackLang;

    if (typeof keyOrValue === "string") {
      // A key found only in the fallback also formats as the fallback.
      let text = matched ? resolve(locales, keyOrValue, matched) : undefined;
      let usedLang = effectiveLang;
      if (text === undefined) {
        text = resolve(locales, keyOrValue, fallbackKey);
        usedLang = fallbackLang;
      }
      if (text === undefined) {
        // Report each missing key once per locale, so a re-running effect does not repeat it.
        // The locale that lacks the key is the matched one, or the requested language when none matched.
        const reportLang = matched ?? (norm(curLang) || curLang);
        const id = `${reportLang}\0${keyOrValue}`;
        if (!missing.has(id)) {
          missing.add(id);
          report(
            new Error(
              `i18n: no translation for "${keyOrValue}" in "${reportLang}"`,
            ),
          );
        }
      }
      return fill(String(text ?? keyOrValue), usedLang, data);
    }

    return keyOrValue.toLocaleString(effectiveLang, data);
  };
}
