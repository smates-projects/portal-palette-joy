// UsersRepository over the real API (identity module: users.controller.ts).
import type { UsersRepository } from "../repositories";
import type { AccountEvent, AccountEventKind, User } from "../types";
import { ApiError, type HttpClient } from "./client";

/** The API writes more kinds (invitation_resent, impersonation_*, password_changed, totp_enabled); the front knows these. */
const FRONT_ACCOUNT_EVENT_KINDS: ReadonlySet<string> = new Set<AccountEventKind>([
  "invited",
  "accepted",
  "deactivated",
  "reactivated",
  "admin_granted",
  "admin_revoked",
  "made_owner",
]);

/** An account event as the API sends it: same fields, a wider `kind`. */
interface AccountEventResponse extends Omit<AccountEvent, "kind"> {
  kind: string;
}

const toFrontEvents = (events: AccountEventResponse[]): AccountEvent[] =>
  events.filter((event): event is AccountEvent => FRONT_ACCOUNT_EVENT_KINDS.has(event.kind));

const userPath = (id: string) => `/users/${encodeURIComponent(id)}`;

export function createHttpUsersRepository(client: HttpClient): UsersRepository {
  return {
    list: (opts) =>
      client.get<User[]>("/users", {
        query: { include_inactive: opts?.include_inactive ? "true" : undefined },
      }),

    invite: (input) =>
      client.post<User>(
        "/users/invite",
        {
          full_name: input.full_name,
          email: input.email,
          role: input.role,
          organization_id: input.organization_id,
          business_id: input.business_id,
          title: input.title,
          is_admin: input.is_admin,
        },
        { idempotent: true },
      ),

    /**
     * Gap: the mock's "simular aceptación" (demo only) has no API counterpart; in production the person accepts
     * from the email link (POST /auth/invitations/accept). Mapped to the closest real action, "Reenviar invitación"
     * (POST /users/{id}/resend-invitation): it answers the same User, still "invited".
     */
    simulateAcceptance: (userId) => client.post<User>(`${userPath(userId)}/resend-invitation`),

    deactivate: (userId, reason) => client.post<User>(`${userPath(userId)}/deactivate`, { reason }),

    reactivate: (userId) => client.post<User>(`${userPath(userId)}/reactivate`),

    setAdmin: (userId, isAdmin) =>
      client.patch<User>(`${userPath(userId)}/admin`, { is_admin: isAdmin }),

    listAccountEvents: async (userId) =>
      toFrontEvents(
        await client.get<AccountEventResponse[]>(
          userId ? `${userPath(userId)}/events` : "/account-events",
        ),
      ),

    /** Gap: Google Calendar is phase 5 (OAuth); the API has no endpoint yet. Rejects without calling. */
    setGoogleCalendar: async () => {
      throw new ApiError({
        code: "not_implemented",
        status: 501,
        detail: "Google Calendar is not available in the API yet.",
      });
    },

    /** Gap: no calendar endpoint yet (phase 5). Answers as "not connected": an empty list. */
    listCalendarEvents: async () => [],

    setBookingUrl: async (url) => {
      const user = await client.patch<User>("/me/booking-url", { booking_url: url });
      client.updateSessionUser(user);
      return user;
    },
  };
}
