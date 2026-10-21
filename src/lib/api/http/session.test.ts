import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSignedInUser,
  isTwoFactorChallenge,
  isTwoFactorSetupRequired,
  type SignInResult,
  type User,
} from "../types";
import { createHttpSessionRepository } from "./session";
import {
  IDS,
  businessFixture,
  dataResponse,
  emptyResponse,
  meFixture,
  organizationFixture,
  problemResponse,
  stubFetch,
  testClient,
  userFixture,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const MARILYN = {
  id: IDS.marilyn,
  full_name: "Marilyn Boraei",
  email: "marilyn@strategicmates.com",
  role: "sm_global",
  organization_id: IDS.global,
};
const CARLA = {
  id: IDS.carla,
  full_name: "Carla Méndez",
  email: "carla@vossler.com",
  role: "business_owner",
  organization_id: null,
  business_id: IDS.business,
  is_admin: false,
};

const setup = () => {
  const client = testClient();
  return { client, session: createHttpSessionRepository(client) };
};

/** The sign-in answered the person (200), not a two-factor step. */
const asUser = (result: SignInResult): User => {
  if (!isSignedInUser(result)) throw new Error("expected a signed-in user");
  return result;
};

describe("http session: current user and isAuthenticated", () => {
  it("getCurrentUser calls GET /me and drops impersonating from the User", async () => {
    const { calls } = stubFetch(dataResponse(meFixture()));
    const { session } = setup();
    const user = await session.getCurrentUser();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me" });
    expect(user).toEqual(userFixture());
    expect("impersonating" in user).toBe(false);
  });

  it("isAuthenticated is derived from the last /me: unknown reads as signed in, a 401 flips it", async () => {
    stubFetch(problemResponse(401, "unauthenticated"));
    const { session } = setup();
    expect(session.isAuthenticated()).toBe(true);
    await expect(session.getCurrentUser()).rejects.toThrow("unauthenticated");
    expect(session.isAuthenticated()).toBe(false);
  });
});

describe("http session: sign-in", () => {
  it("login posts email and password to /auth/login and starts the session", async () => {
    const { calls } = stubFetch(
      problemResponse(401, "unauthenticated"),
      dataResponse(userFixture()),
    );
    const { session } = setup();
    await session.getCurrentUser().catch(() => undefined);
    expect(session.isAuthenticated()).toBe(false);
    const user = asUser(
      await session.login({ email: "andrea@strategicmates.com", password: "Demo1234!" }),
    );
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/auth/login",
      body: { email: "andrea@strategicmates.com", password: "Demo1234!" },
    });
    expect(user.id).toBe(IDS.andrea);
    expect(session.isAuthenticated()).toBe(true);
  });

  it("login keeps the API's codes as the error message", async () => {
    stubFetch(
      problemResponse(401, "invalid_credentials"),
      problemResponse(403, "account_inactive"),
    );
    const { session } = setup();
    await expect(session.login({ email: "a@b.co", password: "x" })).rejects.toThrow(
      "invalid_credentials",
    );
    await expect(session.login({ email: "a@b.co", password: "x" })).rejects.toThrow(
      "account_inactive",
    );
  });

  it("login with two-factor on (202) answers the challenge and starts no session", async () => {
    stubFetch(
      problemResponse(401, "unauthenticated"),
      dataResponse({ two_factor_required: true, challenge_id: "ch-1" }, 202),
    );
    const { session, client } = setup();
    await session.getCurrentUser().catch(() => undefined);
    const result = await session.login({ email: "a@b.co", password: "x" });
    expect(result).toEqual({ two_factor_required: true, challenge_id: "ch-1" });
    expect(isTwoFactorChallenge(result)).toBe(true);
    expect(client.session().user).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });

  it("login of a role that must use TOTP (202) answers the setup token and starts no session", async () => {
    stubFetch(
      problemResponse(401, "unauthenticated"),
      dataResponse({ two_factor_setup_required: true, setup_token: "st-1" }, 202),
    );
    const { session } = setup();
    await session.getCurrentUser().catch(() => undefined);
    const result = await session.login({ email: "a@b.co", password: "x" });
    expect(isTwoFactorSetupRequired(result)).toBe(true);
    expect(session.isAuthenticated()).toBe(false);
  });

  it("logout posts /auth/logout (204) and ends the session", async () => {
    const { calls } = stubFetch(dataResponse(userFixture()), emptyResponse(204));
    const { session } = setup();
    await session.login({ email: "a@b.co", password: "x" });
    await session.logout();
    expect(calls[1]).toMatchObject({ method: "POST", path: "/auth/logout" });
    expect(session.isAuthenticated()).toBe(false);
  });

  it("logout resolves when the server says there was no session already", async () => {
    stubFetch(problemResponse(401, "unauthenticated"));
    const { session } = setup();
    await expect(session.logout()).resolves.toBeUndefined();
    expect(session.isAuthenticated()).toBe(false);
  });

  it("logoutAll posts /auth/logout-all and ends the session", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    const { session } = setup();
    await session.logoutAll();
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/logout-all" });
    expect(session.isAuthenticated()).toBe(false);
  });

  it("requestMagicLink posts the email to /auth/magic-link (202)", async () => {
    const { calls } = stubFetch(emptyResponse(202));
    await expect(setup().session.requestMagicLink("carla@vossler.com")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/magic-link",
      body: { email: "carla@vossler.com" },
    });
  });

  it("exchangeMagicLink posts the token in the body and starts the session", async () => {
    const { calls } = stubFetch(dataResponse(userFixture(CARLA)));
    const { session } = setup();
    const user = asUser(await session.exchangeMagicLink("magic-carla"));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/magic-link/exchange",
      body: { token: "magic-carla" },
    });
    expect(user.id).toBe(IDS.carla);
    expect(session.isAuthenticated()).toBe(true);
  });

  it("exchangeMagicLink rejects with token codes", async () => {
    stubFetch(problemResponse(410, "token_expired"));
    await expect(setup().session.exchangeMagicLink("magic-expired")).rejects.toThrow(
      "token_expired",
    );
  });

  it("exchangeInvitation posts the token and returns the preview with full_name and invited_by_name", async () => {
    const preview = {
      email: "yesenia@moralespisos.com",
      role: "business_owner",
      organization_name: null,
      business_name: "Morales Pisos y Cerámica",
      expires_at: "2026-10-20T23:59:59.000Z",
      full_name: "Yesenia Morales",
      invited_by_name: "Nicolás García",
    };
    const { calls } = stubFetch(dataResponse(preview));
    expect(await setup().session.exchangeInvitation("invite-yesenia")).toEqual(preview);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/invitations/exchange",
      body: { token: "invite-yesenia" },
    });
  });

  it("acceptInvitation posts token, name, password and terms and starts the session", async () => {
    const { calls } = stubFetch(dataResponse(userFixture(CARLA)));
    const { session } = setup();
    const user = asUser(
      await session.acceptInvitation({
        token: "invite-yesenia",
        name: "Yesenia",
        password: "piso-ceramica-2026",
        accepted_terms: true,
      }),
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/invitations/accept",
      body: {
        token: "invite-yesenia",
        name: "Yesenia",
        password: "piso-ceramica-2026",
        accepted_terms: true,
      },
    });
    expect(user.id).toBe(IDS.carla);
    expect(session.isAuthenticated()).toBe(true);
  });

  it("forgotPassword posts the email to /auth/password/forgot (202)", async () => {
    const { calls } = stubFetch(emptyResponse(202));
    await setup().session.forgotPassword("carla@vossler.com");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/password/forgot",
      body: { email: "carla@vossler.com" },
    });
  });

  it("resetPassword posts token and password to /auth/password/reset (204) without starting a session", async () => {
    const { calls } = stubFetch(emptyResponse(204), problemResponse(422, "weak_password"));
    const { session } = setup();
    await expect(
      session.resetPassword({ token: "reset-carla", password: "una-clave-larga-2026" }),
    ).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/password/reset",
      body: { token: "reset-carla", password: "una-clave-larga-2026" },
    });
    await expect(
      session.resetPassword({ token: "reset-carla", password: "corta" }),
    ).rejects.toThrow("weak_password");
  });
});

describe("http session: POST /me/password (create or change the password)", () => {
  it("creating posts only the new password and resolves on 204", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    await expect(
      setup().session.setPassword({ password: "una-clave-larga-2026" }),
    ).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/me/password",
      body: { password: "una-clave-larga-2026" },
    });
    expect("current_password" in (calls[0]?.body as Record<string, unknown>)).toBe(false);
  });

  it("changing posts the current password along with the new one", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    await setup().session.setPassword({
      password: "otra-clave-larga-2026",
      current_password: "Demo1234!",
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/me/password",
      body: { password: "otra-clave-larga-2026", current_password: "Demo1234!" },
    });
  });

  it("an empty current password is not sent (the API decides whether it is required)", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    await setup().session.setPassword({ password: "una-clave-larga-2026", current_password: "" });
    expect(calls[0]?.body).toEqual({ password: "una-clave-larga-2026" });
  });

  it("keeps the API's codes: current_password_required (422), invalid_credentials (401), weak_password (422)", async () => {
    stubFetch(
      problemResponse(422, "current_password_required"),
      problemResponse(401, "invalid_credentials"),
      problemResponse(422, "weak_password"),
    );
    const { session } = setup();
    await expect(session.setPassword({ password: "una-clave-larga-2026" })).rejects.toThrow(
      "current_password_required",
    );
    await expect(
      session.setPassword({ password: "una-clave-larga-2026", current_password: "mal" }),
    ).rejects.toThrow("invalid_credentials");
    await expect(
      session.setPassword({ password: "corta", current_password: "Demo1234!" }),
    ).rejects.toThrow("weak_password");
  });
});

describe("http session: two-factor (TOTP) and entry link", () => {
  const signedOut = async (...replies: Response[]) => {
    const recorded = stubFetch(problemResponse(401, "unauthenticated"), ...replies);
    const ctx = setup();
    await ctx.session.getCurrentUser().catch(() => undefined);
    return { ...ctx, calls: recorded.calls };
  };

  it("magic link and invitation with TOTP on answer the challenge (202) without a session", async () => {
    const challenge = { two_factor_required: true, challenge_id: "ch-2" };
    const { session } = await signedOut(dataResponse(challenge, 202), dataResponse(challenge, 202));
    expect(await session.exchangeMagicLink("magic-carla")).toEqual(challenge);
    expect(
      await session.acceptInvitation({
        token: "invite-yesenia",
        name: "Yesenia",
        password: "piso-ceramica-2026",
        accepted_terms: true,
      }),
    ).toEqual(challenge);
    expect(session.isAuthenticated()).toBe(false);
  });

  it("exchangeEntryLink posts the token in the body and starts the session", async () => {
    const { session, calls } = await signedOut(dataResponse(userFixture(CARLA)));
    const user = asUser(await session.exchangeEntryLink("entrada-castillo"));
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/auth/entry-link/exchange",
      body: { token: "entrada-castillo" },
    });
    expect(user.id).toBe(IDS.carla);
    expect(session.isAuthenticated()).toBe(true);
  });

  it("exchangeEntryLink answers the two-factor states without a session, and keeps token codes", async () => {
    const { session } = await signedOut(
      dataResponse({ two_factor_setup_required: true, setup_token: "st-9" }, 202),
      problemResponse(410, "token_expired"),
    );
    expect(isTwoFactorSetupRequired(await session.exchangeEntryLink("entrada-x"))).toBe(true);
    expect(session.isAuthenticated()).toBe(false);
    await expect(session.exchangeEntryLink("entrada-expired")).rejects.toThrow("token_expired");
  });

  it("verifyTwoFactor posts challenge and code to /auth/2fa/verify and starts the session", async () => {
    const { session, calls } = await signedOut(dataResponse(userFixture(MARILYN)));
    const user = await session.verifyTwoFactor({ challenge_id: "ch-1", code: "123456" });
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/auth/2fa/verify",
      body: { challenge_id: "ch-1", code: "123456" },
    });
    expect(user.id).toBe(IDS.marilyn);
    expect(session.isAuthenticated()).toBe(true);
  });

  it("verifyTwoFactor keeps invalid_code and challenge_invalid, and starts nothing", async () => {
    const { session } = await signedOut(
      problemResponse(422, "invalid_code"),
      problemResponse(400, "challenge_invalid"),
    );
    await expect(session.verifyTwoFactor({ challenge_id: "ch-1", code: "000000" })).rejects.toThrow(
      "invalid_code",
    );
    await expect(session.verifyTwoFactor({ challenge_id: "ch-1", code: "123456" })).rejects.toThrow(
      "challenge_invalid",
    );
    expect(session.isAuthenticated()).toBe(false);
  });

  it("recoverTwoFactor posts to /auth/2fa/recovery and starts the session", async () => {
    const { session, calls } = await signedOut(dataResponse(userFixture(MARILYN)));
    await session.recoverTwoFactor({ challenge_id: "ch-1", code: "SMDEMO-0001" });
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/auth/2fa/recovery",
      body: { challenge_id: "ch-1", code: "SMDEMO-0001" },
    });
    expect(session.isAuthenticated()).toBe(true);
  });

  it("setupTwoFactor with a setup token sends X-Setup-Token and no body", async () => {
    const answer = { secret: "JBSWY3DP", otpauth_url: "otpauth://totp/x?secret=JBSWY3DP" };
    const { calls } = stubFetch(dataResponse(answer));
    expect(await setup().session.setupTwoFactor("st-1")).toEqual(answer);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/2fa/setup", body: undefined });
    expect(calls[0]?.headers["X-Setup-Token"]).toBe("st-1");
  });

  it("setupTwoFactor signed in sends no X-Setup-Token", async () => {
    const { calls } = stubFetch(dataResponse({ secret: "S", otpauth_url: "otpauth://totp/x" }));
    await setup().session.setupTwoFactor(null);
    expect(calls[0]?.headers["X-Setup-Token"]).toBeUndefined();
  });

  it("a gone setup token (401) is setup_token_invalid; signed in, a 401 stays unauthenticated", async () => {
    stubFetch(problemResponse(401, "unauthenticated"), problemResponse(401, "unauthenticated"));
    const { session } = setup();
    await expect(session.setupTwoFactor("st-gone")).rejects.toThrow("setup_token_invalid");
    await expect(session.setupTwoFactor()).rejects.toThrow("unauthenticated");
  });

  it("confirmTwoFactor posts the code with X-Setup-Token and answers the recovery codes, no session", async () => {
    const codes = { recovery_codes: ["A-1", "A-2"] };
    const { session, calls } = await signedOut(dataResponse(codes));
    expect(await session.confirmTwoFactor("123456", "st-1")).toEqual(codes);
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: "/auth/2fa/confirm",
      body: { code: "123456" },
    });
    expect(calls[1]?.headers["X-Setup-Token"]).toBe("st-1");
    expect(session.isAuthenticated()).toBe(false);
  });

  it("disableTwoFactor posts the code to /auth/2fa/disable (assumed endpoint)", async () => {
    const { calls } = stubFetch(emptyResponse(204), problemResponse(422, "invalid_code"));
    const { session } = setup();
    await expect(session.disableTwoFactor("123456")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/auth/2fa/disable",
      body: { code: "123456" },
    });
    await expect(session.disableTwoFactor("000000")).rejects.toThrow("invalid_code");
  });
});

describe("http session: Ver como (impersonation, SM Global only)", () => {
  it("getViewAsOptions is empty for anyone but SM Global", async () => {
    const { calls } = stubFetch(dataResponse(meFixture()));
    expect(await setup().session.getViewAsOptions()).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("getViewAsOptions lists GET /users with their organization and business", async () => {
    const { calls } = stubFetch(
      dataResponse(meFixture(MARILYN)),
      dataResponse([
        userFixture(MARILYN),
        userFixture(),
        userFixture(CARLA),
        userFixture({
          id: IDS.lucia,
          full_name: "Lucía Pérez",
          role: "partner_firm",
          organization_id: IDS.firm,
          status: "invited",
        }),
      ]),
      dataResponse([
        organizationFixture({ id: IDS.office, name: "SM Miami", kind: "sm", area: null }),
        organizationFixture(),
      ]),
      dataResponse([businessFixture()]),
    );
    const options = await setup().session.getViewAsOptions();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /me",
      "GET /users",
      "GET /organizations",
      "GET /businesses",
    ]);
    expect(
      options.map((o) => [
        o.user.id,
        o.organization?.name ?? null,
        o.business?.name ?? null,
        o.enabled,
      ]),
    ).toEqual([
      [IDS.marilyn, null, null, true],
      [IDS.andrea, "SM Miami", null, true],
      [IDS.carla, null, "Vossler", true],
      // Invited people cannot be impersonated (cannot_impersonate): listed but disabled.
      [IDS.lucia, "Estudio Pérez", null, false],
    ]);
  });

  it("setViewAs posts /impersonate/{user}, then picking yourself again deletes /impersonate", async () => {
    const { calls } = stubFetch(
      dataResponse(meFixture(MARILYN)),
      dataResponse([userFixture(MARILYN), userFixture(CARLA)]),
      dataResponse([]),
      dataResponse([]),
      dataResponse(meFixture(CARLA, { id: IDS.carla, name: "Carla Méndez" })),
      dataResponse(meFixture(MARILYN)),
    );
    const { session, client } = setup();
    await session.getViewAsOptions();
    const carla = await session.setViewAs(IDS.carla);
    expect(calls[4]).toMatchObject({ method: "POST", path: `/impersonate/${IDS.carla}` });
    expect(carla.id).toBe(IDS.carla);
    expect(client.session().impersonating).toEqual({ id: IDS.carla, name: "Carla Méndez" });
    // While impersonating, the options are the ones built as Marilyn.
    expect((await session.getViewAsOptions()).map((o) => o.user.id)).toEqual([
      IDS.marilyn,
      IDS.carla,
    ]);
    const back = await session.setViewAs(IDS.marilyn);
    expect(calls[5]).toMatchObject({ method: "DELETE", path: "/impersonate" });
    expect(back.id).toBe(IDS.marilyn);
    expect(client.session().impersonating).toBeNull();
  });

  it("switching from one impersonated person to another goes back first (the API blocks nested impersonation)", async () => {
    const { calls } = stubFetch(
      dataResponse(meFixture(MARILYN)),
      dataResponse([userFixture(MARILYN), userFixture(CARLA), userFixture()]),
      dataResponse([]),
      dataResponse([]),
      dataResponse(meFixture(CARLA, { id: IDS.carla, name: "Carla Méndez" })),
      dataResponse(meFixture(MARILYN)),
      dataResponse(meFixture({}, { id: IDS.andrea, name: "Andrea Salazar" })),
    );
    const { session } = setup();
    await session.getViewAsOptions();
    await session.setViewAs(IDS.carla);
    const andrea = await session.setViewAs(IDS.andrea);
    expect(calls.slice(5).map((c) => `${c.method} ${c.path}`)).toEqual([
      "DELETE /impersonate",
      `POST /impersonate/${IDS.andrea}`,
    ]);
    expect(andrea.id).toBe(IDS.andrea);
  });

  it("setViewAs keeps the API's refusal codes", async () => {
    stubFetch(dataResponse(meFixture()), problemResponse(403, "forbidden"));
    await expect(setup().session.setViewAs(IDS.carla)).rejects.toThrow("forbidden");
  });
});
