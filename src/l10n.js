import { isArray, isNumber, isObject, isString, isDate } from './utils';

/**
 * Create a localization.
 *
 * @param {object} locales Locales object.
 * @param {object} [options] Options.
 * @param {string} [options.language=navigator.language] Language code.
 * @param {string} [options.fallback="en"] Fallback language code.
 * @returns {function}
 */
export function l10n(locales, options) {
  const {
    language = navigator.language,
    fallback = 'en',
  } = options || {};

  return (path, data, lang = language) => {
    if (isString(data)) {
      lang = data;
      data = null;
    }
    if (!lang || !locales[lang]) {
      lang = fallback;
    }
    const arr = `${path}`.split('.');
    let text = arr.reduce((o, k) => (isObject(o) ? o[k] : ''), locales[lang]);
    if (isString(text)) {
      for (const k in data) {
        const re = new RegExp(`%\\{${k}\\}`, 'gu');
        let replaceValue = data[k];
        if (isArray(replaceValue)) {
          const [value, format] = replaceValue;
          replaceValue = value;
          if (isObject(format)) {
            if (isNumber(value)) {
              replaceValue = value.toLocaleString(lang, format);
            }
            else if (isDate(value)) {
              replaceValue = value.toLocaleString(lang, format);
            }
          }
        }
        text = text.replace(re, replaceValue);
      }
    }
    return text;
  };
}
