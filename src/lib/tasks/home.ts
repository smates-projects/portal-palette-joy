import { todayIso } from "@/lib/clock";
import type { TaskWithComputed } from "@/lib/api/types";
import { matchesDue, type TasksSearch } from "./table";

export const SUMMARY_KEYS = ["overdue", "today", "week", "changes", "waiting"] as const;
export type SummaryKey = (typeof SUMMARY_KEYS)[number];

/** Each card links to Mis tareas with exactly the filter that reproduces its count. */
export const SUMMARY_FILTER: Record<SummaryKey, TasksSearch> = {
  overdue: { due: "overdue" },
  today: { due: "today" },
  week: { due: "week" },
  changes: { status: "changes_requested" },
  waiting: { status: "submitted" },
};

export function matchesSummary(t: TaskWithComputed, key: SummaryKey, today = todayIso()) {
  if (key === "changes") return t.status === "changes_requested";
  if (key === "waiting") return t.status === "submitted";
  return matchesDue(t, key, today);
}

export interface SummaryCard {
  key: SummaryKey;
  count: number;
  /** Per business, most tasks first. */
  byBusiness: { business_id: string; count: number }[];
}

export function buildSummary(tasks: TaskWithComputed[], today = todayIso()): SummaryCard[] {
  return SUMMARY_KEYS.map((key) => {
    const hits = tasks.filter((t) => matchesSummary(t, key, today));
    const counts = new Map<string, number>();
    for (const t of hits) counts.set(t.business_id, (counts.get(t.business_id) ?? 0) + 1);
    const byBusiness = [...counts].map(([business_id, count]) => ({ business_id, count })).sort((a, b) => b.count - a.count);
    return { key, count: hits.length, byBusiness };
  });
}

/** Actionable for the firm: excludes delivered (waiting owner) and approved tasks. */
const actionable = (t: TaskWithComputed) => t.status !== "submitted" && t.status !== "accepted";

export type TodayReason = "overdue" | "today" | "changes" | "week";

/** Urgency order: overdue, due today, changes requested, due this week. Each task appears once. */
export function buildToday(tasks: TaskWithComputed[], today = todayIso()) {
  const seen = new Set<string>();
  const out: { task: TaskWithComputed; reason: TodayReason }[] = [];
  const tests: [TodayReason, (t: TaskWithComputed) => boolean][] = [
    ["overdue", (t) => t.is_overdue],
    ["today", (t) => matchesDue(t, "today", today)],
    ["changes", (t) => t.status === "changes_requested"],
    ["week", (t) => matchesDue(t, "week", today)],
  ];
  for (const [reason, test] of tests) {
    tasks
      .filter((t) => actionable(t) && !seen.has(t.id) && test(t))
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.code.localeCompare(b.code))
      .forEach((task) => {
        seen.add(task.id);
        out.push({ task, reason });
      });
  }
  return out;
}

/** Next actionable task due after today (for the empty state). */
export function nextDue(tasks: TaskWithComputed[], today = todayIso()) {
  return (
    tasks
      .filter((t) => actionable(t) && t.due_date > today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.code.localeCompare(b.code))[0] ?? null
  );
}

export interface BusinessProgress {
  business_id: string;
  total: number;
  accepted: number;
  submitted: number;
  in_progress: number;
  /** Share of the 180 days already elapsed (0-1). */
  expected: number;
  /** Approved share minus expected share, in percentage points. */
  gap: number;
}

/** Progress of the firm's own tasks per business, compared with time elapsed in the program. */
export function buildProgress(tasks: TaskWithComputed[], programDay: (businessId: string) => number, length = 180): BusinessProgress[] {
  const ids = [...new Set(tasks.map((t) => t.business_id))];
  return ids.map((id) => {
    const mine = tasks.filter((t) => t.business_id === id);
    const accepted = mine.filter((t) => t.status === "accepted").length;
    const expected = Math.min(1, Math.max(0, programDay(id) / length));
    return {
      business_id: id,
      total: mine.length,
      accepted,
      submitted: mine.filter((t) => t.status === "submitted").length,
      in_progress: mine.filter((t) => t.status === "in_progress" || t.status === "changes_requested").length,
      expected,
      gap: Math.round(((mine.length ? accepted / mine.length : 0) - expected) * 100),
    };
  });
}
