import { createState } from './state';
import { isObject, isString } from './utils';

/**
 * Create a localization.
 *
 * @param {object} locales
 * @param {object} [options]
 * @param {string} [options.lang=navigator.language]
 * @param {string} [options.fallback="en"]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createL10n (locales, options) {
  const {
    lang = navigator.language,
    fallback = 'en',
    context
  } = options || {};
  function translate (path, data, lang) {
    if (isString(data)) {
      lang = data;
      data = null;
    }
    if (!lang) lang = l10n.$lang;
    if (!lang || !locales[lang]) lang = fallback;
    if (!lang) return path;
    const arr = `${path}`.split('.');
    let value = arr.reduce((o, k) => {
      return isObject(o) ? o[k] : '';
    }, locales[lang]);
    for (const k in data) {
      const re = new RegExp(`%{${k}}`, 'g');
      value = value.replace(re, data[k]);
    }
    return value;
  }
  const l10n = createState({
    lang: locales[lang] ? lang : fallback,
    locales: Object.keys(locales),
    t: () => translate
  }, context);
  Object.seal(l10n);
  return l10n;
}
