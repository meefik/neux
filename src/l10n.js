import { createState } from './state';

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
  const state = createState({
    lang: navigator.language,
    fallback: 'en',
    locales: {},
    ...options,
    t: () => t
  });
  function t (path, data, lang) {
    if (typeof data === 'string') {
      lang = data;
      data = null;
    }
    const locales = state.locales || {};
    if (!lang) lang = state.$lang;
    if (!locales[lang]) lang = state.fallback;
    const arr = `${path}`.split('.');
    let value = arr.reduce((o, k) => {
      return typeof o === 'object' ? o[k] : '';
    }, locales[lang]);
    for (const k in data) {
      const re = new RegExp(`%{${k}}`, 'g');
      value = value.replace(re, data[k]);
    }
    return value;
  }
  return state;
}
