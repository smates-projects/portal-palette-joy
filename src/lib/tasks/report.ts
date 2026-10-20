import { todayIso } from "@/lib/clock";
import type { Business, TaskVersion, TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { daysBetween, VISIBLE_STATUSES } from "./table";

export interface FirmReport {
  total: number;
  accepted: number;
  /** Rounded % of approved over total. */
  progress_pct: number;
  pending: number;
  in_progress: number;
  waiting_approval: number;
  overdue: number;
  blocked: { task: TaskWithComputed; by: TaskWithComputed[] }[];
  by_client: { business: Business; total: number; counts: Record<VisibleTaskStatus, number> }[];
  /** Over approved tasks: days from last delivery to approval, and change rounds per task. null when none. */
  avg_days_to_approval: number | null;
  avg_change_rounds: number | null;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildFirmReport(
  tasks: TaskWithComputed[],
  versions: TaskVersion[],
  businesses: Business[],
  _today: string = todayIso(),
): FirmReport {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const total = tasks.length;
  const accepted = tasks.filter((t) => t.status === "accepted");
  const count = (s: string) => tasks.filter((t) => t.status === s).length;

  const days: number[] = [];
  const rounds: number[] = [];
  for (const t of accepted) {
    const vs = versions.filter((v) => v.task_id === t.id);
    rounds.push(vs.filter((v) => v.status === "changes_requested").length);
    const last = vs.map((v) => v.submitted_at).sort().at(-1);
    if (last && t.accepted_at) days.push(Math.max(0, daysBetween(last.slice(0, 10), t.accepted_at.slice(0, 10))));
  }


  return {
    total,
    accepted: accepted.length,
    progress_pct: total ? Math.round((accepted.length / total) * 100) : 0,
    pending: count("pending"),
    in_progress: count("in_progress"),
    waiting_approval: count("submitted"),
    overdue: tasks.filter((t) => t.is_overdue).length,
    blocked: tasks
      .filter((t) => t.is_blocked)
      .map((task) => ({
        task,
        by: task.depends_on_task_ids.map((id) => byId.get(id)).filter((d): d is TaskWithComputed => !!d && d.status !== "accepted"),
      })),
    by_client: businesses
      .map((business) => {
        const mine = tasks.filter((t) => t.business_id === business.id);
        const counts = Object.fromEntries(VISIBLE_STATUSES.map((s) => [s, mine.filter((t) => t.status === s).length])) as Record<VisibleTaskStatus, number>;
        return { business, total: mine.length, counts };
      })
      .filter((c) => c.total > 0),
    avg_days_to_approval: avg(days),
    avg_change_rounds: avg(rounds),
  };
}
