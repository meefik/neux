import { createState } from './state';
import { isObject, isString } from './utils';

/**
 * Create a localization.
 *
 * @param {object} locales
 * @param {object} [options]
 * @param {string} [options.lang=navigator.language]
 * @param {string} [options.fallback="en"]
 * @returns {Proxy}
 */
export function createL10n (locales, options) {
  const {
    lang = navigator.language,
    fallback = 'en'
  } = options || {};
  const target = {
    lang: locales[lang] ? lang : fallback,
    locales: Object.keys(locales),
    t: () => t
  };
  Object.seal(target);
  const state = createState(target);
  function t (path, data, lang) {
    if (isString(data)) {
      lang = data;
      data = null;
    }
    if (!lang) lang = state.$lang;
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
  return state;
}
