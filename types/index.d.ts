/**
 * Create a state.
 *
 * @param data Initial state data.
 * @param options State options.
 */
export function createState(data?: object, options?: {
  context?: object
}): object;
/**
 * Create a view.
 *
 * @param config View configuration.
 * @param options View options.
 */
export function createView(config: object, options?: {
  target?: HTMLElement,
  context?: object
}): object | HTMLElement;
/**
 * Create a localization.
 * 
 * @param locales Localized translations.
 * @param options Localization options.
 */
export function createL10n(locales: object, options?: {
  lang?: string,
  fallback?: string,
  prefix?: string,
  context?: object
}): {
  lang: string,
  $lang: string,
  locales: string[],
  t: (path: string, data?: object | string, lang?: string) => string,
  d: (date: Date | number, format: string, utc?: boolean) => string
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
  home?: string,
  context?: object
}): {
  path: string,
  $path: string,
  params: { [key: string]: string },
  query: { [key: string]: string },
  navigate: (path: string, query?: object) => void
};
/**
 * Create an RPC client.
 * 
 * @param options RPC connection options.
 */
export function createRPC(options?: {
  url?: object,
  method?: object,
  headers?: object,
  mode?: object,
  credentials?: object
}): {
  [method: string]: (params: any) => any
};
/**
 * Create a synchronization function.
 * 
 * @param state The state to sync.
 * @param handler Synchronization function call handler.
 * @param options Synchronization options.
 */
export function createSync(state: object, handler: (
  newv: any, oldv: any, ...args: any
) => any, options?: {
  slippage?: number
}): Function;
