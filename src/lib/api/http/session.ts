// SessionRepository over the real API: cookie session, email links, and "Ver como" as real impersonation.
import type { SessionRepository } from "../repositories";
import type {
  Business,
  InvitationPreview,
  Organization,
  User,
  UserRole,
  Uuid,
  ViewAsOption,
} from "../types";
import { ApiError, isApiError, type HttpClient, type SessionSnapshot } from "./client";

/** GET /me: the User plus who SM Global is viewing as (null when it is a normal session). */
export interface MeResponse extends User {
  impersonating: { id: Uuid; name: string } | null;
}

/** 202 of POST /auth/login when the account has two-factor on. */
interface TwoFactorChallenge {
  two_factor_required: true;
  challenge_id: string;
}

/** The API's Me carries `impersonating`; the front's User does not. */
export function toUser(me: MeResponse | User): User {
  const { impersonating: _impersonating, ...user } = me as MeResponse;
  return user;
}

const impersonatingOf = (me: MeResponse | User): SessionSnapshot["impersonating"] =>
  "impersonating" in me ? (me.impersonating ?? null) : null;

/** GET /me, and the client's session snapshot updated with the answer. */
export async function fetchMe(client: HttpClient): Promise<User> {
  const me = await client.get<MeResponse>("/me");
  const user = toUser(me);
  client.updateSessionUser(user, impersonatingOf(me));
  return user;
}

/** The signed-in person: the last /me answer, or a fresh GET /me when none was read yet. */
export async function ensureCurrentUser(client: HttpClient): Promise<User> {
  const cached = client.session().user;
  if (cached) return cached;
  if (cached === null) throw new ApiError({ code: "unauthenticated", status: 401 });
  return fetchMe(client);
}

/** Roles the mock's "Ver como" offers (every role of the portal). */
export const VIEW_AS_ROLES: readonly UserRole[] = [
  "partner_firm",
  "business_owner",
  "sm_team",
  "sm_global",
  "bishop",
  "franchisee",
];

const isTwoFactorChallenge = (value: unknown): value is TwoFactorChallenge =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>)["two_factor_required"] === true;

export function createHttpSessionRepository(client: HttpClient): SessionRepository {
  /**
   * Options built while the real SM Global person was signed in. While impersonating, GET /users answers with the
   * viewed person's scope, so the list of that moment is kept to go back or switch.
   */
  let viewAsCache: { realUserId: Uuid; options: ViewAsOption[] } | null = null;

  /** A session was started by the API (login, magic link, invitation): the cookie is set, the answer is the user. */
  const startSession = (user: User) => {
    client.setSession(toUser(user), null);
    viewAsCache = null;
    return toUser(user);
  };

  const endSession = () => {
    client.setSession(null);
    viewAsCache = null;
  };

  /** POST /impersonate/{user} and DELETE /impersonate both answer the new Me (and rotate the cookie). */
  const applyMe = (me: MeResponse) => {
    const user = toUser(me);
    client.setSession(user, impersonatingOf(me));
    return user;
  };

  async function buildViewAsOptions(me: User): Promise<ViewAsOption[]> {
    const [users, organizations, businesses] = await Promise.all([
      client.get<User[]>("/users"),
      client.get<Organization[]>("/organizations"),
      client.get<Business[]>("/businesses"),
    ]);
    const roles = new Set<UserRole>(VIEW_AS_ROLES);
    return users
      .filter((user) => roles.has(user.role))
      .map((user) => ({
        user,
        organization: organizations.find((o) => o.id === user.organization_id) ?? null,
        business: businesses.find((b) => b.id === user.business_id) ?? null,
        // The API only impersonates another active person (cannot_impersonate otherwise); yourself is the current option.
        enabled: user.id === me.id || user.status === undefined || user.status === "active",
      }));
  }

  return {
    getCurrentUser: () => fetchMe(client),

    /**
     * SM Global only (the API answers 403 to anyone else): an empty list for other roles, so the selector hides.
     * While impersonating, the list built before the switch.
     */
    getViewAsOptions: async () => {
      const me = await ensureCurrentUser(client);
      const { impersonating } = client.session();
      if (impersonating) {
        // Gap: after a page reload in the middle of an impersonation the real person's list is not known (GET /me
        // does not say who impersonates and GET /users answers with the viewed person's scope). Only the current
        // person is offered then; picking it ends the impersonation (setViewAs below).
        return (
          viewAsCache?.options ?? [{ user: me, organization: null, business: null, enabled: true }]
        );
      }
      if (me.role !== "sm_global") return [];
      const options = await buildViewAsOptions(me);
      viewAsCache = { realUserId: me.id, options };
      return options;
    },

    setViewAs: async (userId) => {
      const me = await ensureCurrentUser(client);
      const { impersonating } = client.session();
      if (!impersonating) {
        if (userId === me.id) return me;
        return applyMe(await client.post<MeResponse>(`/impersonate/${encodeURIComponent(userId)}`));
      }
      // POST /impersonate is blocked while impersonating: go back to the real person first.
      if (userId === me.id && !viewAsCache)
        return applyMe(await client.delete<MeResponse>("/impersonate"));
      if (userId === me.id) return me;
      const real = applyMe(await client.delete<MeResponse>("/impersonate"));
      if (userId === real.id) return real;
      return applyMe(await client.post<MeResponse>(`/impersonate/${encodeURIComponent(userId)}`));
    },

    /**
     * Derived from the last GET /me (or sign-in) the client saw. Before the first answer it is "unknown" and reads
     * as signed in, so a page reload does not bounce to /login while /me is in flight; a 401 flips it to false.
     */
    isAuthenticated: () => client.session().user !== null,

    login: async (input) => {
      const result = await client.post<User | TwoFactorChallenge>("/auth/login", {
        email: input.email,
        password: input.password,
      });
      if (isTwoFactorChallenge(result)) {
        // Gap: the front has no TOTP step yet. The challenge id travels in `detail` for when it does.
        throw new ApiError({
          code: "two_factor_required",
          status: 202,
          detail: result.challenge_id,
        });
      }
      return startSession(result);
    },

    logout: async () => {
      try {
        await client.post<void>("/auth/logout");
      } catch (error) {
        // Already signed out on the server: the result the person wanted.
        if (!(isApiError(error) && error.status === 401)) throw error;
      }
      endSession();
    },

    logoutAll: async () => {
      try {
        await client.post<void>("/auth/logout-all");
      } catch (error) {
        if (!(isApiError(error) && error.status === 401)) throw error;
      }
      endSession();
    },

    requestMagicLink: async (email) => {
      await client.post<void>("/auth/magic-link", { email });
    },

    exchangeMagicLink: async (token) =>
      startSession(await client.post<User>("/auth/magic-link/exchange", { token })),

    exchangeInvitation: (token) =>
      client.post<InvitationPreview>("/auth/invitations/exchange", { token }),

    acceptInvitation: async (input) =>
      startSession(
        await client.post<User>("/auth/invitations/accept", {
          token: input.token,
          name: input.name,
          password: input.password,
          accepted_terms: input.accepted_terms,
        }),
      ),

    forgotPassword: async (email) => {
      await client.post<void>("/auth/password/forgot", { email });
    },

    resetPassword: async (input) => {
      await client.post<void>("/auth/password/reset", {
        token: input.token,
        password: input.password,
      });
    },
  };
}
