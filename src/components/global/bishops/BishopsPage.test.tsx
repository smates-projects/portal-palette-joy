import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OfficeScopeSelect } from "@/components/layout/OfficeScopeSelect";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import * as seed from "@/lib/api/mock/seed";
import * as net from "@/lib/api/mock/seed-network";
import { PeoplePage } from "../people/PeoplePage";
import { BishopDetailPage } from "./BishopDetailPage";
import { BishopsPage } from "./BishopsPage";

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
  const list = createRoute({ getParentRoute: () => rootRoute, path: "/bishops", component: BishopsPage });
  const people = createRoute({ getParentRoute: () => rootRoute, path: "/personas", component: PeoplePage });
  const router = createRouter({ routeTree: rootRoute.addChildren([list, detail, people]), history: createMemoryHistory({ initialEntries: [path] }) });
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

const rowsOnScreen = async () => {
  await screen.findByText("¿Qué pasa con los Bishops?");
  return screen.findAllByTestId("bishop-row");
};
const counter = (label: string) => screen.getByRole("button", { name: new RegExp(label) });

describe("Bishops list (SM Global)", () => {
  it("says what happens with the CEO's name, counts every state and puts who waits for her signature first", async () => {
    renderAt("/bishops");
    const rows = await rowsOnScreen();
    expect(screen.getByText("Cada Bishop firma un acuerdo marco con Strategic Mates al entrar. Hasta que Marilyn lo firma, no ve oportunidades.")).toBeInTheDocument();
    expect(counter("Esperan tu firma")).toHaveTextContent("1");
    expect(counter("Invitados sin aceptar")).toHaveTextContent("1");
    expect(counter("Activos")).toHaveTextContent("1");
    expect(counter("Invirtiendo")).toHaveTextContent("2");
    expect(rows.map((r) => within(r).getAllByRole("link")[0]!.textContent)).toEqual(["Diego Rivas", "Andrés Molina", "Sofía Herrera", "Jefferson Paula", "Laura Ortega"]);
    expect(rows.map((r) => within(r).getByText(/^(Falta tu firma|Invitado|Activo|Invirtiendo)$/).textContent)).toEqual(["Falta tu firma", "Invitado", "Activo", "Invirtiendo", "Invirtiendo"]);
  });

  it("one action per state: Firmar acuerdo marco, Reenviar invitación, Ver", async () => {
    renderAt("/bishops");
    const [diego, andres, sofia, jefferson] = await rowsOnScreen();
    expect(within(diego!).getByRole("button", { name: "Firmar acuerdo marco" })).toBeInTheDocument();
    expect(within(andres!).getByRole("button", { name: "Reenviar invitación" })).toBeInTheDocument();
    expect(within(andres!).getByText(/^Invitado el /)).toBeInTheDocument();
    expect(within(sofia!).getByRole("link", { name: "Ver" })).toHaveAttribute("href", `/bishops/${net.U_SOFIA}`);
    expect(within(jefferson!).getByRole("link", { name: "Ver" })).toBeInTheDocument();
    expect(within(jefferson!).queryByRole("button")).toBeNull();
  });

  it("Firmar acuerdo marco opens the signing dialog; Reenviar invitación keeps the Bishop invited", async () => {
    renderAt("/bishops");
    const [diego] = await rowsOnScreen();
    fireEvent.click(within(diego!).getByRole("button", { name: "Firmar acuerdo marco" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    cleanup();
    renderAt("/bishops");
    const again = await rowsOnScreen();
    fireEvent.click(within(again[1]!).getByRole("button", { name: "Reenviar invitación" }));
    // The invitation went out again: a fresh date, still invited.
    await waitFor(async () => {
      const andres = (await api.users.list()).find((u) => u.id === net.U_ANDRES);
      expect(andres?.status).toBe("invited");
      expect(andres?.invited_at).not.toBe("2026-10-18T14:00:00Z");
    });
  });

  it("search by name and tapping a counter narrow the one list", async () => {
    renderAt("/bishops");
    await rowsOnScreen();
    fireEvent.change(screen.getByLabelText("Buscar Bishop por nombre"), { target: { value: "sofia" } });
    expect(screen.getAllByTestId("bishop-row")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Buscar Bishop por nombre"), { target: { value: "" } });
    fireEvent.click(counter("Invirtiendo"));
    expect(screen.getAllByTestId("bishop-row")).toHaveLength(2);
    expect(counter("Invirtiendo")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Viendo in the header", () => {
  const renderSelectAt = (path: string) => {
    const rootRoute = createRootRoute({ component: () => <OfficeScopeSelect /> });
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: [path] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  };
  it.each(["/", "/embudo", "/oficinas"])("shows on %s", async (path) => {
    renderSelectAt(path);
    expect(await screen.findByRole("combobox")).toHaveTextContent("Viendo");
  });
  it.each(["/bishops", "/personas", "/reglas", "/perfil", "/catalogo"])("hides on %s", async (path) => {
    renderSelectAt(path);
    // Give the session and the offices time to load: the selector would be there by then on an office screen.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

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

describe("Personas without Bishops", () => {
  it("lists the SM team and the network but no Bishop, with the way to Bishops", async () => {
    renderAt("/personas");
    // The phone list and the table both carry each person.
    expect((await screen.findAllByText("Valentina Ríos", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Jefferson Paula")).toBeNull();
    expect(screen.queryByText("Diego Rivas")).toBeNull();
    expect(screen.getByText("Los Bishops se administran en su propia pantalla.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Bishops" })).toHaveAttribute("href", "/bishops");
  });
});
