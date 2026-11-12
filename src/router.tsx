import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { restartApp } from "./lib/restart-app";

const SESSION_EXPIRED = "Sessão expirada";

export const getRouter = () => {
  // When the session expires (or no longer has the store this page belongs to),
  // reload from the start so the unlock screen or store picker appears instead of a
  // crashed page. Invalidating in place loops: see restartApp.
  const onError = (error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes(SESSION_EXPIRED)) restartApp();
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
