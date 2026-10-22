import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import * as seed from "@/lib/api/mock/seed";
import * as net from "@/lib/api/mock/seed-network";
import { BishopDetailPage } from "./BishopDetailPage";

/** The Bishops screens alone, on a memory router with both addresses (the rows and "Ver" link to the detail). */
const renderAt = (path: string) => {
  const rootRoute = createRootRoute();
  const detail = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bishops/$userId",
    component: function Detail() {
      const { userId } = detail.useParams();
      return <BishopDetailPage userId={userId} />;
    },
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([detail]), history: createMemoryHistory({ initialEntries: [path] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

beforeAll(async () => {
  await api.session.setViewAs(seed.U_MARYLIN);
});
afterEach(cleanup);

describe("Bishop detail (SM Global)", () => {
  it("shows contact, the signed framework agreement with its document and the opportunities taken with their funds", async () => {
    renderAt(`/bishops/${net.U_JEFFERSON}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Jefferson Paula" })).toBeInTheDocument();
    expect(screen.getByText("jefferson@paulainvestments.com")).toBeInTheDocument();
    const agreement = screen.getByRole("region", { name: "Acuerdo marco" });
    expect(within(agreement).getByText(/Jefferson Paula firmó el/)).toBeInTheDocument();
    expect(within(agreement).getByRole("button", { name: "Ver documento" })).toBeInTheDocument();
    expect(within(agreement).queryByRole("button", { name: "Firmar acuerdo marco" })).toBeNull();
    expect(screen.getByText("Oportunidades que tomó")).toBeInTheDocument();
    expect(screen.getAllByText("Fondos recibidos").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Ver negocio" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invirtiendo").length).toBeGreaterThan(0);
  });

  it("a Bishop waiting for the CEO offers Firmar acuerdo marco", async () => {
    renderAt(`/bishops/${net.U_DIEGO}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Diego Rivas" })).toBeInTheDocument();
    const agreement = screen.getByRole("region", { name: "Acuerdo marco" });
    expect(within(agreement).getByRole("button", { name: "Firmar acuerdo marco" })).toBeInTheDocument();
    expect(screen.getByText("Todavía no tomó ninguna oportunidad.")).toBeInTheDocument();
  });

  it("an unknown id says so", async () => {
    renderAt("/bishops/nope");
    expect(await screen.findByText(/No encontramos a este Bishop/)).toBeInTheDocument();
  });
});
