import type { ExternalCalendarEvent, LeadMeetingItem, Meeting, PortalMeeting, TaskWithComputed } from "@/lib/api/types";
import { addDays } from "./roadmap";

export const CAL_MODES = ["month", "week"] as const;
export type CalMode = (typeof CAL_MODES)[number];

const dow = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
export const mondayOf = (iso: string) => addDays(iso, -dow(iso));

/** Month view: 6 full weeks (Mon–Sun) covering the anchor's month. */
export function monthGrid(anchor: string): string[] {
  const start = mondayOf(`${anchor.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const weekDays = (anchor: string) => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i));

/** Move the anchor one month or one week. Month moves land on the 1st. */
export function shiftAnchor(anchor: string, mode: CalMode, dir: 1 | -1): string {
  if (mode === "week") return addDays(anchor, 7 * dir);
  const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

/** Local calendar date of a timestamp (the user's time zone). */
export const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The instants the visible grid covers, from the first day's local midnight to the day after the last one. */
export function visibleRange(days: string[]): { from: string; to: string } {
  const first = days[0] ?? "";
  const last = days.at(-1) ?? first;
  return { from: new Date(`${first}T00:00:00`).toISOString(), to: new Date(`${addDays(last, 1)}T00:00:00`).toISOString() };
}

export type CalItem =
  | { kind: "due"; day: string; task: TaskWithComputed }
  | { kind: "meeting"; day: string; at: string; meeting: Meeting; task: TaskWithComputed }
  | { kind: "google"; day: string; at: string; event: ExternalCalendarEvent }
  | { kind: "lead"; day: string; at: string; item: LeadMeetingItem }
  | { kind: "portal"; day: string; at: string; meeting: PortalMeeting };

/**
 * Due dates of the visible tasks, meetings only of those tasks, plus the user's Google events, the entry
 * meetings booked with the consultant (leads) and the portal meetings of calendar v2 (every kind, cancelled ones
 * included so the person sees what was dropped). Per day: timed items by hour first, then due dates by code.
 */
export function buildCalendarItems(
  tasks: TaskWithComputed[],
  meetings: Meeting[],
  events: ExternalCalendarEvent[],
  leadMeetings: LeadMeetingItem[] = [],
  portalMeetings: PortalMeeting[] = [],
): Map<string, CalItem[]> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const items: CalItem[] = [
    ...tasks.map((task) => ({ kind: "due" as const, day: task.due_date, task })),
    ...meetings.flatMap((meeting) => {
      const task = byId.get(meeting.task_id);
      return task && meeting.status !== "cancelled"
        ? [{ kind: "meeting" as const, day: localDay(meeting.starts_at), at: meeting.starts_at, meeting, task }]
        : [];
    }),
    ...events.map((event) => ({ kind: "google" as const, day: localDay(event.starts_at), at: event.starts_at, event })),
    ...leadMeetings.map((item) => ({ kind: "lead" as const, day: localDay(item.meeting.starts_at), at: item.meeting.starts_at, item })),
    ...portalMeetings.map((meeting) => ({ kind: "portal" as const, day: localDay(meeting.starts_at), at: meeting.starts_at, meeting })),
  ];
  const map = new Map<string, CalItem[]>();
  for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it]);
  for (const list of map.values())
    list.sort((a, b) => {
      if (a.kind === "due" && b.kind === "due") return a.task.code.localeCompare(b.task.code);
      if (a.kind === "due") return 1;
      if (b.kind === "due") return -1;
      return a.at.localeCompare(b.at);
    });
  return map;
}
