import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import * as seed from "@/lib/api/mock/seed";
import { OfficesPage } from "./OfficesPage";

const renderOffices = () => {
  const rootRoute = createRootRoute();
  const list = createRoute({ getParentRoute: () => rootRoute, path: "/oficinas", component: OfficesPage });
  const detail = createRoute({ getParentRoute: () => rootRoute, path: "/oficinas/$officeId", component: () => null });
  const router = createRouter({ routeTree: rootRoute.addChildren([list, detail]), history: createMemoryHistory({ initialEntries: ["/oficinas"] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
};

beforeAll(async () => {
  await api.session.setViewAs(seed.U_MARYLIN);
  // Marilyn signs for Corporate, as in production.
  await api.rules.update({ sm_entities: { corporate: { name: "Strategic Mates Corporate", signer_user_id: seed.U_MARYLIN }, sm_square: { name: "SM Square" } } }, null);
});
afterEach(cleanup);

describe("Firma de Corporate (Oficinas)", () => {
  it("without a saved signature of the signer, the upload shows as always", async () => {
    renderOffices();
    expect(await screen.findByRole("heading", { name: "Firma de Strategic Mates Corporate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Subir firma|Cambiar firma/ })).toBeInTheDocument();
    expect(screen.queryByText(/Se usa la firma guardada/)).toBeNull();
  });

  it("with the signer's saved signature it folds into one line, and the backup upload opens from its link", async () => {
    await api.documents.saveMySignature({ kind: "typed", image_url: "data:image/png;base64,iVBORw0KGgo=" });
    renderOffices();
    expect(await screen.findByText(/^Se usa la firma guardada de /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir firma|Cambiar firma/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Subir una firma de respaldo (opcional)" }));
    expect(screen.getByRole("button", { name: /Subir firma|Cambiar firma/ })).toBeInTheDocument();
    expect(screen.getByText(/^Firma de respaldo\. Solo se usa si /)).toBeInTheDocument();
  });
});
