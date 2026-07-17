/**
 * Signature of the translation function returned by {@link i18n}.
 *
 * @category I18n
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
  return navigator?.language || "en";
}

/** Looks up a translation value by dot-separated path or flat key from a locale map. */
function resolve(
  locales: Record<string, any>,
  key: string,
  lang: string,
): unknown | undefined {
  let value;
  const map = locales[lang];
  if (map) {
    if (key in map) value = map[key];
    else value = key.split(".").reduce((o, k) => o?.[k], map);
  }
  return value;
}

/** Replaces `%{key}` placeholders with values from data; missing keys are left as-is. */
function fill(
  text: string,
  lang: string,
  data?: Record<string, unknown>,
): string {
  return data
    ? text.replace(/%\{([^}]+)\}/g, (_, k) => {
        let v = data[k];
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
 * Language-sensitive formatting:
 * - [Intl.DateTimeFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
 * - [Intl.NumberFormat](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
 *
 * @category I18n
 *
 * @param locales A map of language codes to translation objects.
 * @param options Configuration options.
 * @param options.language Default language code; defaults to the browser language.
 * @param options.fallback Fallback language code when the default is unavailable; defaults to `"en"`.
 * @returns A translation function. Missing keys and fallback misses return the key itself.
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
  return (keyOrValue, dataOrLang, lang) => {
    const curLang =
      lang ?? (typeof dataOrLang === "string" ? dataOrLang : language);
    const data = typeof dataOrLang === "object" ? dataOrLang : undefined;
    const effectiveLang = locales[curLang] ? curLang : fallback;

    if (typeof keyOrValue === "string") {
      let text = resolve(locales, keyOrValue, effectiveLang);
      let usedLang = effectiveLang;
      if (effectiveLang !== fallback && text === undefined) {
        text = resolve(locales, keyOrValue, fallback);
        if (text !== undefined) usedLang = fallback;
      }
      return fill(String(text ?? keyOrValue), usedLang, data);
    }

    return keyOrValue.toLocaleString(effectiveLang, data);
  };
}
