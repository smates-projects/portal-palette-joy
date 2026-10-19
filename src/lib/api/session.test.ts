import { describe, expect, it } from "vitest";
import { createMockApi, DEMO_PASSWORD } from "./mock";
import * as seed from "./mock/seed";
import { isPublicAuthPath, safeNextPath } from "@/lib/auth/redirect";

const CARLA = "carla@vossler.com";
const YESENIA = "yesenia@moralespisos.com";
const STRONG = "piso-ceramica-2026";

const signedOut = async () => {
  const api = createMockApi();
  await api.session.logout();
  return api;
};

describe("session: starts signed in, logout and login", () => {
  it("the mock starts signed in as the seeded user and Ver como keeps working", async () => {
    const api = createMockApi();
    expect(api.session.isAuthenticated()).toBe(true);
    expect((await api.session.getCurrentUser()).id).toBe(seed.U_LUCIA);
    expect((await api.session.setViewAs(seed.U_CARLA)).id).toBe(seed.U_CARLA);
    expect((await api.session.getCurrentUser()).id).toBe(seed.U_CARLA);
  });

  it("logout clears the session: every repository answers unauthenticated until a login", async () => {
    const api = await signedOut();
    expect(api.session.isAuthenticated()).toBe(false);
    await expect(api.session.getCurrentUser()).rejects.toThrow("unauthenticated");
    await expect(api.users.list()).rejects.toThrow("unauthenticated");
    const carla = await api.session.login({ email: CARLA, password: DEMO_PASSWORD });
    expect(carla.id).toBe(seed.U_CARLA);
    expect(api.session.isAuthenticated()).toBe(true);
    expect((await api.session.getCurrentUser()).id).toBe(seed.U_CARLA);
    expect((await api.users.list()).length).toBeGreaterThan(0);
  });

  it("logoutAll also clears the session", async () => {
    const api = createMockApi();
    await api.session.logoutAll();
    expect(api.session.isAuthenticated()).toBe(false);
  });

  it("a new mock (page reload) is signed in again", async () => {
    await signedOut();
    expect(createMockApi().session.isAuthenticated()).toBe(true);
  });

  it("login ignores case and spaces in the email", async () => {
    const api = await signedOut();
    expect(
      (await api.session.login({ email: "  Carla@Vossler.com ", password: DEMO_PASSWORD })).id,
    ).toBe(seed.U_CARLA);
  });

  it("wrong password and unknown email give the same invalid_credentials and keep the session closed", async () => {
    const api = await signedOut();
    await expect(api.session.login({ email: CARLA, password: "otra-clave" })).rejects.toThrow(
      "invalid_credentials",
    );
    await expect(
      api.session.login({ email: "nadie@ejemplo.com", password: DEMO_PASSWORD }),
    ).rejects.toThrow("invalid_credentials");
    expect(api.session.isAuthenticated()).toBe(false);
  });

  it("an invited person has no password yet: invalid_credentials", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_ANDREA);
    const invited = await api.users.invite({
      full_name: "Persona Nueva",
      email: "nueva@smmiami.com",
      role: "sm_team",
      organization_id: seed.ORG_SM,
      business_id: null,
      title: null,
      is_admin: false,
    });
    expect(invited.status).toBe("invited");
    await api.session.logout();
    await expect(
      api.session.login({ email: "nueva@smmiami.com", password: DEMO_PASSWORD }),
    ).rejects.toThrow("invalid_credentials");
  });

  it("a deactivated person with the right password gets account_inactive", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_LUCIA);
    await api.users.deactivate(seed.U_JULIAN, "Dejó la firma");
    const julian = (await api.users.list({ include_inactive: true })).find(
      (u) => u.id === seed.U_JULIAN,
    )!;
    await api.session.logout();
    await expect(
      api.session.login({ email: julian.email, password: DEMO_PASSWORD }),
    ).rejects.toThrow("account_inactive");
    expect(api.session.isAuthenticated()).toBe(false);
  });
});

describe("session: magic link", () => {
  it("requestMagicLink always resolves, whether the email exists or not", async () => {
    const api = await signedOut();
    await expect(api.session.requestMagicLink(CARLA)).resolves.toBeUndefined();
    await expect(api.session.requestMagicLink("nadie@ejemplo.com")).resolves.toBeUndefined();
    expect(api.session.isAuthenticated()).toBe(false);
  });

  it("magic-carla signs Carla in once; the second use is token_used", async () => {
    const api = await signedOut();
    expect((await api.session.exchangeMagicLink("magic-carla")).id).toBe(seed.U_CARLA);
    expect(api.session.isAuthenticated()).toBe(true);
    await expect(api.session.exchangeMagicLink("magic-carla")).rejects.toThrow("token_used");
  });

  it("unknown, expired, or a token of another purpose", async () => {
    const api = await signedOut();
    await expect(api.session.exchangeMagicLink("no-existe")).rejects.toThrow("token_invalid");
    await expect(api.session.exchangeMagicLink("reset-carla")).rejects.toThrow("token_invalid");
    await expect(api.session.exchangeMagicLink("magic-expired")).rejects.toThrow("token_expired");
    expect(api.session.isAuthenticated()).toBe(false);
  });
});

describe("session: invitation", () => {
  it("invite-yesenia shows who, which business and which role, without using the token", async () => {
    const api = await signedOut();
    const preview = await api.session.exchangeInvitation("invite-yesenia");
    expect(preview).toMatchObject({
      email: YESENIA,
      role: "business_owner",
      business_name: "Morales Pisos y Cerámica",
      organization_name: null,
      full_name: "Yesenia Morales",
    });
    expect(preview.expires_at > "2026-10-14").toBe(true);
    expect(typeof preview.invited_by_name).toBe("string");
    // Reading twice is fine: only accepting uses it.
    await expect(api.session.exchangeInvitation("invite-yesenia")).resolves.toMatchObject({
      email: YESENIA,
    });
    expect(api.session.isAuthenticated()).toBe(false);
  });

  it("expired, used and unknown invitations", async () => {
    const api = await signedOut();
    await expect(api.session.exchangeInvitation("invite-expired")).rejects.toThrow("token_expired");
    await expect(api.session.exchangeInvitation("invite-used")).rejects.toThrow("token_used");
    await expect(api.session.exchangeInvitation("no-existe")).rejects.toThrow("token_invalid");
    await expect(api.session.exchangeInvitation("magic-carla")).rejects.toThrow("token_invalid");
  });

  it("accepting sets name and password, starts the session, and the token works only once", async () => {
    const api = await signedOut();
    const user = await api.session.acceptInvitation({
      token: "invite-yesenia",
      name: "  Yesenia Morales Díaz ",
      password: STRONG,
      accepted_terms: true,
    });
    expect(user.email).toBe(YESENIA);
    expect(user.full_name).toBe("Yesenia Morales Díaz");
    expect(api.session.isAuthenticated()).toBe(true);
    expect((await api.session.getCurrentUser()).email).toBe(YESENIA);
    await expect(api.session.exchangeInvitation("invite-yesenia")).rejects.toThrow("token_used");
    await expect(
      api.session.acceptInvitation({
        token: "invite-yesenia",
        name: "Y",
        password: STRONG,
        accepted_terms: true,
      }),
    ).rejects.toThrow("token_used");
    // The new password replaces the demo one.
    await api.session.logout();
    await expect(api.session.login({ email: YESENIA, password: DEMO_PASSWORD })).rejects.toThrow(
      "invalid_credentials",
    );
    expect((await api.session.login({ email: YESENIA, password: STRONG })).email).toBe(YESENIA);
  });

  it("weak password, missing name and unticked terms are refused without using the token", async () => {
    const api = await signedOut();
    await expect(
      api.session.acceptInvitation({
        token: "invite-yesenia",
        name: "Yesenia",
        password: "corta123",
        accepted_terms: true,
      }),
    ).rejects.toThrow("weak_password");
    await expect(
      api.session.acceptInvitation({
        token: "invite-yesenia",
        name: "   ",
        password: STRONG,
        accepted_terms: true,
      }),
    ).rejects.toThrow("name_required");
    await expect(
      api.session.acceptInvitation({
        token: "invite-yesenia",
        name: "Yesenia",
        password: STRONG,
        accepted_terms: false as unknown as true,
      }),
    ).rejects.toThrow("terms_required");
    expect(api.session.isAuthenticated()).toBe(false);
    await expect(api.session.exchangeInvitation("invite-yesenia")).resolves.toMatchObject({
      email: YESENIA,
    });
  });

  it("accepting an expired, used or unknown invitation", async () => {
    const api = await signedOut();
    const input = { name: "X", password: STRONG, accepted_terms: true as const };
    await expect(
      api.session.acceptInvitation({ ...input, token: "invite-expired" }),
    ).rejects.toThrow("token_expired");
    await expect(api.session.acceptInvitation({ ...input, token: "invite-used" })).rejects.toThrow(
      "token_used",
    );
    await expect(api.session.acceptInvitation({ ...input, token: "nada" })).rejects.toThrow(
      "token_invalid",
    );
  });
});

describe("session: forgot and reset password", () => {
  it("forgotPassword always resolves, whether the email exists or not", async () => {
    const api = await signedOut();
    await expect(api.session.forgotPassword(CARLA)).resolves.toBeUndefined();
    await expect(api.session.forgotPassword("nadie@ejemplo.com")).resolves.toBeUndefined();
  });

  it("reset-carla sets a new password once and does not sign in", async () => {
    const api = await signedOut();
    await api.session.resetPassword({ token: "reset-carla", password: STRONG });
    expect(api.session.isAuthenticated()).toBe(false);
    await expect(api.session.login({ email: CARLA, password: DEMO_PASSWORD })).rejects.toThrow(
      "invalid_credentials",
    );
    expect((await api.session.login({ email: CARLA, password: STRONG })).id).toBe(seed.U_CARLA);
    await expect(
      api.session.resetPassword({ token: "reset-carla", password: STRONG }),
    ).rejects.toThrow("token_used");
  });

  it("weak password keeps the token; unknown, expired and other-purpose tokens are refused", async () => {
    const api = await signedOut();
    await expect(
      api.session.resetPassword({ token: "reset-carla", password: "11-chars-xx" }),
    ).rejects.toThrow("weak_password");
    await expect(
      api.session.resetPassword({ token: "reset-expired", password: STRONG }),
    ).rejects.toThrow("token_expired");
    await expect(api.session.resetPassword({ token: "nada", password: STRONG })).rejects.toThrow(
      "token_invalid",
    );
    await expect(
      api.session.resetPassword({ token: "magic-carla", password: STRONG }),
    ).rejects.toThrow("token_invalid");
    await expect(
      api.session.resetPassword({ token: "reset-carla", password: STRONG }),
    ).resolves.toBeUndefined();
  });
});

describe("after login: only paths inside the app", () => {
  it("keeps relative paths with their search", () => {
    expect(safeNextPath("/tareas")).toBe("/tareas");
    expect(safeNextPath("/tareas/abc?view=list")).toBe("/tareas/abc?view=list");
  });
  it("refuses external URLs, protocol-relative and sign-in screens", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "tareas",
      "",
      "/login",
      "/invitacion/x",
      null,
      42,
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
  it("knows which screens are public", () => {
    expect(isPublicAuthPath("/login")).toBe(true);
    expect(isPublicAuthPath("/enlace/magic-carla")).toBe(true);
    expect(isPublicAuthPath("/restablecer/reset-carla")).toBe(true);
    expect(isPublicAuthPath("/enlaces")).toBe(false);
    expect(isPublicAuthPath("/")).toBe(false);
  });
});
