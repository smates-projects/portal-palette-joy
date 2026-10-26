import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { api } from "@/lib/api";
import * as seed from "@/lib/api/mock/seed";
import type { UserRole } from "@/lib/api/types";
import { InvitePersonDialog } from "./AccountDialogs";

const renderDialog = (fixedRole: UserRole) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InvitePersonDialog open onOpenChange={() => {}} fixedRole={fixedRole} />
    </QueryClientProvider>,
  );
};

beforeAll(async () => {
  await api.session.setViewAs(seed.U_MARYLIN);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Invitar persona (SM Global)", () => {
  it("a Business Bishop is invited without Administra su organización, and the invitation says he is no admin", async () => {
    const invite = vi.spyOn(api.users, "invite");
    renderDialog("bishop");
    await screen.findByText("Nombre y apellido");
    expect(screen.queryByText("Administra su organización")).toBeNull();
    const [name, email] = screen.getAllByRole("textbox");
    fireEvent.change(name!, { target: { value: "Bishop de Prueba" } });
    fireEvent.change(email!, { target: { value: "bishop.prueba@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(invite).toHaveBeenCalled());
    expect(invite.mock.calls[0]![0]).toMatchObject({ role: "bishop", is_admin: false, organization_id: null });
  });

  it("someone of an office still gets the box", async () => {
    renderDialog("sm_team");
    expect(await screen.findByText("Administra su organización")).toBeInTheDocument();
  });
});
