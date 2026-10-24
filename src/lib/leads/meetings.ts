// One place that answers "which is the initial meeting and which the expansion meeting of this lead, and what are their
// ids", whatever shape they arrived in:
// - the mock and the front's contract: `meeting` (initial) and `expansion_meeting`;
// - the API: `meeting` is the latest meeting of ANY kind, `expansion_meeting` the latest expansion one, and the full
//   list with ids comes in `meetings[]` (GET /leads/{id}) or `intake.summary.entry.meetings[]` (the owner's view, with
//   `duration_min` instead of `duration_minutes`).
// Every screen and the HTTP adapter read meetings through entryMeetings(), so the outcome always gets an id when one
// exists anywhere in the answer.
import type { LeadMeeting, MeetingKind } from "@/lib/api/types";

/** A meeting as any of the sources sends it (only the start is always there). */
export interface RawMeeting {
  id?: string | null | undefined;
  kind?: MeetingKind | null | undefined;
  starts_at: string;
  duration_minutes?: number | null | undefined;
  duration_min?: number | null | undefined;
  meet_url?: string | null | undefined;
  consultant_user_id?: string | null | undefined;
  booked_at?: string | null | undefined;
  notes_at?: string | null | undefined;
  outcome?: LeadMeeting["outcome"];
  outcome_prompted_at?: string | null | undefined;
}

export interface MeetingSources {
  meeting?: RawMeeting | null | undefined;
  expansion_meeting?: RawMeeting | null | undefined;
  meetings?: readonly RawMeeting[] | null | undefined;
}

export interface EntryMeetings {
  initial: LeadMeeting | null;
  expansion: LeadMeeting | null;
}

const kindOf = (m: Pick<RawMeeting, "kind">): MeetingKind => m.kind ?? "initial";

const sameInstant = (a: string, b: string) => a === b || Date.parse(a) === Date.parse(b);

/** Newest first: by booking, then by start. */
const recency = (m: RawMeeting) => Date.parse(m.booked_at ?? m.starts_at) || 0;

/**
 * The newest meeting of a list: by booking date when every meeting has one, else by the list's order (the owner's
 * entry lists the bookings oldest first). Never by the start: a meeting booked again after a reschedule may start
 * before the one it replaced, and the owner's "Tu ingreso" kept showing the old one. The API's latestMeetingOf
 * follows the same rule.
 */
function newestOf(list: readonly RawMeeting[]): RawMeeting | undefined {
  const booked = list.every((m) => !!m.booked_at && !Number.isNaN(Date.parse(m.booked_at)));
  const ranked = list.map((meeting, index) => ({ meeting, index }));
  ranked.sort((a, b) => (booked ? Date.parse(b.meeting.booked_at ?? "") - Date.parse(a.meeting.booked_at ?? "") : 0) || b.index - a.index);
  return ranked[0]?.meeting;
}

/** The same meeting: by id when both have one, otherwise by its start. */
const sameMeeting = (a: RawMeeting, b: RawMeeting) => (a.id && b.id ? a.id === b.id : sameInstant(a.starts_at, b.starts_at));

/** The full LeadMeeting the screens use; unknown fields get neutral values (duration 0 = unknown). */
export function toLeadMeeting(raw: RawMeeting): LeadMeeting {
  return {
    ...(raw.id ? { id: raw.id } : {}),
    kind: kindOf(raw),
    starts_at: raw.starts_at,
    duration_minutes: raw.duration_minutes ?? raw.duration_min ?? 0,
    meet_url: raw.meet_url ?? "",
    consultant_user_id: raw.consultant_user_id ?? "",
    booked_at: raw.booked_at ?? raw.starts_at,
    notes_at: raw.notes_at ?? null,
    outcome: raw.outcome ?? null,
    outcome_prompted_at: raw.outcome_prompted_at ?? null,
  };
}

/** Fields of `over` that carry a value win over `base`. */
function merge(base: RawMeeting | undefined, over: RawMeeting): RawMeeting {
  const out: RawMeeting = { ...(base ?? {}), starts_at: over.starts_at };
  for (const [key, value] of Object.entries(over))
    if (value !== undefined && value !== null) Object.assign(out, { [key]: value });
  return out;
}

function pick(src: MeetingSources, kind: MeetingKind): LeadMeeting | null {
  const list = (src.meetings ?? []).filter((m) => kindOf(m) === kind);
  const explicit =
    kind === "expansion"
      ? (src.expansion_meeting ??
        (src.meeting && kindOf(src.meeting) === "expansion" ? src.meeting : null))
      : src.meeting && kindOf(src.meeting) === "initial"
        ? src.meeting
        : null;
  const newest = newestOf(list);
  // After a reschedule the answer may still carry the old meeting as `meeting`: a newer booking in the list wins, so
  // "Tu reunión" shows the new date instead of "Reunión hecha el <old date>". When the list holds the explicit one,
  // the list's ranking decides; otherwise its booking (or start) is compared with the newest of the list.
  const explicitInList = explicit ? list.find((m) => sameMeeting(m, explicit)) : undefined;
  const newerInList =
    !!explicit && !!newest &&
    (explicitInList ? explicitInList !== newest : !sameInstant(newest.starts_at, explicit.starts_at) && recency(newest) > recency(explicit));
  const base = newerInList ? newest : explicit ?? newest;
  if (!base) return null;
  // The same meeting in the list: by id when the base has one, otherwise by its start (that is how the id is found).
  const twin = base.id
    ? list.find((m) => m.id === base.id)
    : list.find((m) => sameInstant(m.starts_at, base.starts_at));
  return toLeadMeeting({ ...merge(twin, base), kind });
}

/** The initial and the expansion meeting of a lead (or of the owner's entry), each with its id when known. */
export const entryMeetings = (src: MeetingSources | null | undefined): EntryMeetings => ({
  initial: src ? pick(src, "initial") : null,
  expansion: src ? pick(src, "expansion") : null,
});

/** The id the outcome endpoint needs, or null when the answer did not carry it. */
export const meetingIdOf = (m: Pick<LeadMeeting, "id"> | null | undefined): string | null =>
  m?.id ?? null;
