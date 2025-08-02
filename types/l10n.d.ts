/**
 * Create a localization.
 * 
 * @param locales Localized translations.
 * @param options Localization options.
 * @param options.language Default language.
 * @param options.fallback Fallback language if the translation is not found.
 * @returns A function that takes a path and optional data to return the localized string.
 */
export function l10n(
  locales: { [key: string]: { [key: string]: string } },
  options?: {
    language?: string,
    fallback?: string,
  }
): (path: string | number | Date, data?: object | string, lang?: string) => string;
