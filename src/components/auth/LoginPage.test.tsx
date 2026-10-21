import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import { DEMO_PASSWORD } from "@/lib/api/mock";
import { LoginPage } from "./LoginPage";

const ENYERMY = "enyermy@enyermycleanpro.com";

/** The login screen alone, on a memory router (useNavigate and useRouterState need one). */
const renderLogin = () => {
  const rootRoute = createRootRoute({ component: () => <LoginPage /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/login"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
};

const submitLogin = async (email: string, password: string) => {
  fireEvent.change(await screen.findByLabelText("Correo"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
};

beforeEach(async () => {
  await api.session.logout();
});

afterEach(cleanup);

describe("LoginPage: an account without password", () => {
  it("gets the generic message, which offers the magic link and says how to create the password", async () => {
    renderLogin();
    await submitLogin(ENYERMY, DEMO_PASSWORD);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El correo o la contraseña no coinciden");
    expect(alert).toHaveTextContent("Si todavía no creaste tu contraseña, entra con el enlace.");
    expect(alert).toHaveTextContent("puedes crear tu contraseña desde el portal, en Mi perfil");
    expect(
      screen.getByRole("button", { name: "Enviarme un enlace por correo" }),
    ).toBeInTheDocument();
    // The email stays typed; the password is cleared.
    expect(screen.getByLabelText("Correo")).toHaveValue(ENYERMY);
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });

  it("Enviarme un enlace por correo sends the magic link with the typed email and goes to /enlace-enviado", async () => {
    const router = renderLogin();
    await submitLogin(ENYERMY, "cualquier-cosa");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Enviarme un enlace por correo" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/enlace-enviado"));
    expect(router.state.location.state.authEmail).toBe(ENYERMY);
  });

  it("a wrong password of a normal account gets the same message (nobody learns who has a password)", async () => {
    renderLogin();
    await submitLogin("carla@vossler.com", "no-es-la-clave");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El correo o la contraseña no coinciden");
    expect(
      screen.getByRole("button", { name: "Enviarme un enlace por correo" }),
    ).toBeInTheDocument();
  });

  it("on the mock the password field says the demo password", async () => {
    renderLogin();
    await screen.findByLabelText("Correo");
    expect(screen.getByText(`Demo. Todas las cuentas de prueba usan la contraseña ${DEMO_PASSWORD}`)).toBeInTheDocument();
  });
});
