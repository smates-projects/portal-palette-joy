// UsersRepository over the real API (identity module: users.controller.ts).
import type { CalendarConsent, UsersRepository } from "../repositories";
import type { AccountEvent, AccountEventKind, ExternalCalendarEvent, User } from "../types";
import type { HttpClient } from "./client";

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

    /**
     * Connect: POST /me/calendar/connect answers Google's consent URL (OAuth). The email is not sent: Google says
     * which account it is. The caller redirects; the API's callback comes back to /perfil?calendar=....
     * Disconnect (null): DELETE /me/calendar answers the User without the calendar.
     */
    setGoogleCalendar: async (email) => {
      if (email !== null) return client.post<CalendarConsent>("/me/calendar/connect");
      const user = await client.delete<User>("/me/calendar");
      client.updateSessionUser(user);
      return user;
    },

    /** GET /me/calendar-events: the upcoming events of the connected calendar; empty when not connected. */
    listCalendarEvents: () => client.get<ExternalCalendarEvent[]>("/me/calendar-events"),

    /** PATCH /users/{id}/signing-entities (SM Global): may this SM person sign for SM Square. */
    setSigningEntities: (userId, input) =>
      client.patch<User>(`${userPath(userId)}/signing-entities`, { can_sign_sm_square: input.can_sign_sm_square }),

    setBookingUrl: async (url) => {
      const user = await client.patch<User>("/me/booking-url", { booking_url: url });
      client.updateSessionUser(user);
      return user;
    },
  };
}
