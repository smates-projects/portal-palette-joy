import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Every route of the SM Global, franchisor, Bishop and franchisee menus exists (none falls back to not found).
describe("new role routes", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  const paths = [
    "/estructura", "/oficinas", "/oficinas/abc", "/reglas", "/embudo", "/catalogo",
    "/franquiciadora", "/franquicias", "/franquicias/abc", "/numeros", "/documentos", "/negocio",
    "/oportunidades", "/oportunidades/abc", "/acuerdos", "/manual", "/pagos",
    // Public sign-in screens of the two-factor flow and the owner entry link.
    "/verificacion", "/activar-verificacion", "/entrada/abc",
  ];
  it.each(paths)("matches %s", (path) => {
    expect(router.matchRoutes(path).at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
