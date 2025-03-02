import { isObject, isString } from './utils';

/**
 * Create an RPC client.
 *
 * @param {string} url URL of the RPC server.
 * @param {object} [options] Fetch options.
 * @param {string} [options.method="POST"] HTTP method.
 * @param {object} [options.headers] HTTP headers.
 * @returns {Proxy}
 */
export function rpc(url, options = {}) {
  const { method = 'POST', headers = {} } = options;
  const target = {};
  Object.seal(target);
  const handler = {
    get: (_obj, prop) => async (params) => {
      const reqHeaders = new Headers(headers);
      if (!reqHeaders.has('content-type')) {
        if (params instanceof Blob) {
          reqHeaders.set('content-type', 'application/octet-stream');
        }
        else if (isObject(params)) {
          reqHeaders.set('content-type', 'application/json');
          params = JSON.stringify(params);
        }
        else if (isString(params)) {
          reqHeaders.set('content-type', 'text/plain');
        }
      }
      const res = await fetch(`${url || ''}/${prop}`, {
        ...options,
        method,
        headers: reqHeaders,
        body: params,
      });
      if (!res.ok) {
        throw Error(res.statusText);
      }
      const contentType = res.headers.get('content-type') || '';
      if (/^application\/json/u.test(contentType)) {
        return await res.json();
      }
      if (/^application\/octet-stream/u.test(contentType)) {
        return await res.blob();
      }
      return await res.text();
    },
  };
  return new Proxy(target, handler);
}
