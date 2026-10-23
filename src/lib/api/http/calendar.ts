// CalendarRepository over the real API (calendar v2). Notes:
// - Every meeting the API answers carries its row `version`; the adapter keeps it as the ETag of /meetings/{id}
//   (also from the list), so "Mover" (PATCH) and "Cancelar" (DELETE) send If-Match without an extra read. When it is
//   not known yet the meeting is read first. A stale one answers precondition_failed.
// - POST /meetings goes with an Idempotency-Key: the one automatic retry of a network failure never books twice.
import type { CalendarConsent, CalendarRepository } from "../repositories";
import type { Availability, CalendarConnection, PortalMeeting, User } from "../types";
import { getOrNull, type HttpClient } from "./client";

const meetingPath = (id: string) => `/meetings/${encodeURIComponent(id)}`;
const NOT_CONNECTED: CalendarConnection = { connected: false, email: null, scope: null, status: "not_connected" };

export function createHttpCalendarRepository(client: HttpClient): CalendarRepository {
  /** Keeps the meeting's version as the ETag of /meetings/{id}. */
  const remember = (meeting: PortalMeeting): PortalMeeting => {
    client.etags.set(meetingPath(meeting.id), `"${meeting.version}"`);
    return meeting;
  };

  const ensureEtag = async (id: string) => {
    if (!client.etags.has(meetingPath(id))) await client.get<PortalMeeting>(meetingPath(id));
  };

  return {
    getConnection: () => client.get<CalendarConnection>("/me/calendar"),

    /** The consent URL of Google; the API's callback comes back to /perfil?calendar=connected|denied|error. */
    connect: () => client.post<CalendarConsent>("/me/calendar/connect"),

    /** DELETE /me/calendar answers the User without the calendar: the session user follows. */
    disconnect: async () => {
      const user = await client.delete<User | undefined>("/me/calendar");
      if (user) client.updateSessionUser(user);
      return NOT_CONNECTED;
    },

    getUserStatus: (userId) =>
      client.get<CalendarConnection>(`/users/${encodeURIComponent(userId)}/calendar-status`),

    availability: (input) =>
      client.post<Availability>("/calendar/availability", {
        participant_user_ids: input.participant_user_ids,
        from: input.from,
        to: input.to,
        duration_minutes: input.duration_minutes,
      }),

    schedule: async (input) =>
      remember(
        await client.post<PortalMeeting>(
          "/meetings",
          {
            kind: input.kind,
            ...(input.task_id ? { task_id: input.task_id } : {}),
            ...(input.business_id ? { business_id: input.business_id } : {}),
            ...(input.lead_id ? { lead_id: input.lead_id } : {}),
            participant_user_ids: input.participant_user_ids,
            ...(input.external_emails?.length ? { external_emails: input.external_emails } : {}),
            starts_at: input.starts_at,
            duration_minutes: input.duration_minutes,
            topic: input.topic,
            ...(input.note ? { note: input.note } : {}),
          },
          { idempotent: true },
        ),
      ),

    reschedule: async (id, input) => {
      await ensureEtag(id);
      return remember(await client.patch<PortalMeeting>(meetingPath(id), input));
    },

    cancel: async (id, reason) => {
      await ensureEtag(id);
      const trimmed = reason?.trim();
      await client.delete<void>(meetingPath(id), trimmed ? { body: { reason: trimmed } } : undefined);
      client.etags.delete(meetingPath(id));
    },

    listMyMeetings: async (from, to) =>
      (await client.get<PortalMeeting[]>("/me/meetings", { query: { from, to } })).map(remember),

    getMeeting: async (id) => {
      const meeting = await getOrNull<PortalMeeting>(client, meetingPath(id));
      return meeting ? remember(meeting) : null;
    },
  };
}
