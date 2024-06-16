import { isObject, isString } from './utils';
import { createState } from './state';

function getTimeZone(date, trim) {
  const tz = -1 * new Date(date).getTimezoneOffset();
  const htz = trim ? `${~~(tz / 60)}` : `0${~~(tz / 60)}`.slice(-2);
  const mtz = `0${~~(tz % 60)}`.slice(-2);
  return `${tz >= 0 ? '+' : ''}${htz}:${mtz}`;
}

/**
 * Create a localization.
 *
 * @param {object} locales
 * @param {object} [options]
 * @param {string} [options.lang=navigator.language]
 * @param {string} [options.fallback="en"]
 * @param {string} [options.prefix]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createL10n(locales, options) {
  const {
    lang = navigator.language,
    fallback = 'en',
    prefix,
    context,
  } = options || {};
  // Translate into specified language
  const translate = (path, data, language) => {
    if (isString(data)) {
      language = data;
      data = null;
    }
    if (!language) {
      language = l10n.$lang;
    }
    if (!language || !locales[language]) {
      language = fallback;
    }
    if (!language) {
      return path;
    }
    const arr = `${path}`.split('.');
    let value = arr.reduce((o, k) => (isObject(o) ? o[k] : ''), locales[language]);
    for (const k in data) {
      const re = new RegExp(`%\\{${k}\\}`, 'gu');
      value = value.replace(re, data[k]);
    }
    return value;
  };
  // Convert date to localized string
  const dateToLocaleString = (date, format, utc) => {
    const pfx = prefix ? `${prefix}.` : '';
    date = new Date(date);
    const year = () => (utc ? date.getUTCFullYear() : date.getFullYear()),
      month = () => (utc ? date.getUTCMonth() : date.getMonth()),
      dayOfMonth = () => (utc ? date.getUTCDate() : date.getDate()),
      dayOfWeek = () => (utc ? date.getUTCDay() : date.getDay()),
      hours = () => (utc ? date.getUTCHours() : date.getHours()),
      minutes = () => (utc ? date.getUTCMinutes() : date.getMinutes()),
      seconds = () => (utc ? date.getUTCSeconds() : date.getSeconds()),
      dayOfYear = () => {
        const t1 = utc ? Date.UTC(year(), 0, 0) : new Date(year(), 0, 0).getTime(),
          t2 = utc ? Date.UTC(year(), month(), dayOfMonth()) : new Date(year(), month(), dayOfMonth()).getTime();
        return Math.round((t2 - t1) / 864e5);
      },
      tokens = {
        YYYY: () => `000${year()}`.slice(-4),
        YY: () => `0${year()}`.slice(-2),
        Q: () => `${Math.ceil((month() + 1) / 3)}`,
        MMMM: () => translate(`${pfx}month.full.${month()}`),
        MMM: () => translate(`${pfx}month.short.${month()}`),
        MM: () => `0${month() + 1}`.slice(-2),
        M: () => `${month() + 1}`,
        DD: () => `0${dayOfMonth()}`.slice(-2),
        D: () => `${dayOfMonth()}`,
        DDDD: () => `00${dayOfYear()}`.slice(-3),
        DDD: () => `${dayOfYear()}`,
        dddd: () => translate(`${pfx}day.full.${dayOfWeek()}`),
        ddd: () => translate(`${pfx}day.short.${dayOfWeek()}`),
        HH: () => `0${hours()}`.slice(-2),
        H: () => `${hours()}`,
        hh: () => `0${hours() > 12 ? hours() - 12 : hours() || 12}`.slice(-2),
        h: () => `${hours() > 12 ? hours() - 12 : hours() || 12}`,
        kk: () => `0${hours() + 1}`.slice(-2),
        k: () => `${hours() + 1}`,
        mm: () => `0${minutes()}`.slice(-2),
        m: () => `${minutes()}`,
        ss: () => `0${seconds()}`.slice(-2),
        s: () => `${seconds()}`,
        X: () => `${date.getTime() / 1000}`,
        x: () => `${date.getTime()}`,
        a: () => translate(hours() < 12 ? `${pfx}time.am.0` : `${pfx}time.pm.0`),
        A: () => (hours() < 12 ? translate(`${pfx}time.am.1`) : translate(`${pfx}time.pm.1`)),
        ZZ: () => (utc ? '+00:00' : getTimeZone(date)),
        Z: () => (utc ? '+0:00' : getTimeZone(date, true)),
      };
    for (const k in tokens) {
      const re = new RegExp(`\\{${k}\\}`, 'gu');
      format = format.replace(re, tokens[k]);
    }
    return format;
  };

  const l10n = createState({
    lang: locales[lang] ? lang : fallback,
    locales: Object.keys(locales),
    t: () => translate,
    d: () => dateToLocaleString,
    translate: () => translate,
    dateToLocaleString: () => dateToLocaleString,
  }, { context });
  Object.seal(l10n);

  return l10n;
}
