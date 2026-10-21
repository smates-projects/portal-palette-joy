import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/lib/api/hooks";
import * as seed from "@/lib/api/mock/seed";
import { PASSWORD_SETUP_LATER_KEY } from "@/lib/auth/password-setup";
import { PasswordSetupDialog } from "./PasswordSetupDialog";

const STRONG = "limpieza-pro-2026!";

/** Shows who /me answered, so a test can wait for the query before asserting that no dialog is there. */
function Probe() {
  const { data } = useCurrentUser();
  return <p data-testid="me">{data?.full_name ?? ""}</p>;
}

const renderDialog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
      <PasswordSetupDialog />
    </QueryClientProvider>,
  );
};

const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  window.sessionStorage.removeItem(PASSWORD_SETUP_LATER_KEY);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem(PASSWORD_SETUP_LATER_KEY);
});

describe("PasswordSetupDialog", () => {
  it("stays hidden for a person who already has a password", async () => {
    await api.session.setViewAs(seed.U_LUCIA);
    renderDialog();
    await screen.findByText("Lucía Pérez");
    expect(dialog()).toBeNull();
  });

  it("shows for the owner whose /me says password_setup_required, with the agreed copy", async () => {
    await api.session.setViewAs(seed.U_ENYERMY);
    renderDialog();
    const modal = await screen.findByRole("dialog");
    expect(modal).toHaveTextContent("Ya eres parte de Strategic Mates");
    expect(modal).toHaveTextContent("Crea tu contraseña para entrar la próxima vez.");
    expect(modal).toHaveTextContent("El enlace de tu correo sigue funcionando.");
    expect(screen.getByRole("button", { name: "Crear contraseña" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más tarde" })).toBeInTheDocument();
    // No current password: the account has none. No X to close it either.
    expect(screen.queryByLabelText("Contraseña actual")).toBeNull();
    expect(screen.queryByText("Close")).toBeNull();
  });

  it("Más tarde hides it for this browser session only; a new session shows it again", async () => {
    await api.session.setViewAs(seed.U_ENYERMY);
    const first = renderDialog();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Más tarde" }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(window.sessionStorage.getItem(PASSWORD_SETUP_LATER_KEY)).toBe("1");

    // Same session (the person moves around the portal): still hidden.
    first.unmount();
    renderDialog();
    await screen.findByText("Enyermy Rivas");
    expect(dialog()).toBeNull();
    cleanup();

    // Next entry (new tab, sessionStorage empty): it comes back.
    window.sessionStorage.removeItem(PASSWORD_SETUP_LATER_KEY);
    renderDialog();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("explains a mismatch and a short password under the fields, same rules as the reset screen", async () => {
    await api.session.setViewAs(seed.U_ENYERMY);
    renderDialog();
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: "corta" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    expect(
      await screen.findByText("La contraseña necesita al menos 12 caracteres."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
      target: { value: `${STRONG}x` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    expect(
      await screen.findByText("Las dos contraseñas no son iguales. Escríbelas de nuevo."),
    ).toBeInTheDocument();
    expect(dialog()).not.toBeNull();
  });

  it("creating the password refreshes /me and the dialog goes away", async () => {
    await api.session.setViewAs(seed.U_ENYERMY);
    renderDialog();
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: STRONG } });
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    await waitFor(() => expect(dialog()).toBeNull(), { timeout: 3000 });
    const me = await api.session.getCurrentUser();
    expect(me.has_password).toBe(true);
    expect(me.password_setup_required).toBe(false);
  });
});
