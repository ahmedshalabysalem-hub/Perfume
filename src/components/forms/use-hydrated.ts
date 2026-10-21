import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and until React has hydrated the component, then true.
 * Submit buttons of client-handled forms stay disabled until then, so a fast
 * click cannot trigger a native form submission without our handlers.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
