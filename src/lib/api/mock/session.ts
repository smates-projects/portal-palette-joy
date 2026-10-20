// Sign-in, invitations, magic links, entry links, password reset and two-factor (TOTP) in the mock. Same contract
// and error codes as the real API (PLAN_BACKEND 5.1, 5.3): tokens are single use, expire, and are always sent in
// the body. The mock starts signed in (the demo, the tutorials and the Lovable preview need it) and goes back to
// that state on every page reload.
import { nowIso } from "@/config/app";
import { isActiveUser } from "@/lib/accounts/permissions";
import type { SessionRepository } from "../repositories";
import {
  MIN_PASSWORD_LENGTH,
  type AccountEvent,
  type Business,
  type InvitationPreview,
  type Lead,
  type Organization,
  type SignInResult,
  type TwoFactorChallenge,
  type TwoFactorSetupRequired,
  type User,
  type Uuid,
} from "../types";

/**
 * Password of every seeded user. The login screen shows it as a hint only in development builds
 * (import.meta.env.DEV); production never displays it.
 */
export const DEMO_PASSWORD = "Demo1234!";

/** The only code the mock's "authenticator app" ever shows (verify, confirm and disable). */
export const DEMO_TOTP_CODE = "123456";

/** Secret the mock hands out on setup (base32, as an authenticator app expects it). */
export const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPSMDEMOFA";

/** Recovery codes of every account that turns TOTP on in the mock. Each one works once. */
export const DEMO_RECOVERY_CODES: readonly string[] = Array.from(
  { length: 8 },
  (_, i) => `SMDEMO-${String(i + 1).padStart(4, "0")}`,
);

/** Accounts that start with TOTP on: Marilyn Boraei (SM Global). Her login answers a challenge. */
export const DEMO_TOTP_EMAILS: readonly string[] = ["marilyn@strategicmates.com"];

/** Challenge id that is always expired, to show that state from the demo. */
export const DEMO_EXPIRED_CHALLENGE = "challenge-expired";

/** A challenge lasts 5 minutes, like the API's. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type TokenPurpose = "invite" | "magic_login" | "reset" | "entry_link";

interface AuthToken {
  token: string;
  purpose: TokenPurpose;
  /** The account the token belongs to (matched by email, so it works for owners created by the intake seed). */
  email: string;
  expires_at: string;
  used_at: string | null;
  /** Demo only: signing in with this token answers "turn TOTP on first" (TwoFactorSetupRequired). */
  setup_required?: boolean | undefined;
}

/**
 * Demo tokens, so every screen can be opened from a URL:
 * - /invitacion/invite-yesenia: Yesenia Morales (Morales Pisos y Cerámica), valid.
 * - /invitacion/invite-expired: Ramón Castillo, expired on 10 Oct.
 * - /invitacion/invite-used: Carla Méndez, already accepted.
 * - /enlace/magic-carla: magic link for Carla Méndez, valid for the demo day.
 * - /enlace/magic-expired: expired magic link.
 * - /restablecer/reset-carla: password reset for Carla Méndez, valid for the demo day.
 * - /restablecer/reset-expired: expired reset link.
 * - /enlace/magic-setup: magic link for Nicolás García that answers "turn TOTP on first" (setup token flow).
 * - /entrada/entrada-castillo: entry link of Ramón Castillo (Castillo Instalaciones), lands on "Tu ingreso".
 * - /entrada/entrada-rivera: entry link of Javier Rivera (Rivera Roofing & Remodel). Resolved by email when used,
 *   so it works once his owner account exists (created when the meeting is booked); before that, token_invalid.
 * - /entrada/entrada-expired: expired entry link.
 * Valid ones expire after the fixed demo day (TODAY) so they keep working whatever the real clock says.
 */
export const DEMO_TOKENS: readonly AuthToken[] = [
  {
    token: "invite-yesenia",
    purpose: "invite",
    email: "yesenia@moralespisos.com",
    expires_at: "2026-10-20T23:59:59.000Z",
    used_at: null,
  },
  {
    token: "invite-expired",
    purpose: "invite",
    email: "ramon@castilloinstalaciones.com",
    expires_at: "2026-10-10T12:00:00.000Z",
    used_at: null,
  },
  {
    token: "invite-used",
    purpose: "invite",
    email: "carla@vossler.com",
    expires_at: "2026-08-05T12:00:00.000Z",
    used_at: "2026-07-30T15:20:00.000Z",
  },
  {
    token: "magic-carla",
    purpose: "magic_login",
    email: "carla@vossler.com",
    expires_at: "2026-10-15T00:00:00.000Z",
    used_at: null,
  },
  {
    token: "magic-expired",
    purpose: "magic_login",
    email: "carla@vossler.com",
    expires_at: "2026-10-13T09:15:00.000Z",
    used_at: null,
  },
  {
    token: "reset-carla",
    purpose: "reset",
    email: "carla@vossler.com",
    expires_at: "2026-10-15T00:00:00.000Z",
    used_at: null,
  },
  {
    token: "reset-expired",
    purpose: "reset",
    email: "carla@vossler.com",
    expires_at: "2026-10-13T09:15:00.000Z",
    used_at: null,
  },
  {
    token: "magic-setup",
    purpose: "magic_login",
    email: "nicolas@strategicmates.com",
    expires_at: "2026-10-20T23:59:59.000Z",
    used_at: null,
    setup_required: true,
  },
  {
    token: "entrada-castillo",
    purpose: "entry_link",
    email: "ramon@castilloinstalaciones.com",
    expires_at: "2026-10-20T23:59:59.000Z",
    used_at: null,
  },
  {
    token: "entrada-rivera",
    purpose: "entry_link",
    email: "javier@riveraroofing.com",
    expires_at: "2026-10-20T23:59:59.000Z",
    used_at: null,
  },
  {
    token: "entrada-expired",
    purpose: "entry_link",
    email: "ramon@castilloinstalaciones.com",
    expires_at: "2026-10-12T12:00:00.000Z",
    used_at: null,
  },
];

export interface SessionDb {
  users: User[];
  orgs: Organization[];
  businesses: Business[];
  leads: Lead[];
  accountEvents: AccountEvent[];
}

export interface SessionContext {
  db: SessionDb;
  newId: () => Uuid;
  delay: <T>(value: T) => Promise<T>;
  /** The person the mock acts as ("Ver como" changes it too). */
  getUserId: () => Uuid;
  setUserId: (id: Uuid) => void;
}

type AuthMethods = Omit<SessionRepository, "getCurrentUser" | "getViewAsOptions" | "setViewAs">;

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Extra controls of the mock, used when the real session runs over HTTP while other repositories stay mock. */
export interface MockSessionControls {
  /** Makes the mock act as the user with that email (ids differ from the API, emails match). False when none. */
  adoptUserByEmail: (email: string) => boolean;
  /** Back to the mock's default demo user. */
  resetUser: () => void;
}

export function createSession(
  ctx: SessionContext,
): AuthMethods & Pick<MockSessionControls, "adoptUserByEmail"> {
  const { db, delay } = ctx;
  // Starts signed in as the seeded user; logout() clears it until a login, an accepted invitation or a magic link.
  let authenticated = true;
  const tokens: AuthToken[] = DEMO_TOKENS.map((t) => ({ ...t }));
  /** Passwords set by accepting an invitation or resetting; everyone else uses DEMO_PASSWORD. */
  const passwords = new Map<Uuid, string>();

  const userByEmail = (email: string) => db.users.find((u) => sameEmail(u.email, email));
  const startSession = (user: User) => {
    ctx.setUserId(user.id);
    authenticated = true;
    return delay({ ...user });
  };

  // ---------- Two-factor (TOTP) state, in memory like the rest of the mock ----------
  /** Unused recovery codes of each account with TOTP on. */
  const recoveryCodes = new Map<Uuid, Set<string>>();
  /** Login challenges: single use, 5 minutes. A wrong code keeps the challenge (the person types again). */
  const challenges = new Map<string, { userId: Uuid; expiresAt: number }>([
    [DEMO_EXPIRED_CHALLENGE, { userId: "", expiresAt: 0 }],
  ]);
  /** Setup tokens of a "turn TOTP on first" sign-in: they open setup and confirm only, and confirm uses them up. */
  const setupTokens = new Map<string, Uuid>();
  /** Accounts that asked for a secret (setup) and still have to confirm it. */
  const pendingSetup = new Set<Uuid>();

  const enableTotp = (user: User) => {
    user.two_factor_enabled = true;
    recoveryCodes.set(user.id, new Set(DEMO_RECOVERY_CODES));
  };
  for (const email of DEMO_TOTP_EMAILS) {
    const user = userByEmail(email);
    if (user) enableTotp(user);
  }

  const nowMs = () => Date.parse(nowIso());

  /**
   * The same decision the API makes after a correct password, magic link, invitation or entry link: TOTP on → a
   * challenge; a demo token that requires setup → a setup token; otherwise the session starts.
   */
  const afterAuthentication = (user: User, setupRequired = false): Promise<SignInResult> => {
    if (user.two_factor_enabled) {
      const challengeId = ctx.newId();
      challenges.set(challengeId, { userId: user.id, expiresAt: nowMs() + CHALLENGE_TTL_MS });
      const answer: TwoFactorChallenge = { two_factor_required: true, challenge_id: challengeId };
      return delay(answer);
    }
    if (setupRequired) {
      const setupToken = ctx.newId();
      setupTokens.set(setupToken, user.id);
      const answer: TwoFactorSetupRequired = {
        two_factor_setup_required: true,
        setup_token: setupToken,
      };
      return delay(answer);
    }
    return startSession(user);
  };

  /** The challenge's account, or why it cannot be used. Does not use it up. */
  const challengeUser = (challengeId: string) => {
    const challenge = challenges.get(challengeId.trim());
    if (!challenge) throw new Error("challenge_invalid");
    if (challenge.expiresAt <= nowMs()) {
      challenges.delete(challengeId.trim());
      throw new Error("challenge_expired");
    }
    const user = db.users.find((u) => u.id === challenge.userId);
    if (!user || !isActiveUser(user) || !user.two_factor_enabled)
      throw new Error("challenge_invalid");
    return user;
  };

  /** Who is turning TOTP on: the setup token's account, or the signed-in person when there is no token. */
  const setupUser = (setupToken: string | null | undefined) => {
    if (setupToken) {
      const userId = setupTokens.get(setupToken);
      const user = userId ? db.users.find((u) => u.id === userId) : undefined;
      if (!user) throw new Error("setup_token_invalid");
      return user;
    }
    if (!authenticated) throw new Error("unauthenticated");
    const user = db.users.find((u) => u.id === ctx.getUserId());
    if (!user) throw new Error("unauthenticated");
    return user;
  };

  const checkTotp = (code: string) => {
    if (code.replace(/\s+/g, "") !== DEMO_TOTP_CODE) throw new Error("invalid_code");
  };
  /** The token of that purpose, still usable. Unknown or of another purpose: token_invalid. */
  const usableToken = (raw: string, purpose: TokenPurpose) => {
    const t = tokens.find((x) => x.token === raw.trim() && x.purpose === purpose);
    const user = t && userByEmail(t.email);
    if (!t || !user) throw new Error("token_invalid");
    if (t.used_at) throw new Error("token_used");
    if (t.expires_at <= nowIso()) throw new Error("token_expired");
    return { t, user };
  };
  const checkPassword = (password: string) => {
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error("weak_password");
  };
  const logAccepted = (user: User) =>
    db.accountEvents.push({
      id: ctx.newId(),
      user_id: user.id,
      kind: "accepted",
      actor_user_id: null,
      created_at: nowIso(),
      body: null,
    });

  return {
    adoptUserByEmail: (email) => {
      const user = userByEmail(email);
      if (!user) return false;
      ctx.setUserId(user.id);
      return true;
    },
    isAuthenticated: () => authenticated,
    login: async ({ email, password }) => {
      const user = userByEmail(email);
      // Invited people have no password yet: same answer as a wrong one, so nobody learns who has an account.
      const expected = user
        ? (passwords.get(user.id) ?? (user.status === "invited" ? null : DEMO_PASSWORD))
        : null;
      if (!user || expected === null || password !== expected)
        throw new Error("invalid_credentials");
      if (!isActiveUser(user)) throw new Error("account_inactive");
      return afterAuthentication(user);
    },
    verifyTwoFactor: async ({ challenge_id, code }) => {
      const user = challengeUser(challenge_id);
      checkTotp(code);
      challenges.delete(challenge_id.trim());
      return startSession(user);
    },
    recoverTwoFactor: async ({ challenge_id, code }) => {
      const user = challengeUser(challenge_id);
      const unused = recoveryCodes.get(user.id);
      const clean = code.trim().toUpperCase();
      if (!unused?.has(clean)) throw new Error("invalid_code");
      unused.delete(clean);
      challenges.delete(challenge_id.trim());
      return startSession(user);
    },
    setupTwoFactor: async (setupToken) => {
      const user = setupUser(setupToken);
      if (user.two_factor_enabled) throw new Error("two_factor_already_enabled");
      pendingSetup.add(user.id);
      const label = encodeURIComponent(`Strategic Mates:${user.email}`);
      return delay({
        secret: DEMO_TOTP_SECRET,
        otpauth_url: `otpauth://totp/${label}?secret=${DEMO_TOTP_SECRET}&issuer=Strategic%20Mates`,
      });
    },
    confirmTwoFactor: async (code, setupToken) => {
      const user = setupUser(setupToken);
      if (user.two_factor_enabled) throw new Error("two_factor_already_enabled");
      if (!pendingSetup.has(user.id)) throw new Error("two_factor_not_started");
      checkTotp(code);
      pendingSetup.delete(user.id);
      enableTotp(user);
      // With a setup token no session starts: the token is used up and the next login asks for the code.
      if (setupToken) setupTokens.delete(setupToken);
      return delay({ recovery_codes: [...DEMO_RECOVERY_CODES] });
    },
    disableTwoFactor: async (code) => {
      const user = setupUser(null);
      if (!user.two_factor_enabled) throw new Error("two_factor_not_enabled");
      checkTotp(code);
      user.two_factor_enabled = false;
      recoveryCodes.delete(user.id);
      return delay(undefined);
    },
    logout: async () => {
      authenticated = false;
      return delay(undefined);
    },
    // The mock keeps a single session, so "everywhere" is the same as here.
    logoutAll: async () => {
      authenticated = false;
      return delay(undefined);
    },
    requestMagicLink: async () => delay(undefined),
    exchangeMagicLink: async (token) => {
      const { t, user } = usableToken(token, "magic_login");
      if (!isActiveUser(user)) throw new Error("account_inactive");
      t.used_at = nowIso();
      return afterAuthentication(user, t.setup_required === true);
    },
    exchangeEntryLink: async (token) => {
      const { t, user } = usableToken(token, "entry_link");
      if (!isActiveUser(user)) throw new Error("account_inactive");
      t.used_at = nowIso();
      return afterAuthentication(user, t.setup_required === true);
    },
    exchangeInvitation: async (token) => {
      const { t, user } = usableToken(token, "invite");
      const business = db.businesses.find((b) => b.id === user.business_id);
      // The consultant of the lead sent it (SendNdaAndMou); other roles are invited by an admin we do not track here.
      const consultantId = db.leads.find((l) =>
        sameEmail(l.contact.email, user.email),
      )?.consultant_user_id;
      const preview: InvitationPreview = {
        email: user.email,
        role: user.role,
        organization_name: db.orgs.find((o) => o.id === user.organization_id)?.name ?? null,
        business_name: business?.name ?? null,
        expires_at: t.expires_at,
        full_name: user.full_name.trim() || null,
        invited_by_name: db.users.find((u) => u.id === consultantId)?.full_name ?? null,
      };
      return delay(preview);
    },
    acceptInvitation: async (input) => {
      const { t, user } = usableToken(input.token, "invite");
      if (!input.name.trim()) throw new Error("name_required");
      checkPassword(input.password);
      // Checked at runtime too: the type says true, but the body comes from a form.
      if ((input.accepted_terms as boolean) !== true) throw new Error("terms_required");
      user.full_name = input.name.trim();
      if (user.status === "invited") {
        user.status = "active";
        user.activated_at = nowIso();
        logAccepted(user);
      }
      passwords.set(user.id, input.password);
      t.used_at = nowIso();
      return afterAuthentication(user);
    },
    forgotPassword: async () => delay(undefined),
    resetPassword: async (input) => {
      const { t, user } = usableToken(input.token, "reset");
      checkPassword(input.password);
      passwords.set(user.id, input.password);
      t.used_at = nowIso();
      return delay(undefined);
    },
  };
}
