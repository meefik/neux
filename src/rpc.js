import { isObject } from './utils';

export function createRPC (options) {
  const {
    url = '/api/rpc',
    method = 'POST',
    headers = {},
    credentials,
    mode,
    cache,
    redirect,
    referrer,
    referrerPolicy,
    priority
  } = options || {};
  const target = {};
  Object.seal(target);
  const handler = {
    get: (obj, prop) => {
      return async function (params) {
        const _headers = {};
        if (params instanceof File || params instanceof Blob) {
          const fd = new FormData();
          fd.append('file', params);
          params = fd;
        } else if (isObject(params)) {
          _headers['Content-Type'] = 'application/json';
          params = JSON.stringify(params);
        } else {
          params = `${params}`;
        }
        const res = await fetch(`${url}/${prop}`, {
          method,
          credentials,
          mode,
          cache,
          redirect,
          referrer,
          referrerPolicy,
          priority,
          headers: Object.defineProperties(_headers, {
            ...Object.getOwnPropertyDescriptors(headers)
          }),
          body: params
        });
        if (!res.ok) {
          const err = Error(res.statusText);
          err.code = res.statusCode;
          throw err;
        }
        const contentType = res.headers.get('content-type');
        if (/^application\/json/.test(contentType)) {
          return await res.json();
        }
        if (/^application\/octet-stream/.test(contentType)) {
          return await res.blob();
        }
        return await res.text();
      };
    }
  };
  return new Proxy(target, handler);
}
