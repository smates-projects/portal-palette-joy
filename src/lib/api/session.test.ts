import { describe, expect, it } from "vitest";
import { createMockApi, DEMO_PASSWORD } from "./mock";
import * as seed from "./mock/seed";
import {
  DEMO_EXPIRED_CHALLENGE,
  DEMO_RECOVERY_CODES,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
} from "./mock/session";
import {
  isSignedInUser,
  isTwoFactorChallenge,
  isTwoFactorSetupRequired,
  type SignInResult,
  type User,
} from "./types";
import { isPublicAuthPath, safeNextPath } from "@/lib/auth/redirect";

const CARLA = "carla@vossler.com";
const YESENIA = "yesenia@moralespisos.com";
const STRONG = "piso-ceramica-2026";

const MARILYN = "marilyn@strategicmates.com";

const signedOut = async () => {
  const api = createMockApi();
  await api.session.logout();
  return api;
};

/** The sign-in answered the person, not a two-factor step. */
const asUser = (result: SignInResult): User => {
  if (!isSignedInUser(result)) throw new Error("expected a signed-in user");
  return result;
};

/** Marilyn's password step: the challenge id her login answers. */
const marilynChallenge = async (api: ReturnType<typeof createMockApi>) => {
  const result = await api.session.login({ email: MARILYN, password: DEMO_PASSWORD });
  if (!isTwoFactorChallenge(result)) throw new Error("expected a challenge");
  return result.challenge_id;
};

describe("session: password after the email links (has_password, password_setup_required, setPassword)", () => {
  const ENYERMY = "enyermy@enyermycleanpro.com";

  it("every seeded account has a password, except the owner whose program just started", async () => {
    const api = createMockApi();
    const lucia = await api.session.getCurrentUser();
    expect(lucia.has_password).toBe(true);
    expect(lucia.password_setup_required).toBe(false);
    const enyermy = await api.session.setViewAs(seed.U_ENYERMY);
    expect(enyermy.has_password).toBe(false);
    expect(enyermy.password_setup_required).toBe(true);
    const carla = await api.session.setViewAs(seed.U_CARLA);
    expect(carla.has_password).toBe(true);
    expect(carla.password_setup_required).toBe(false);
  });

  it("the login of an account without password answers the generic invalid_credentials (anti-enumeration)", async () => {
    const api = await signedOut();
    await expect(api.session.login({ email: ENYERMY, password: DEMO_PASSWORD })).rejects.toThrow(
      "invalid_credentials",
    );
  });

  it("creating the password needs no current one, updates /me and makes the login work", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_ENYERMY);
    await expect(api.session.setPassword({ password: STRONG })).resolves.toBeUndefined();
    const me = await api.session.getCurrentUser();
    expect(me.has_password).toBe(true);
    expect(me.password_setup_required).toBe(false);
    await api.session.logout();
    expect(asUser(await api.session.login({ email: ENYERMY, password: STRONG })).id).toBe(
      seed.U_ENYERMY,
    );
  });

  it("creating refuses a short password (weak_password) and leaves the account as it was", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_ENYERMY);
    await expect(api.session.setPassword({ password: "corta" })).rejects.toThrow("weak_password");
    expect((await api.session.getCurrentUser()).has_password).toBe(false);
  });

  it("changing needs the current password and it must match", async () => {
    const api = createMockApi();
    await expect(api.session.setPassword({ password: STRONG })).rejects.toThrow(
      "current_password_required",
    );
    await expect(
      api.session.setPassword({ password: STRONG, current_password: "no-es-la-actual" }),
    ).rejects.toThrow("invalid_credentials");
    await expect(
      api.session.setPassword({ password: STRONG, current_password: DEMO_PASSWORD }),
    ).resolves.toBeUndefined();
    await api.session.logout();
    await expect(
      api.session.login({ email: "lucia@estudioperez.legal", password: DEMO_PASSWORD }),
    ).rejects.toThrow("invalid_credentials");
    expect(
      asUser(await api.session.login({ email: "lucia@estudioperez.legal", password: STRONG })).id,
    ).toBe(seed.U_LUCIA);
  });

  it("signed out, setPassword answers unauthenticated", async () => {
    const api = await signedOut();
    await expect(api.session.setPassword({ password: STRONG })).rejects.toThrow("unauthenticated");
  });
});

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
    const carla = asUser(await api.session.login({ email: CARLA, password: DEMO_PASSWORD }));
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
      asUser(await api.session.login({ email: "  Carla@Vossler.com ", password: DEMO_PASSWORD }))
        .id,
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
    expect(asUser(await api.session.exchangeMagicLink("magic-carla")).id).toBe(seed.U_CARLA);
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
    const user = asUser(
      await api.session.acceptInvitation({
        token: "invite-yesenia",
        name: "  Yesenia Morales Díaz ",
        password: STRONG,
        accepted_terms: true,
      }),
    );
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
    expect(asUser(await api.session.login({ email: YESENIA, password: STRONG })).email).toBe(
      YESENIA,
    );
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
    expect(asUser(await api.session.login({ email: CARLA, password: STRONG })).id).toBe(
      seed.U_CARLA,
    );
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

describe("session: two-factor (TOTP)", () => {
  it("Marilyn's login answers a challenge and starts no session", async () => {
    const api = await signedOut();
    const result = await api.session.login({ email: MARILYN, password: DEMO_PASSWORD });
    expect(isTwoFactorChallenge(result)).toBe(true);
    expect(api.session.isAuthenticated()).toBe(false);
  });

  it("the right code starts the session; the challenge works once", async () => {
    const api = await signedOut();
    const challengeId = await marilynChallenge(api);
    const user = await api.session.verifyTwoFactor({
      challenge_id: challengeId,
      code: DEMO_TOTP_CODE,
    });
    expect(user.id).toBe(seed.U_MARYLIN);
    expect(user.two_factor_enabled).toBe(true);
    expect(api.session.isAuthenticated()).toBe(true);
    expect((await api.session.getCurrentUser()).id).toBe(seed.U_MARYLIN);
    await expect(
      api.session.verifyTwoFactor({ challenge_id: challengeId, code: DEMO_TOTP_CODE }),
    ).rejects.toThrow("challenge_invalid");
  });

  it("a wrong code is invalid_code and keeps the challenge for another try", async () => {
    const api = await signedOut();
    const challengeId = await marilynChallenge(api);
    await expect(
      api.session.verifyTwoFactor({ challenge_id: challengeId, code: "000000" }),
    ).rejects.toThrow("invalid_code");
    expect(api.session.isAuthenticated()).toBe(false);
    await expect(
      api.session.verifyTwoFactor({ challenge_id: challengeId, code: DEMO_TOTP_CODE }),
    ).resolves.toMatchObject({ id: seed.U_MARYLIN });
  });

  it("unknown and expired challenges", async () => {
    const api = await signedOut();
    await expect(
      api.session.verifyTwoFactor({ challenge_id: "nope", code: DEMO_TOTP_CODE }),
    ).rejects.toThrow("challenge_invalid");
    await expect(
      api.session.verifyTwoFactor({ challenge_id: DEMO_EXPIRED_CHALLENGE, code: DEMO_TOTP_CODE }),
    ).rejects.toThrow("challenge_expired");
  });

  it("a recovery code signs in once; the same code a second time is invalid_code", async () => {
    const api = await signedOut();
    const code = DEMO_RECOVERY_CODES[0]!;
    const first = await marilynChallenge(api);
    const user = await api.session.recoverTwoFactor({
      challenge_id: first,
      code: ` ${code.toLowerCase()} `,
    });
    expect(user.id).toBe(seed.U_MARYLIN);
    await api.session.logout();
    const second = await marilynChallenge(api);
    await expect(api.session.recoverTwoFactor({ challenge_id: second, code })).rejects.toThrow(
      "invalid_code",
    );
    await expect(
      api.session.recoverTwoFactor({ challenge_id: second, code: DEMO_RECOVERY_CODES[1]! }),
    ).resolves.toMatchObject({ id: seed.U_MARYLIN });
  });

  it("signed in: setup, confirm with 123456, then disable with a current code", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    const setup = await api.session.setupTwoFactor();
    expect(setup.secret).toBe(DEMO_TOTP_SECRET);
    expect(setup.otpauth_url).toBe(
      `otpauth://totp/Strategic%20Mates%3A${encodeURIComponent(CARLA)}?secret=${DEMO_TOTP_SECRET}&issuer=Strategic%20Mates`,
    );
    await expect(api.session.confirmTwoFactor("111111")).rejects.toThrow("invalid_code");
    const { recovery_codes } = await api.session.confirmTwoFactor(DEMO_TOTP_CODE);
    expect(recovery_codes).toHaveLength(8);
    expect((await api.session.getCurrentUser()).two_factor_enabled).toBe(true);
    await expect(api.session.setupTwoFactor()).rejects.toThrow("two_factor_already_enabled");

    // With TOTP on, Carla's next login asks for the code.
    await api.session.logout();
    expect(
      isTwoFactorChallenge(await api.session.login({ email: CARLA, password: DEMO_PASSWORD })),
    ).toBe(true);
  });

  it("disable: wrong code is invalid_code, the right one turns TOTP off", async () => {
    const api = await signedOut();
    await api.session.verifyTwoFactor({
      challenge_id: await marilynChallenge(api),
      code: DEMO_TOTP_CODE,
    });
    await expect(api.session.disableTwoFactor("000000")).rejects.toThrow("invalid_code");
    await api.session.disableTwoFactor(DEMO_TOTP_CODE);
    expect((await api.session.getCurrentUser()).two_factor_enabled).toBe(false);
    await api.session.logout();
    expect(
      isSignedInUser(await api.session.login({ email: MARILYN, password: DEMO_PASSWORD })),
    ).toBe(true);
  });

  it("confirm before setup is two_factor_not_started; signed out without a token is unauthenticated", async () => {
    const api = createMockApi();
    await expect(api.session.confirmTwoFactor(DEMO_TOTP_CODE)).rejects.toThrow(
      "two_factor_not_started",
    );
    await api.session.logout();
    await expect(api.session.setupTwoFactor()).rejects.toThrow("unauthenticated");
  });

  it("magic-setup answers a setup token: setup and confirm with it, no session, then login asks for the code", async () => {
    const api = await signedOut();
    const result = await api.session.exchangeMagicLink("magic-setup");
    if (!isTwoFactorSetupRequired(result)) throw new Error("expected a setup token");
    expect(api.session.isAuthenticated()).toBe(false);
    await expect(api.session.setupTwoFactor("otro-token")).rejects.toThrow("setup_token_invalid");
    await api.session.setupTwoFactor(result.setup_token);
    await api.session.confirmTwoFactor(DEMO_TOTP_CODE, result.setup_token);
    expect(api.session.isAuthenticated()).toBe(false);
    // The token is used up.
    await expect(api.session.setupTwoFactor(result.setup_token)).rejects.toThrow(
      "setup_token_invalid",
    );
    const next = await api.session.login({
      email: "nicolas@strategicmates.com",
      password: DEMO_PASSWORD,
    });
    expect(isTwoFactorChallenge(next)).toBe(true);
  });
});

describe("session: owner entry link", () => {
  it("entrada-castillo signs Ramón in once; the second use is token_used", async () => {
    const api = await signedOut();
    const user = asUser(await api.session.exchangeEntryLink("entrada-castillo"));
    expect(user.email).toBe("ramon@castilloinstalaciones.com");
    expect(user.role).toBe("business_owner");
    expect(api.session.isAuthenticated()).toBe(true);
    await expect(api.session.exchangeEntryLink("entrada-castillo")).rejects.toThrow("token_used");
  });

  it("expired, unknown and other-purpose tokens", async () => {
    const api = await signedOut();
    await expect(api.session.exchangeEntryLink("entrada-expired")).rejects.toThrow("token_expired");
    await expect(api.session.exchangeEntryLink("nada")).rejects.toThrow("token_invalid");
    await expect(api.session.exchangeEntryLink("magic-carla")).rejects.toThrow("token_invalid");
    await expect(api.session.exchangeMagicLink("entrada-castillo")).rejects.toThrow(
      "token_invalid",
    );
  });

  it("entrada-rivera resolves the owner by email when used (token_invalid while there is no account)", async () => {
    // adoptUserByEmail answers whether the mock has that account at all.
    const hasRivera = createMockApi().session.adoptUserByEmail("javier@riveraroofing.com");
    const api = await signedOut();
    if (hasRivera) {
      expect(asUser(await api.session.exchangeEntryLink("entrada-rivera")).email).toBe(
        "javier@riveraroofing.com",
      );
    } else {
      await expect(api.session.exchangeEntryLink("entrada-rivera")).rejects.toThrow(
        "token_invalid",
      );
    }
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
    expect(isPublicAuthPath("/entrada/entrada-castillo")).toBe(true);
    expect(isPublicAuthPath("/verificacion")).toBe(true);
    expect(isPublicAuthPath("/activar-verificacion")).toBe(true);
    expect(isPublicAuthPath("/enlaces")).toBe(false);
    expect(isPublicAuthPath("/")).toBe(false);
  });
});
