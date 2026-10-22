import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { sessionQueryDefaults } from "./lib/api/hooks";

export const getRouter = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: sessionQueryDefaults } });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
