// Calendar v2 rules the screens and the mock share: who is connected, what a new meeting becomes (confirmed in
// Google or a proposal), what the success note says, and the meeting hours with their defaults.
import type {
  CalendarConnection, MeetingHours, PlatformLimits, PlatformRules, PortalMeeting, PortalMeetingParticipant, User, UserRole,
} from "@/lib/api/types";
import { DEFAULT_MEETING_HOURS } from "./slots";

// Demo values of the limits (the mock's): the screens read rules.limits (meeting_durations,
// max_meeting_participants, availability_days), which the API fixes.
export const MEETING_DURATIONS = [30, 45, 60] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];

/** Organizer included. Over this the API answers too_many_participants (the API's limit is 10). */
export const MAX_MEETING_PARTICIPANTS = 10;

/** How far ahead the slot picker looks. */
export const AVAILABILITY_DAYS = 14;

/** The scheduling limits a screen uses: the API's (rules.limits), the demo's while they are absent. */
export const schedulingLimits = (limits: Partial<Pick<PlatformLimits, "meeting_durations" | "max_meeting_participants" | "availability_days">> | null | undefined) => ({
  durations: limits?.meeting_durations ?? [...MEETING_DURATIONS],
  maxParticipants: limits?.max_meeting_participants ?? MAX_MEETING_PARTICIPANTS,
  availabilityDays: limits?.availability_days ?? AVAILABILITY_DAYS,
});

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
 * The API's decision (POST /meetings). Organizer connected: the event goes to their Google Calendar with the Meet link
 * and Google invites every guest by email, connected or not: confirmed, nobody to wait for. Organizer not connected:
 * nothing reaches Google and the meeting is a proposal every guest confirms.
 */
export function planMeeting(organizer: { user_id: string; connected: boolean }, participants: { user_id: string; connected: boolean }[]): MeetingPlan {
  const guests = participants.filter((p) => p.user_id !== organizer.user_id);
  if (!organizer.connected) return { status: "proposed", google_synced: false, pending_user_ids: guests.map((p) => p.user_id) };
  return { status: "confirmed", google_synced: true, pending_user_ids: [] };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The API's longest email (POST /meetings external_emails). */
const EMAIL_MAX = 254;

export type ExternalEmailError = "invalid_email" | "duplicate_email" | "own_email";

/**
 * Adds one typed address to "Invitar por correo": trimmed, lowercased, each once, never the organizer's. Answers the
 * new list, or the reason it was not added (the field keeps the text so the person can fix it).
 */
export function addExternalEmail(
  list: readonly string[],
  raw: string,
  organizerEmail: string | null | undefined,
): { list: string[]; error: ExternalEmailError | null } {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return { list: [...list], error: "invalid_email" };
  if (organizerEmail && email === organizerEmail.trim().toLowerCase()) return { list: [...list], error: "own_email" };
  if (list.includes(email)) return { list: [...list], error: "duplicate_email" };
  return { list: [...list, email], error: null };
}

/** Removes one address of "Invitar por correo". */
export const removeExternalEmail = (list: readonly string[], email: string): string[] => list.filter((e) => e !== email);

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

/**
 * The dialog can ask for slots: at least one guest (a person or an email), a topic, an allowed length and not over the
 * limit (people and emails count together, the organizer included).
 */
export function canSearchSlots(
  input: { participants: SchedulingPerson[]; topic: string; duration: number; externalEmails?: readonly string[] | undefined },
  limits: { durations: readonly number[]; maxParticipants: number } = { durations: MEETING_DURATIONS, maxParticipants: MAX_MEETING_PARTICIPANTS },
): boolean {
  const guests = input.participants.length + (input.externalEmails?.length ?? 0);
  return guests > 0
    && guests + 1 <= limits.maxParticipants
    && input.topic.trim().length > 0
    && limits.durations.includes(input.duration);
}

/**
 * Who the slot picker could not read, as the dialog words it. With the organizer's calendar, those people still get
 * Google's invitation by email (their free time is just unknown); without it, the meeting goes as a proposal.
 */
export function unknownAvailabilityKey(organizerConnected: boolean): "calendar.availability_unknown" | "calendar.guest_proposal" {
  return organizerConnected ? "calendar.availability_unknown" : "calendar.guest_proposal";
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
