import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Loads a query's data ahead of time (route loaders, menu hover) without ever
 * caching a failure. `prefetchQuery` would store errors like "Sessão expirada" in
 * the query cache, which fires the global session-expiry handler in router.tsx on
 * every prefetch; here a failure is simply ignored and the page fetches the data
 * itself through the normal error handling.
 */
export async function prefetchQuiet<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  fetcher: () => Promise<T>,
) {
  const state = queryClient.getQueryState(queryKey);
  if (state?.fetchStatus === "fetching") return;

  const staleTime = queryClient.getDefaultOptions().queries?.staleTime;
  const freshFor = typeof staleTime === "number" ? staleTime : 0;
  if (
    state?.status === "success" &&
    !state.isInvalidated &&
    Date.now() - state.dataUpdatedAt < freshFor
  ) {
    return;
  }

  try {
    queryClient.setQueryData(queryKey, await fetcher());
  } catch {
    /* ignored: the page's own query reports the error */
  }
}
