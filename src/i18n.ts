/**
 * Internationalization utilities for resolving translations and interpolating placeholders.
 *
 * Creates a translation function that looks up strings by dot-separated keys,
 * falls back to a default language, and formats values with `Intl` APIs.
 *
 * @module i18n
 */

import { report } from "./helpers.js";

/**
 * Signature of the translation function returned by {@link i18n}.
 */
export interface Translator {
  /**
   * A translation function that resolves and interpolates a translation string.
   *
   * @param keyOrValue Translation key, or a value to format directly.
   * @param dataOrLang Object providing interpolation data, or a language code override.
   * @param lang Optional language code; used when `dataOrLang` is a data object.
   * @returns The resolved and interpolated translation string.
   */
  (
    keyOrValue: string | number | Date,
    dataOrLang?: Record<string, unknown> | string,
    lang?: string,
  ): string;
}

/** Returns the browser's preferred language from `navigator.language`, or "en" when unavailable. */
function navigatorLanguage(): string {
  return (typeof navigator !== "undefined" && navigator.language) || "en";
}

/** Reads an own property of an object; inherited keys such as `toString` are not translations. */
function own(obj: any, key: string): any {
  return obj &&
    typeof obj === "object" &&
    Object.prototype.hasOwnProperty.call(obj, key)
    ? obj[key]
    : undefined;
}

/** Finds the locale key for a language: an exact match, else its base language (`ru-RU` → `ru`). */
function matchLanguage(
  locales: Record<string, any>,
  lang: string,
): string | undefined {
  if (own(locales, lang)) return lang;
  const base = lang.split("-")[0];
  return own(locales, base) ? base : undefined;
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
        let v = own(data, k);
        if (Array.isArray(v)) {
          const [val, opts] = v;
          v =
            typeof val?.toLocaleString === "function"
              ? val.toLocaleString(lang, opts)
              : val;
        }
        return v === undefined ? `%{${k}}` : String(v);
      })
    : text;
}

/**
 * Creates a translation function.
 *
 * The returned function resolves a translation string by dot-separated path
 * (or a flat key) and interpolates `%{key}`-style placeholders from a data object.
 * When called with a non-string first argument, it delegates to
 * `toLocaleString` for direct value formatting.
 *
 * Formatting follows the language the result comes from. A language that has
 * translations (an exact entry, or its base such as `ru` for `ru-RU`) formats
 * with its full code. A language without any entry, and a key found only in
 * the fallback, format with the fallback language instead, so a number never
 * mixes one language's text with another's formatting.
 *
 * Language-sensitive formatting:
 * - [Intl.DateTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
 * - [Intl.NumberFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
 *
 * @category I18n
 *
 * @param locales A map of language codes to translation objects.
 * @param options Configuration options.
 * @param options.language Default language code; defaults to the browser language. A regional code such as `"ru-RU"` uses the `"ru"` translations when it has no entry of its own.
 * @param options.fallback Fallback language code when the default is unavailable; defaults to `"en"`. A regional code such as `"en-US"` uses the `"en"` translations when it has no entry of its own.
 * @returns A translation function. Missing keys, fallback misses, and keys naming a nested group instead of a string return the key itself. Each such key is also reported once per language through `reportError` (or `console.error` where it is unavailable).
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
 * t("birthday", { date: [new Date("2021-01-01"), { dateStyle: "short" }] }); // Birthday: 1/1/21
 * t(new Date("2021-01-01"), { dateStyle: "full" }); // Friday, January 1, 2021
 * ```
 */
export function i18n(
  locales: Record<string, Record<string, any>>,
  options?: { language?: string; fallback?: string },
): Translator {
  const { language = navigatorLanguage(), fallback = "en" } = options ?? {};
  const missing = new Set<string>();
  return (keyOrValue, dataOrLang, lang) => {
    const curLang =
      lang ?? (typeof dataOrLang === "string" ? dataOrLang : language);
    const data = typeof dataOrLang === "object" ? dataOrLang : undefined;
    const matched = matchLanguage(locales, curLang);
    // A regional fallback uses its base translations too (`en-US` → `en`).
    const base = matchLanguage(locales, fallback) ?? fallback;
    // Translations come from the matched locale; formatting keeps the full tag.
    const effectiveLang = matched ? curLang : fallback;

    if (typeof keyOrValue === "string") {
      let text = resolve(locales, keyOrValue, matched ?? base);
      let usedLang = effectiveLang;
      if (matched !== base && text === undefined) {
        text = resolve(locales, keyOrValue, base);
        if (text !== undefined) usedLang = fallback;
      }
      if (text === undefined) {
        // Report each missing key once per language, so a re-running effect does not repeat it.
        const id = `${curLang}\0${keyOrValue}`;
        if (!missing.has(id)) {
          missing.add(id);
          report(
            new Error(
              `i18n: no translation for "${keyOrValue}" in "${curLang}"`,
            ),
          );
        }
      }
      return fill(String(text ?? keyOrValue), usedLang, data);
    }

    return keyOrValue.toLocaleString(effectiveLang, data);
  };
}
