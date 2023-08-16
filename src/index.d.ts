type Proxy = {
  [key: string | number | symbol]: any
};
/**
 * Create a state.
 *
 * @param target Initial state data.
 */
export function createState(target?: object): Proxy;
/**
 * Create a view.
 *
 * @param config The configuration for the view.
 * @param target The destination element to mount the view.
 */
export function createView(config: object, target?: HTMLElement): HTMLElement;
/**
 * Create a localization.
 * 
 * @param options Localization options.
 */
export function createL10n(options: {
  locales: object;
  lang?: string;
  fallback?: string;
}): Proxy;
/**
 * Create a router.
 *
 * @param options Routing parameters.
 */
export function createRouter(options?: {
  home?: string;
}): Proxy;
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
}): Proxy;
