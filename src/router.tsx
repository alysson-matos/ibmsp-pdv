import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

const SESSION_EXPIRED = "Sessão expirada";

export const getRouter = () => {
  // When the password session expires, clear cached data and reload the root
  // loader so the unlock screen appears instead of a crashed page.
  let handlingExpiry = false;
  const onError = (error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes(SESSION_EXPIRED) || handlingExpiry) return;
    handlingExpiry = true;
    queryClient.cancelQueries().finally(() => {
      queryClient.clear();
      router.invalidate().finally(() => {
        handlingExpiry = false;
      });
    });
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      // Data fetched during SSR or a menu hover stays fresh briefly, so it isn't
      // requested again right after the page renders.
      queries: {
        staleTime: 10_000,
        retry: (count, error) =>
          !(error instanceof Error && error.message.includes(SESSION_EXPIRED)) && count < 3,
        throwOnError: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => (
      <div className="flex justify-center py-24">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    ),
  });

  // Sends the data fetched on the server along with the page, so the browser
  // doesn't fetch everything a second time after hydration.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });

  return router;
};
