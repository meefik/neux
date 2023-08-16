import { createState } from './state';
import { isObject, isString } from './utils';

/**
 * Create a localization.
 *
 * @param {object} options
 * @param {object} options.locales
 * @param {string} [options.lang=navigator.language]
 * @param {string} [options.fallback="en"]
 * @returns {Proxy}
 */
export function createL10n (options) {
  const {
    lang = navigator.language,
    fallback = 'en',
    locales = {}
  } = options || {};
  const target = {
    lang: locales[lang] ? lang : fallback,
    fallback,
    locales,
    t: () => t
  };
  Object.seal(target);
  const state = createState(target);
  function t (path, data, lang) {
    if (isString(data)) {
      lang = data;
      data = null;
    }
    const locales = state.locales || {};
    if (!lang) lang = state.$lang;
    if (!lang || !locales[lang]) lang = state.fallback;
    if (!lang) return '';
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
