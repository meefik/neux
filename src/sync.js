import { isNumber, isObject } from './utils';

/**
 * Create a synchronization function.
 *
 * @param {Proxy} state
 * @param {function} handler
 * @param {object} [options]
 * @param {number} [options.slippage]
 * @returns {function}
 */
export function createSync(state, handler, options) {
  const { slippage } = options || {};
  let data = null;
  const syncer = async (...args) => {
    const oldv = data;
    const newv = state.$$clone();
    const res = await handler(newv, oldv, ...args);
    if (isObject(res)) {
      state.$$patch(res);
    }
    return (data = res);
  };
  let timer = null;
  if (isNumber(slippage)) {
    return (...args) => new Promise((resolve) => {
      clearTimeout(timer);
      timer = setTimeout(
        async () => resolve(await syncer(...args)),
        timer ? slippage : 0,
      );
    });
  }
  return syncer;
}
