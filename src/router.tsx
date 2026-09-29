import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Data fetched during SSR or a menu hover stays fresh briefly, so it isn't
      // requested again right after the page renders.
      queries: { staleTime: 10_000 },
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
