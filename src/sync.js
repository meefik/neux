import { deepPatch, deepClone, deepDiff } from './state';

/**
 * Sync.
 *
 * @param {object} state
 * @param {function} handler
 * @param {object} [options]
 * @returns {function}
 */
export function createSync (state, handler, options) {
  const { slippage } = options || {};
  let data;
  const syncer = async (...args) => {
    const oldv = data;
    const newv = deepClone(state);
    const diff = deepDiff(newv, oldv);
    data = await handler(newv, oldv, diff, ...args);
    if (typeof data === 'object') {
      deepPatch(state, data);
    }
    return data;
  };
  let timer;
  if (typeof slippage === 'number') {
    return async function (...args) {
      return new Promise(resolve => {
        clearTimeout(timer);
        timer = setTimeout(
          async () => resolve(await syncer(...args)),
          timer ? slippage : 0
        );
      });
    };
  } else {
    return syncer;
  }
}
