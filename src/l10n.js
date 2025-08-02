import { isArray, isObject, isString, isFunction, isUndefined } from './utils.js';

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

  const lookup = (path, lang) => {
    const locale = locales[lang] || {};
    return path in locale
      ? locale[path]
      : path.split('.').reduce((o, k) => (isObject(o) ? o[k] : ''), locale);
  };

  const populate = (text, data, lang) => {
    if (isString(text)) {
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
    }
    return text;
  };

  return (path, data, lang = language) => {
    if (isString(data)) {
      lang = data;
      data = null;
    }
    if (!lang || !locales[lang]) {
      lang = fallback;
    }
    if (isString(path)) {
      let text = lookup(path, lang);
      if (lang !== fallback && isUndefined(text)) {
        text = lookup(path, fallback);
      }
      return populate(isUndefined(text) ? path : text, data, lang);
    }
    else if (isFunction(path?.toLocaleString)) {
      return path.toLocaleString(lang, data);
    }
    return path;
  };
}
