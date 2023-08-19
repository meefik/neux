import { createState } from './state';
import { isObject, hasOwnProperty, isString } from './utils';

/**
 * Create a router.
 *
 * @param {object} [routes]
 * @param {object} [options]
 * @param {string} [options.home]
 * @returns {Proxy}
 */
export function createRouter (routes, options) {
  const { home } = options || {};
  function refresh () {
    if ((!location.hash || location.hash === '#') && home) {
      return (location.hash = home);
    }
    const { path, query } = decodeQueryString(location.hash);
    if (!state.query) state.query = {};
    for (const k in state.query) {
      if (!hasOwnProperty(query, k)) {
        delete state.query[k];
      }
    }
    for (const k in query) {
      if (state.query[k] !== query[k]) {
        state.query[k] = query[k];
      }
    }
    for (const k in routes) {
      const re = routes[k];
      const match = path.match(re);
      state.params[k] = match && match[1];
    }
    state.path = path;
  }
  const target = {
    path: '',
    params: {},
    query: {},
    navigate: () => navigate
  };
  Object.seal(target);
  const state = createState(target);
  refresh();
  state.$$on('*', () => {
    navigate(state.path, state.query);
  });
  window.addEventListener('hashchange', () => refresh());
  return state;
}

function navigate (path, query) {
  if (isObject(path)) {
    query = path;
    path = null;
  }
  if (!isString(path)) {
    const { path: _path } = decodeQueryString(location.hash);
    path = _path;
  }
  location.hash = encodeQueryString(path, query);
}

function decodeQueryString (qs) {
  const query = {};
  const re = /[?&]([^=]+)=([^&]*)/g;
  let tokens = re.exec(qs);
  while (tokens) {
    const param = decodeURIComponent(tokens[1]);
    query[param] = decodeURIComponent(tokens[2]);
    tokens = re.exec(qs);
  }
  const match = /^#([^?]+)/.exec(qs) || [];
  const path = decodeURIComponent(match[1] || '');
  return { path, query };
}

function encodeQueryString (path, query) {
  const tokens = [];
  for (const k in query) {
    tokens.push(`${k}=${query[k]}`);
  }
  let qs = path ? `#${path}` : '#';
  if (tokens.length) {
    qs += `?${tokens.join('&')}`;
  }
  return qs;
}
