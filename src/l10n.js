import { createState } from './state';
import { isObject, isString } from './utils';

/**
 * Localization
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
    if (!locales[lang]) lang = state.fallback;
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
