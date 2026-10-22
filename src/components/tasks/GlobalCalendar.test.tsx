import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/api/hooks";
import * as seed from "@/lib/api/mock/seed";
import { ALL_OFFICES, setOfficeScope } from "@/lib/office-scope";
import { GoogleCalendarCard } from "@/components/profile/GoogleCalendarCard";
import { MyTasksPage } from "./MyTasksPage";

const T = { timeout: 3000 };

/** /calendario as the real route renders it (the team's page in calendar view), with Embudo and Mi perfil. */
const renderAt = (path: string) => {
  const rootRoute = createRootRoute();
  const calendar = createRoute({
    getParentRoute: () => rootRoute,
    path: "/calendario",
    validateSearch: (s: Record<string, unknown>) => (typeof s["meeting"] === "string" ? { meeting: s["meeting"] } : {}),
    component: function Calendar() {
      return <MyTasksPage search={{ view: "calendar", meeting: calendar.useSearch().meeting }} calendarRoute />;
    },
  });
  const pipeline = createRoute({ getParentRoute: () => rootRoute, path: "/embudo", component: () => <p>Embudo</p> });
  const profile = createRoute({
    getParentRoute: () => rootRoute,
    path: "/perfil",
    component: function Profile() {
      const me = useCurrentUser().data;
      return me ? <GoogleCalendarCard me={me} /> : null;
    },
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([calendar, pipeline, profile]), history: createMemoryHistory({ initialEntries: [path] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const routeSources = import.meta.glob("/src/routes/{calendario,tareas.index}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("Calendario of SM Global shares the team's calendar", () => {
  it("/calendario and /tareas render the same page component, and no Global-only page exists", () => {
    const calendario = routeSources["/src/routes/calendario.tsx"]!;
    const tareas = routeSources["/src/routes/tareas.index.tsx"]!;
    for (const source of [calendario, tareas]) {
      expect(source).toContain('import { MyTasksPage } from "@/components/tasks/MyTasksPage";');
      expect(source).toMatch(/<MyTasksPage /);
    }
    expect(calendario).toMatch(/<MyTasksPage search=\{\{ view: "calendar"/);
    expect(Object.keys(import.meta.glob("/src/components/global/calendar/*Page.tsx"))).toEqual([]);
  });
});

describe("Calendario (SM Global)", () => {
  beforeAll(async () => {
    await api.session.setViewAs(seed.U_MARYLIN);
  });
  afterEach(() => {
    cleanup();
    setOfficeScope(ALL_OFFICES);
  });

  it("the team's header and calendar; her own meetings and Google events, no office's entry meetings", async () => {
    renderAt("/calendario");
    await screen.findByRole("heading", { level: 1, name: "Tu calendario" }, T);
    await screen.findByText("SM Global", {}, T);
    // Only the calendar: no view switcher, so no table, board or roadmap of the tasks.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Tabla/ })).toBeNull();
    // Month view, as for the team: jump to the demo week to read the chips with their full text.
    fireEvent.click(await screen.findByRole("radio", { name: "Semana" }, T));
    await screen.findByText("Seguimiento del programa de Vossler", {}, T);
    expect(screen.getByText("Revisión de Prime 10 con su consultora")).toBeInTheDocument();
    await screen.findByText(/Llamada con Prisma ERP/, {}, T);
    expect(screen.getByText(/Almuerzo con inversionistas/)).toBeInTheDocument();
    expect(screen.queryByText(/Rivera Roofing/)).toBeNull();
    // No task filters on her calendar: her two actions sit in that row. Connected, so no notice.
    expect(screen.queryByLabelText("Buscar tareas")).toBeNull();
    expect(screen.getByRole("button", { name: "Agendar reunión" })).toBeInTheDocument();
    expect(screen.queryByText(/Conecta tu Google Calendar/)).toBeNull();
  });

  it("Viendo on SM Miami: the office's entry meetings and hers about its businesses, without her Google events", async () => {
    setOfficeScope(seed.ORG_SM);
    renderAt("/calendario");
    await screen.findByRole("heading", { level: 1, name: "Tu calendario" }, T);
    fireEvent.click(await screen.findByRole("radio", { name: "Semana" }, T));
    await screen.findByText(/Rivera Roofing/, {}, T);
    await screen.findByText("Seguimiento del programa de Vossler", {}, T);
    expect(screen.queryByText(/Llamada con Prisma ERP/)).toBeNull();
  });

  it("a week without meetings says so and leads to the Embudo", async () => {
    renderAt("/calendario");
    await screen.findByRole("heading", { level: 1, name: "Tu calendario" }, T);
    fireEvent.click(await screen.findByRole("radio", { name: "Semana" }, T));
    await screen.findByText("Seguimiento del programa de Vossler", {}, T);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText(/No tienes reuniones esta semana/, {}, T);
    expect(screen.getByRole("link", { name: "Ver el embudo" })).toHaveAttribute("href", "/embudo");
  });

  it("Agendar reunión asks for the business first; in SM Miami the owner with an account is there", async () => {
    setOfficeScope(seed.ORG_SM);
    renderAt("/calendario");
    fireEvent.click(await screen.findByRole("button", { name: "Agendar reunión" }, T));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: /Rivera Roofing & Remodel/ }, T);
    expect(within(dialog).getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("Registrar reunión lists the evaluated businesses of the office", async () => {
    setOfficeScope(seed.ORG_SM);
    renderAt("/calendario");
    fireEvent.click(await screen.findByRole("button", { name: "Registrar reunión" }, T));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: /Torres Concrete/ }, T);
  });

  it("without Google Calendar: a notice with the way to the profile card", async () => {
    await api.calendar.disconnect();
    try {
      renderAt("/calendario");
      await screen.findByText(/Conecta tu Google Calendar/, {}, T);
      expect(screen.getByRole("link", { name: "Conectarlo en mi perfil" })).toHaveAttribute("href", "/perfil#google-calendar");
    } finally {
      await api.calendar.connect();
    }
  });

  it("Mi perfil: once connected, Ver mi calendario goes to the Calendario", async () => {
    renderAt("/perfil");
    expect(await screen.findByRole("link", { name: "Ver mi calendario" }, T)).toHaveAttribute("href", "/calendario");
  });
});
