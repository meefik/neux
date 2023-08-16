import { createState } from './state';
import { isObject, hasOwnProperty, isString } from './utils';

/**
 * Create a router.
 *
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Proxy}
 */
export function createRouter (options) {
  function refresh () {
    if ((!location.hash || location.hash === '#') && state.home) {
      return (location.hash = state.home);
    }
    const { path, params } = decodeQueryString(location.hash);
    if (!state.params) state.params = {};
    for (const k in state.params) {
      if (!hasOwnProperty(params, k)) {
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
  const { home } = options || {};
  const target = {
    home,
    path: '',
    params: {},
    navigate: () => navigate
  };
  Object.seal(target);
  const state = createState(target);
  refresh();
  state.$$on('*', () => {
    navigate(state.path, state.params);
  });
  window.addEventListener('hashchange', () => refresh());
  return state;
}

function navigate (path, params) {
  if (isObject(path)) {
    params = path;
    path = null;
  }
  if (!isString(path)) {
    const { path: _path } = decodeQueryString(location.hash);
    path = _path;
  }
  location.hash = encodeQueryString(path, params);
}

function decodeQueryString (qs) {
  const params = {};
  const re = /[?&]([^=]+)=([^&]*)/g;
  let tokens = re.exec(qs);
  while (tokens) {
    const param = decodeURIComponent(tokens[1]);
    params[param] = decodeURIComponent(tokens[2]);
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
