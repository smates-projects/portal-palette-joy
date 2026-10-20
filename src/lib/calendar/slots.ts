// Free-slot arithmetic for calendar v2, shared by the mock (which computes availability the way the API does) and
// the scheduling dialog (which groups the slots by day). Pure and SSR-safe: only Intl, never at module load.
import type { MeetingHours, TimeSlot } from "@/lib/api/types";

/** Slots start every 30 minutes inside the meeting hours. */
export const SLOT_STEP_MINUTES = 30;

export const DEFAULT_MEETING_HOURS: MeetingHours = { start: "09:00", end: "18:00", timezone: "America/New_York" };

/** A busy period, in epoch milliseconds, end excluded. */
export interface BusyBlock {
  start: number;
  end: number;
}

const MINUTE = 60_000;

/** Minutes the zone is ahead of UTC at that instant (New York in October: -240). */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"));
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / MINUTE);
}

/** The instant of a wall-clock day and "HH:MM" in a time zone (daylight saving included). */
export function zonedTimeToInstant(day: string, time: string, timeZone: string): number {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - zoneOffsetMinutes(wall, timeZone) * MINUTE;
  const second = wall - zoneOffsetMinutes(first, timeZone) * MINUTE;
  return second;
}

/** "YYYY-MM-DD" of an instant in a time zone. */
export function dayInZone(iso: string | number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const overlaps = (start: number, end: number, busy: BusyBlock[]) => busy.some((b) => start < b.end && b.start < end);

/** True when [start, start + duration) sits inside the meeting hours of its day and touches no busy block. */
export function isSlotFree(startIso: string, durationMinutes: number, hours: MeetingHours, busy: BusyBlock[]): boolean {
  const start = Date.parse(startIso);
  const end = start + durationMinutes * MINUTE;
  const day = dayInZone(start, hours.timezone);
  const open = zonedTimeToInstant(day, hours.start, hours.timezone);
  const close = zonedTimeToInstant(day, hours.end, hours.timezone);
  return start >= open && end <= close && !overlaps(start, end, busy);
}

/**
 * Every slot of the window on the 30-minute grid, inside the meeting hours of each day, that ends inside the window,
 * starts after `now` and touches no busy block. Days run in the meeting hours' time zone.
 */
export function computeFreeSlots(input: {
  from: string;
  to: string;
  durationMinutes: number;
  hours: MeetingHours;
  busy: BusyBlock[];
  now?: number | undefined;
}): TimeSlot[] {
  const { hours, durationMinutes, busy } = input;
  const from = Math.max(Date.parse(input.from), input.now ?? -Infinity);
  const to = Date.parse(input.to);
  const slots: TimeSlot[] = [];
  const lastDay = dayInZone(to, hours.timezone);
  for (let day = dayInZone(from, hours.timezone); day <= lastDay; day = nextDay(day)) {
    const open = zonedTimeToInstant(day, hours.start, hours.timezone);
    const close = zonedTimeToInstant(day, hours.end, hours.timezone);
    for (let start = open; start + durationMinutes * MINUTE <= close; start += SLOT_STEP_MINUTES * MINUTE) {
      const end = start + durationMinutes * MINUTE;
      if (start < from || end > to || overlaps(start, end, busy)) continue;
      slots.push({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() });
    }
  }
  return slots;
}

export interface SlotDay {
  /** "YYYY-MM-DD" in the viewer's time zone. */
  day: string;
  slots: TimeSlot[];
}

/** Slots grouped by the viewer's day, days and times in order. Empty days are left out. */
export function groupSlotsByDay(slots: TimeSlot[], timeZone: string): SlotDay[] {
  const byDay = new Map<string, TimeSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const day = dayInZone(slot.starts_at, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, slots: list }));
}
