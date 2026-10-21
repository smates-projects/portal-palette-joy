// The same screen when the session repository is the real API: no demo text anywhere.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { LoginPage } from "./LoginPage";

vi.mock("@/lib/api/mode", () => ({ isMockRepository: () => false }));

afterEach(cleanup);

describe("LoginPage with the HTTP session", () => {
  it("never shows the demo password hint", async () => {
    const rootRoute = createRootRoute({ component: () => <LoginPage /> });
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ["/login"] }) });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByLabelText("Correo");
    expect(screen.queryByText(/^Demo\./)).not.toBeInTheDocument();
  });
});
