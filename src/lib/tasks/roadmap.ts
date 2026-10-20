import { todayIso } from "@/lib/clock";
import type { AreaCode, Business, TaskWithComputed } from "@/lib/api/types";
import { daysBetween } from "./table";

export const ZOOMS = ["week", "month", "program"] as const;
export type Zoom = (typeof ZOOMS)[number];

/** Pixels per day for each zoom. */
export const PX_PER_DAY: Record<Zoom, number> = { week: 44, month: 12, program: 5 };

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
};
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => {
  const d = new Date(`${firstOfMonth(iso)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Visible window around today.
 * week: 3 weeks starting the Monday before this week. month: 4 months starting last month.
 * program: earliest program start to the latest of program end (day 180) or task due date, by month.
 */
export function zoomRange(zoom: Zoom, businesses: Business[], tasks: TaskWithComputed[], today = todayIso()) {
  if (zoom === "week") {
    const start = addDays(mondayOf(today), -7);
    return { start, end: addDays(start, 20) };
  }
  if (zoom === "month") {
    const start = addMonths(today, -1);
    return { start, end: addDays(addMonths(start, 4), -1) };
  }
  const starts = [...businesses.map((b) => b.program_start_date), ...tasks.map((t) => t.start_date)];
  const ends = [...businesses.map((b) => programDay(b, 180)), ...tasks.map((t) => t.due_date)];
  const start = firstOfMonth(starts.length ? starts.sort()[0]! : today);
  const lastEnd = ends.length ? ends.sort().at(-1)! : today;
  return { start, end: addDays(addMonths(lastEnd, 1), -1) };
}

/** Calendar date of program day N (day 1 = program start). */
export const programDay = (b: Business, n: number) => addDays(b.program_start_date, n - 1);

export const MILESTONE_DAYS = [
  { key: "diagnosis_end", day: 15 },
  { key: "closing_start", day: 150 },
  { key: "program_end", day: 180 },
] as const;

export type RoadmapRow =
  | { kind: "business"; business: Business }
  | { kind: "area"; business_id: string; area: AreaCode; count: number }
  | { kind: "task"; task: TaskWithComputed };

/** Business → area → tasks by start date. Only businesses and areas that have visible tasks. */
export function buildRoadmapRows(tasks: TaskWithComputed[], businesses: Business[]): RoadmapRow[] {
  const rows: RoadmapRow[] = [];
  for (const b of businesses) {
    const mine = tasks.filter((t) => t.business_id === b.id);
    if (!mine.length) continue;
    rows.push({ kind: "business", business: b });
    const areas = [...new Set(mine.map((t) => t.area))].sort();
    for (const area of areas) {
      const items = mine
        .filter((t) => t.area === area)
        .sort((x, y) => x.start_date.localeCompare(y.start_date) || x.code.localeCompare(y.code));
      rows.push({ kind: "area", business_id: b.id, area, count: items.length });
      for (const task of items) rows.push({ kind: "task", task });
    }
  }
  return rows;
}

/** Bar geometry in px; the bar covers start day through due day inclusive. */
export function barGeometry(task: { start_date: string; due_date: string }, rangeStart: string, ppd: number) {
  const left = daysBetween(rangeStart, task.start_date) * ppd;
  const width = Math.max(ppd, (daysBetween(task.start_date, task.due_date) + 1) * ppd);
  return { left, width };
}
