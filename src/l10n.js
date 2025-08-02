import { isArray, isObject, isString, isFunction } from './utils.js';

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
    if (isString(path)) {
      let text = path.split('.').reduce((o, k) => (isObject(o) ? o[k] : ''), locales[lang]);
      for (const k in data) {
        const re = new RegExp(`%\\{${k}\\}`, 'gu');
        let newValue = data[k];
        if (isArray(newValue)) {
          const [value, options] = newValue;
          if (isFunction(value?.toLocaleString)) {
            newValue = value.toLocaleString(lang, options);
          }
          else {
            newValue = value;
          }
        }
        text = text.replace(re, newValue);
      }
      return text;
    }
    else if (isFunction(path?.toLocaleString)) {
      return path.toLocaleString(lang, data);
    }
    return path;
  };
}
