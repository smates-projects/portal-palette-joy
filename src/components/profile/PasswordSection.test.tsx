import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import { DEMO_PASSWORD } from "@/lib/api/mock";
import * as seed from "@/lib/api/mock/seed";
import type { User } from "@/lib/api/types";
import { PasswordSection } from "./PasswordSection";

const STRONG = "estudio-perez-2026!";

const renderSection = (me: User) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PasswordSection me={me} />
    </QueryClientProvider>,
  );
};

const current = async (): Promise<User> => api.session.getCurrentUser();

afterEach(cleanup);

describe("Mi perfil: Contraseña", () => {
  it("without a password: Sin crear, Crear contraseña, and the form asks only the new one twice", async () => {
    const me = { ...(await api.session.setViewAs(seed.U_ENYERMY)) };
    renderSection(me);
    expect(screen.getByText("Sin crear")).toBeInTheDocument();
    expect(screen.getByText(/Todavía no tienes contraseña/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    expect(screen.getByLabelText("Contraseña nueva")).toBeInTheDocument();
    expect(screen.getByLabelText("Repite la contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña actual")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("with a password: Creada, Cambiar contraseña, and the form asks the current one as well", async () => {
    const me = await api.session.setViewAs(seed.U_LUCIA);
    renderSection(me);
    expect(screen.getByText("Creada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear contraseña" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(screen.getByLabelText("Contraseña actual")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña nueva")).toBeInTheDocument();
    expect(screen.getByLabelText("Repite la contraseña")).toBeInTheDocument();
  });

  it("changing: the current password is required and must match; then the form closes", async () => {
    const me = await api.session.setViewAs(seed.U_LUCIA);
    renderSection(me);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: STRONG } });
    const submit = () =>
      fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    submit();
    expect(await screen.findByText("Escribe tu contraseña actual.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: "no-es-la-actual" },
    });
    submit();
    expect(await screen.findByText("La contraseña actual no es correcta")).toBeInTheDocument();
    // The wrong one is cleared so the person types it again.
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: { value: DEMO_PASSWORD },
    });
    submit();
    await waitFor(() => expect(screen.queryByLabelText("Contraseña actual")).toBeNull(), {
      timeout: 3000,
    });
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeInTheDocument();
    await api.session.logout();
    await expect(api.session.login({ email: me.email, password: STRONG })).resolves.toMatchObject({
      id: seed.U_LUCIA,
    });
  });

  it("creating from the profile sets the password (no current one asked)", async () => {
    const me = await api.session.setViewAs(seed.U_ENYERMY);
    expect((await current()).has_password).toBe(false);
    renderSection(me);
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), { target: { value: STRONG } });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), { target: { value: STRONG } });
    fireEvent.click(screen.getByRole("button", { name: "Crear contraseña" }));
    await waitFor(() => expect(screen.queryByLabelText("Contraseña nueva")).toBeNull(), {
      timeout: 3000,
    });
    expect((await current()).has_password).toBe(true);
  });
});
