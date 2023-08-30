import { createState } from './state';
import { isObject, hasOwnProperty, isString } from './utils';

/**
 * Create a router.
 *
 * @param {object} [routes]
 * @param {object} [options]
 * @param {string} [options.home]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createRouter (routes, options) {
  const { home, context } = options || {};
  const { location, addEventListener } = window;
  function refresh () {
    if ((!location.hash || location.hash === '#') && home) {
      return (location.hash = home);
    }
    const { path, query } = decodeQueryString(location.hash);
    if (!router.query) router.query = {};
    for (const k in router.query) {
      if (!hasOwnProperty(query, k)) {
        delete router.query[k];
      }
    }
    for (const k in query) {
      if (router.query[k] !== query[k]) {
        router.query[k] = query[k];
      }
    }
    for (const k in routes) {
      const re = routes[k];
      const match = path.match(re);
      router.params[k] = match && match[1];
    }
    router.path = path;
  }
  const router = createState({
    path: '',
    params: {},
    query: {},
    navigate: () => navigate
  }, context);
  Object.seal(router);
  refresh();
  router.$$on('*', () => {
    navigate(router.path, router.query);
  });
  addEventListener('hashchange', () => refresh());
  return router;
}

function navigate (path, query) {
  const { location } = window;
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
  const { decodeURIComponent } = window;
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
