import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import * as seed from "@/lib/api/mock/seed";
import { smEntitiesOf } from "@/lib/leads/contract-rules";
import { ALL_OFFICES, getOfficeScope, setOfficeScope } from "@/lib/office-scope";
import { OfficeScopeSelect } from "./OfficeScopeSelect";

const renderAt = (path: string) => {
  const rootRoute = createRootRoute({ component: () => <OfficeScopeSelect /> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: [path] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
};

beforeAll(async () => {
  await api.session.setViewAs(seed.U_MARYLIN);
  // Radix Select scrolls to the selected option and captures the pointer: jsdom has neither.
  Object.assign(Element.prototype, { scrollIntoView() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
});
afterEach(() => {
  cleanup();
  setOfficeScope(ALL_OFFICES);
});

describe("Viendo (SM Global)", () => {
  it("opens on Global's own option, named as the rules call Corporate, and then lists one option per SM Square office", async () => {
    const globalName = smEntitiesOf(await api.rules.get()).corporate.name;
    const offices = (await api.organizations.list()).filter((o) => o.kind === "sm").map((o) => o.name).sort((a, b) => a.localeCompare(b));
    renderAt("/embudo");
    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger).toHaveTextContent(globalName));
    fireEvent.keyDown(trigger, { key: "Enter" });
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    // Global governs every office: one option for the whole network, never a separate "Corporate" or "Todas".
    expect(options).toEqual([globalName, ...offices]);
  });

  it("a remembered Corporate (the old option with no leads) goes back to Global's own option", async () => {
    const corporate = (await api.organizations.list()).find((o) => o.kind === "sm_global");
    expect(corporate).toBeDefined();
    setOfficeScope(corporate!.id);
    renderAt("/embudo");
    await waitFor(() => expect(getOfficeScope()).toBe(ALL_OFFICES));
  });
});
