import { isObject, isString, isUndefined } from './utils';
import { createState } from './state';

function decodeQueryString(qs) {
  const query = {};
  const re = /[?&](?<key>[^=]+)=(?<val>[^&]*)/gu;
  let tokens = re.exec(qs);
  const { decodeURIComponent } = window;
  while (tokens) {
    const param = decodeURIComponent(tokens.groups.key);
    query[param] = decodeURIComponent(tokens.groups.val);
    tokens = re.exec(qs);
  }
  const match = /^#(?<path>[^?]+)/u.exec(qs);
  const path = decodeURIComponent(match?.groups.path || '');
  return { path, query };
}

function encodeQueryString(path, query) {
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

function navigate(path, query) {
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

/**
 * Create a router.
 *
 * @param {object} [routes]
 * @param {object} [options]
 * @param {string} [options.home]
 * @param {object} [options.context]
 * @returns {Proxy}
 */
export function createRouter(routes, options) {
  const { home, context } = options || {};
  const { location, addEventListener } = window;
  const router = createState({
    path: '',
    params: {},
    query: {},
    navigate: () => navigate,
  }, { context });
  Object.seal(router);
  const refresh = () => {
    if ((!location.hash || location.hash === '#') && home) {
      location.hash = home;
    }
    else {
      const { path, query } = decodeQueryString(location.hash);
      if (!router.query) {
        router.query = {};
      }
      for (const k in router.query) {
        if (isUndefined(query, k)) {
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
  };
  refresh();
  router.$$on('*', () => {
    navigate(router.path, router.query);
  });
  addEventListener('hashchange', () => refresh());
  return router;
}
