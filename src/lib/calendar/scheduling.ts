// Calendar v2 rules the screens and the mock share: who is connected, what a new meeting becomes (confirmed in
// Google or a proposal), what the success note says, and the meeting hours with their defaults.
import type {
  CalendarConnection, MeetingHours, PlatformRules, PortalMeeting, PortalMeetingParticipant, User, UserRole,
} from "@/lib/api/types";
import { DEFAULT_MEETING_HOURS } from "./slots";

export const MEETING_DURATIONS = [30, 45, 60] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];

/** Organizer included. Over this the API answers too_many_participants. */
export const MAX_MEETING_PARTICIPANTS = 8;

/** How far ahead the slot picker looks. */
export const AVAILABILITY_DAYS = 14;

/** The short list of US zones SM Global picks from in Reglas. */
export const MEETING_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
] as const;

/** A person in the dialog: the name for the screen, the id for the API. */
export interface SchedulingPerson {
  user_id: string;
  name: string;
}

/** The calendar is connected for writing. Older user rows only carry google_calendar_email. */
export const isCalendarConnected = (user: Pick<User, "calendar_connected" | "google_calendar_email"> | null | undefined): boolean =>
  !!user && (user.calendar_connected ?? !!user.google_calendar_email);

/** The API answered that Google stopped accepting the stored access: show "Volver a conectar". */
export const needsReconnect = (connection: CalendarConnection | null | undefined): boolean =>
  connection?.status === "reconnect_required";

export interface MeetingPlan {
  status: "confirmed" | "proposed";
  /** The event is created in the organizer's Google Calendar, invitations and Meet link included. */
  google_synced: boolean;
  /** Who still has to confirm a proposal. */
  pending_user_ids: string[];
}

/**
 * The fallback decision. Organizer connected: the event goes to Google with the Meet link; it is confirmed when every
 * guest is connected too, and stays proposed for the ones who are not. Organizer not connected: nothing reaches
 * Google and the meeting is a proposal every guest confirms.
 */
export function planMeeting(organizer: { user_id: string; connected: boolean }, participants: { user_id: string; connected: boolean }[]): MeetingPlan {
  const guests = participants.filter((p) => p.user_id !== organizer.user_id);
  if (!organizer.connected) return { status: "proposed", google_synced: false, pending_user_ids: guests.map((p) => p.user_id) };
  const pending = guests.filter((p) => !p.connected).map((p) => p.user_id);
  return { status: pending.length > 0 ? "proposed" : "confirmed", google_synced: true, pending_user_ids: pending };
}

export interface ScheduleOutcome {
  /** "Te llegó la invitación de Google con el link de Meet". */
  invitation_sent: boolean;
  /** "Queda propuesta hasta que X la confirme": guests without an answer while the meeting is proposed. */
  pending_names: string[];
}

/** What the success note says about the meeting just created. */
export function scheduleOutcome(meeting: PortalMeeting): ScheduleOutcome {
  const pending = meeting.status === "proposed"
    ? meeting.participants.filter((p) => p.user_id !== meeting.organizer.user_id && p.response === "needsAction").map((p) => p.name)
    : [];
  return { invitation_sent: meeting.google_synced, pending_names: pending };
}

/**
 * The answer shown next to a guest (key under calendar.response). On a confirmed meeting Google's needsAction only
 * means the invitation is waiting in their inbox: "Invitación enviada", not "Sin responder".
 */
export function responseLabelKey(response: PortalMeetingParticipant["response"], status: PortalMeeting["status"]): string {
  return response === "needsAction" && status === "confirmed" ? "invited" : response;
}

/** "Ana", "Ana y Luis", "Ana, Luis y Carla" (the connector comes from the locale). */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;
}

/** Why someone's free time was not read, as the screen words it. */
export type UnavailableKind = "not_connected" | "reconnect" | "other";
export function unavailableKind(reason: string): UnavailableKind {
  if (/reconnect|revoked|expired/i.test(reason)) return "reconnect";
  if (/not_connected|no_calendar|disconnected/i.test(reason)) return "not_connected";
  return "other";
}

/** The window the slot picker asks for: from now, AVAILABILITY_DAYS ahead. */
export function availabilityWindow(now: number, days: number = AVAILABILITY_DAYS): { from: string; to: string } {
  return { from: new Date(now).toISOString(), to: new Date(now + days * 86_400_000).toISOString() };
}

/** People added once, never the organizer, in the order they were added. */
export function addPerson(list: SchedulingPerson[], person: SchedulingPerson, organizerId: string | undefined): SchedulingPerson[] {
  if (person.user_id === organizerId || list.some((p) => p.user_id === person.user_id)) return list;
  return [...list, person];
}

/** The dialog can ask for slots: at least one guest, a topic, an allowed length and not over the limit. */
export function canSearchSlots(input: { participants: SchedulingPerson[]; topic: string; duration: number }): boolean {
  return input.participants.length > 0
    && input.participants.length + 1 <= MAX_MEETING_PARTICIPANTS
    && input.topic.trim().length > 0
    && (MEETING_DURATIONS as readonly number[]).includes(input.duration);
}

/** "Mover" and "Cancelar" are for the organizer and SM; everyone else gets "Avisar que no puedo". */
export function canManageMeeting(meeting: Pick<PortalMeeting, "organizer">, user: { id: string; role: UserRole } | null | undefined): boolean {
  if (!user) return false;
  return meeting.organizer.user_id === user.id || user.role === "sm_team" || user.role === "sm_global";
}

export const durationOf = (meeting: Pick<PortalMeeting, "starts_at" | "ends_at">) =>
  Math.round((Date.parse(meeting.ends_at) - Date.parse(meeting.starts_at)) / 60_000);

/** The rules' meeting hours, or the default when SM Global never set them. */
export const meetingHoursOf = (rules: Pick<PlatformRules, "meeting_hours"> | null | undefined): MeetingHours =>
  rules?.meeting_hours ?? DEFAULT_MEETING_HOURS;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** null when valid; otherwise the error code the mock and the form share. */
export function validateMeetingHours(hours: MeetingHours): "invalid_meeting_hours" | null {
  if (!HHMM.test(hours.start) || !HHMM.test(hours.end) || hours.start >= hours.end) return "invalid_meeting_hours";
  if (!hours.timezone.trim()) return "invalid_meeting_hours";
  return null;
}
