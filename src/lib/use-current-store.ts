import { getRouteApi } from "@tanstack/react-router";

import type { Access } from "./gate.functions";

const rootApi = getRouteApi("__root__");

/** The store chosen after login (from the root loader), or null. */
export function useCurrentStore() {
  const access = rootApi.useLoaderData() as Access | null;
  return access?.store ?? null;
}
