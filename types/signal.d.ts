/**
 * Create a reactive state.
 *
 * @param data Initial state data.
 * @returns An object containing the reactive state.
 */
export function signal(data?: object): {
  [key: string]: any
};

/**
 * Subscribe to reactive field changes.
 *
 * @param getter Getter function that will be called when the reactive state changes.
 * @param setter Setter function that will be called after the getter function.
 * @returns Dispose function if needed.
 */
export function effect(
  getter: () => any,
  setter?: (value: any) => void
): (() => void) | void;
