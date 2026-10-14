import { TODAY } from "@/config/app";
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

export interface TasksSearch {
  business?: string;
  area?: string;
  status?: string;
  due?: string;
  q?: string;
  sort?: string;
  dir?: string;
  group?: string;
  view?: string;
  task?: string;
}

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

/** Loose URL validation: unknown values are dropped rather than replaced. */
export function validateTasksSearch(raw: Record<string, unknown>): TasksSearch {
  return {
    business: str(raw.business),
    area: str(raw.area),
    status: str(raw.status),
    due: str(raw.due),
    q: str(raw.q),
    sort: str(raw.sort),
    dir: str(raw.dir),
    group: str(raw.group),
    view: str(raw.view),
    task: str(raw.task),
  };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Week ends on Sunday; month ends on its last day. Approved tasks never match. */
export function matchesDue(task: TaskWithComputed, due: DueFilter, today: string = TODAY) {
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
}

export function filterTasks(tasks: TaskWithComputed[], s: TasksSearch, ctx: TableContext, today = TODAY) {
  const q = s.q?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (s.business && t.business_id !== s.business) return false;
    if (s.area && t.area !== s.area) return false;
    if (s.status && t.status !== s.status) return false;
    if (s.due && (DUE_FILTERS as readonly string[]).includes(s.due) && !matchesDue(t, s.due as DueFilter, today))
      return false;
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
