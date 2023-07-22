import { createState } from './state';
import { isObject } from './utils';

/**
 * Router
 *
 * @param {object} options
 * @param {string} [options.home]
 * @returns {Proxy}
 */
export function createRouter (options) {
  function navigate (path, params) {
    if (isObject(path)) {
      params = path;
      path = null;
    }
    location.hash = encodeQueryString(path, params);
  }
  function refresh () {
    if ((!location.hash || location.hash === '#') && state.home) {
      return navigate(state.home);
    }
    const { path, params } = decodeQueryString(location.hash);
    if (!state.params) state.params = {};
    for (const k in state.params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) {
        delete state.params[k];
      }
    }
    for (const k in params) {
      if (state.params[k] !== params[k]) {
        state.params[k] = params[k];
      }
    }
    state.path = path;
  }
  const state = createState({
    ...options,
    path: '',
    params: {},
    navigate: () => navigate
  });
  refresh();
  state.$$on('*', () => {
    navigate(state.path, state.params);
  });
  window.addEventListener('hashchange', () => refresh());
  return state;
}

function decodeQueryString (qs) {
  const params = {};
  const re = /[?&]([^=]+)=([^&]*)/g;
  let tokens = re.exec(qs);
  while (tokens) {
    params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
    tokens = re.exec(qs);
  }
  const match = /^#([^?]+)/.exec(qs) || [];
  const path = decodeURIComponent(match[1] || '');
  return { path, params };
}

function encodeQueryString (path, params) {
  const tokens = [];
  for (const k in params) {
    tokens.push(`${k}=${params[k]}`);
  }
  let qs = path ? `#${path}` : '#';
  if (tokens.length) {
    qs += `?${tokens.join('&')}`;
  }
  return qs;
}
