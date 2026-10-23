import type { TFunction } from "i18next";
import { todayIso } from "@/lib/clock";
import type { TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";

export const DUE_FILTERS = ["overdue", "today", "week", "month"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
export const SORT_KEYS = ["code", "name", "business", "area", "step", "due", "status"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const VIEWS = ["table", "board", "roadmap", "calendar"] as const;
export type TasksView = (typeof VIEWS)[number];
export const VISIBLE_STATUSES: VisibleTaskStatus[] = [
  "pending",
  "in_progress",
  "submitted",
  "changes_requested",
  "accepted",
];
const STEP_ORDER = ["survey", "design", "implement", "validate", "document"];

const SEARCH_KEYS = ["business", "area", "status", "due", "blocked", "q", "sort", "dir", "group", "view", "task", "firm", "sup", "stale", "attention", "meeting"] as const;
export type TasksSearch = { [K in (typeof SEARCH_KEYS)[number]]?: string | undefined };

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** Loose URL validation: unknown values are dropped rather than replaced. */
export function validateTasksSearch(raw: Record<string, unknown>): TasksSearch {
  const out: TasksSearch = {};
  for (const k of SEARCH_KEYS) {
    const v = str(raw[k]);
    if (v) out[k] = v;
  }
  return out;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Days past due: the API's overdue_days (its clock) when sent, otherwise counted here from due_date. */
export function overdueDays(task: Pick<TaskWithComputed, "due_date" | "overdue_days">, today: string = todayIso()) {
  return task.overdue_days ?? daysBetween(task.due_date, today);
}

/** "Vencida hace X días", or "Vence hoy" when the count is 0 or less (never "Vencida hace 0 días"). */
export function overdueLabel(t: TFunction, days: number) {
  return days <= 0 ? t("home.due_today") : t("tasks.overdue_days", { count: days });
}

/** Week ends on Sunday; month ends on its last day. Approved tasks never match. */
export function matchesDue(task: TaskWithComputed, due: DueFilter, today: string = todayIso()) {
  if (due === "overdue") return task.is_overdue;
  if (task.status === "accepted") return false;
  if (due === "today") return task.due_date === today;
  if (due === "week") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    return task.due_date >= today && task.due_date <= addDays(today, (7 - dow) % 7);
  }
  return task.due_date >= today && task.due_date.slice(0, 7) === today.slice(0, 7);
}

export interface TableContext {
  businessName: (id: string) => string;
  statusLabel: (s: string) => string;
  /** SM: only tasks this person supervises (unset = no supervisor filter). */
  supervisorId?: string | undefined;
  /** Every visible task, to know if a dependency is overdue (attention filter). */
  all?: TaskWithComputed[] | undefined;
}

/** SM rule: a deliverable is stale when it waits for the owner's approval more than 3 days. */
export const STALE_DAYS = 3;
export function isStaleSubmission(t: TaskWithComputed, today: string = todayIso()) {
  return t.status === "submitted" && !!t.last_submitted_at && daysBetween(t.last_submitted_at.slice(0, 10), today) > STALE_DAYS;
}

/** Dependencies of a blocked task that are themselves overdue ("bloqueo largo"). */
export function overdueBlockers(t: TaskWithComputed, all: TaskWithComputed[]) {
  if (!t.is_blocked) return [];
  return t.depends_on_task_ids.map((id) => all.find((x) => x.id === id)).filter((d): d is TaskWithComputed => !!d && d.is_overdue);
}

export type AttentionReason = "overdue" | "stale" | "long_block";
/** "Necesita atención" (SM): overdue, deliverable stale, or blocked by an overdue task. First match wins. */
export function attentionReason(t: TaskWithComputed, all: TaskWithComputed[], today: string = todayIso()): AttentionReason | null {
  if (t.is_overdue) return "overdue";
  if (isStaleSubmission(t, today)) return "stale";
  if (overdueBlockers(t, all).length) return "long_block";
  return null;
}

export function filterTasks(tasks: TaskWithComputed[], s: TasksSearch, ctx: TableContext, today = todayIso()) {
  const q = s.q?.trim().toLowerCase();
  return tasks.filter((t) => {
    // Cancelled tasks only show when filtering by that status.
    if (t.status === "cancelled" && s.status !== "cancelled") return false;
    if (ctx.supervisorId && t.supervisor_user_id !== ctx.supervisorId) return false;
    if (s.firm && t.organization_id !== s.firm) return false;
    if (s.stale === "1" && !isStaleSubmission(t, today)) return false;
    if (s.attention === "1" && !attentionReason(t, ctx.all ?? tasks, today)) return false;
    if (s.business && t.business_id !== s.business) return false;
    if (s.area && t.area !== s.area) return false;
    if (s.status && t.status !== s.status) return false;
    if (s.due && (DUE_FILTERS as readonly string[]).includes(s.due) && !matchesDue(t, s.due as DueFilter, today))
      return false;
    if (s.blocked === "1" && !t.is_blocked) return false;
    if (q && !`${t.code} ${t.name} ${ctx.businessName(t.business_id)}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function sortTasks(tasks: TaskWithComputed[], s: TasksSearch, ctx: TableContext) {
  const key = (SORT_KEYS as readonly string[]).includes(s.sort ?? "") ? (s.sort as SortKey) : null;
  const dir = s.dir === "desc" ? -1 : 1;
  const byDefault = (a: TaskWithComputed, b: TaskWithComputed) =>
    Number(b.is_overdue) - Number(a.is_overdue) || a.due_date.localeCompare(b.due_date) || a.code.localeCompare(b.code);
  if (!key) return [...tasks].sort(byDefault);
  const val = (t: TaskWithComputed): string | number => {
    switch (key) {
      case "business": return ctx.businessName(t.business_id);
      case "step": return STEP_ORDER.indexOf(t.step);
      case "due": return t.due_date;
      case "status": return VISIBLE_STATUSES.indexOf(t.status as VisibleTaskStatus);
      default: return t[key];
    }
  };
  return [...tasks].sort((a, b) => {
    const va = val(a), vb = val(b);
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
    return c * dir || byDefault(a, b);
  });
}
