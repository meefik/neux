interface Proxy {
  [key: string | number | symbol]: any
};
/**
 * Create a state.
 *
 * @param data Initial state data.
 */
export function createState(data?: object): Proxy;
/**
 * Create a view.
 *
 * @param config View configuration.
 * @param options View options.
 */
export function createView(config: object, options?: {
  target?: HTMLElement
}): HTMLElement;
/**
 * Create a localization.
 * 
 * @param locales Localized translations.
 * @param options Localization options.
 */
export function createL10n(locales: object, options?: {
  lang?: string;
  fallback?: string;
}): {
  lang: string,
  locales: string[],
  t: (path: string, data?: object, lang?: string) => string
};
/**
 * Create a router.
 *
 * @param routes Regular expressions for parsing parameters.
 * @param options Routing parameters.
 */
export function createRouter(routes?: {
  [param: string]: RegExp
}, options?: {
  home?: string;
}): {
  path: string,
  params: { [key: string]: string },
  query: { [key: string]: string },
  navigate: (path: string, query?: object) => void
};
/**
 * Create a synchronization function.
 * 
 * @param state The state to sync.
 * @param handler Synchronization function call handler.
 * @param options Synchronization options.
 */
export function createSync(state: Proxy, handler: (
  newv: any, oldv: any, diff?: object, ...args: any
) => any, options?: {
  slippage?: number
}): Function;
/**
 * Create an RPC client.
 * 
 * @param options RPC connection options.
 */
export function createRPC(options?: {
  url?: object;
  method?: object;
  headers?: object;
  mode?: object;
  credentials?: object;
}): {
  [method: string]: (params: any) => any
};
