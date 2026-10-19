// Sign-in, invitations, magic links and password reset in the mock. Same contract and error codes as the real
// API (PLAN_BACKEND 5.1): tokens are single use, expire, and are always sent in the body. The mock starts signed
// in (the demo, the tutorials and the Lovable preview need it) and goes back to that state on every page reload.
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
  type User,
  type Uuid,
} from "../types";

/**
 * Password of every seeded user. The login screen shows it as a hint only in development builds
 * (import.meta.env.DEV); production never displays it.
 */
export const DEMO_PASSWORD = "Demo1234!";

type TokenPurpose = "invite" | "magic_login" | "reset";

interface AuthToken {
  token: string;
  purpose: TokenPurpose;
  /** The account the token belongs to (matched by email, so it works for owners created by the intake seed). */
  email: string;
  expires_at: string;
  used_at: string | null;
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
 * Valid ones expire at the end of the fixed demo day (TODAY) so they keep working whatever the real clock says.
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

export function createSession(ctx: SessionContext): AuthMethods {
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
      return startSession(user);
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
      return startSession(user);
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
      return startSession(user);
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
