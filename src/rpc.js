import { isObject } from './utils';

/**
 * Create an RPC client.
 *
 * @param {object} [options]
 * @param {object} [options.url="/api/rpc"]
 * @param {object} [options.method="POST"]
 * @param {object} [options.headers]
 * @param {object} [options.mode]
 * @param {object} [options.credentials]
 * @returns {Proxy}
 */
export function createRPC(options) {
  const {
    url = '/api/rpc',
    method = 'POST',
    headers = {},
    mode,
    credentials,
  } = options;
  const target = {};
  Object.seal(target);
  const handler = {
    get: (_obj, prop) => async function get(params) {
      const reqHeaders = {};
      if (params instanceof FormData) {
        // ignore
      }
      else if (params instanceof File || params instanceof Blob) {
        const fd = new FormData();
        fd.append('file', params);
        params = fd;
      }
      else if (isObject(params)) {
        reqHeaders['Content-Type'] = 'application/json';
        params = JSON.stringify(params);
      }
      else {
        params = `${params}`;
      }
      const res = await fetch(`${url}/${prop}`, {
        method,
        mode,
        credentials,
        headers: Object.defineProperties(reqHeaders, {
          ...Object.getOwnPropertyDescriptors(headers),
        }),
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
