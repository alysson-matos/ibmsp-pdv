import { createContext, useContext } from "react";

/**
 * Whether the store in use has "Visual retrô" on. The root shell provides it; screens
 * and ui/ components read it to pick between the default look and the retro one.
 */
export const RetroContext = createContext(false);

export function useRetro(): boolean {
  return useContext(RetroContext);
}

/** Class names for the current look: `rx(retro, "default classes", "retro classes")`. */
export function rx(retro: boolean, base: string, retroClasses: string): string {
  return retro ? retroClasses : base;
}
