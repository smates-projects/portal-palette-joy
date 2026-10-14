import { TODAY } from "@/config/app";
import type { Business, Organization, TaskVersion, TaskWithComputed } from "@/lib/api/types";
import { AREAS, areaHealth, type Health } from "./owner";
import { attentionReason, daysBetween, isStaleSubmission, type AttentionReason } from "./table";

export interface SmSummary {
  due_today: number;
  overdue: number;
  stale: number;
  blocked: number;
}

/** Inicio SM cards. Approved tasks never count as due. */
export function buildSmSummary(tasks: TaskWithComputed[], today = TODAY): SmSummary {
  return {
    due_today: tasks.filter((t) => t.status !== "accepted" && t.due_date === today).length,
    overdue: tasks.filter((t) => t.is_overdue).length,
    stale: tasks.filter((t) => isStaleSubmission(t, today)).length,
    blocked: tasks.filter((t) => t.is_blocked && t.status !== "accepted").length,
  };
}

export interface AttentionItem {
  task: TaskWithComputed;
  reason: AttentionReason;
  /** Days late (overdue), days waiting (stale), or the overdue blockers (long_block). */
  days: number;
  blockers: TaskWithComputed[];
}

const REASON_ORDER: Record<AttentionReason, number> = { overdue: 0, stale: 1, long_block: 2 };

/** "Necesita atención": overdue first (most late first), then stale deliverables, then long blocks. */
export function buildAttention(tasks: TaskWithComputed[], all: TaskWithComputed[], today = TODAY): AttentionItem[] {
  return tasks
    .flatMap((task) => {
      const reason = attentionReason(task, all, today);
      if (!reason) return [];
      const blockers =
        reason === "long_block"
          ? task.depends_on_task_ids.map((id) => all.find((x) => x.id === id)).filter((d): d is TaskWithComputed => !!d && d.is_overdue)
          : [];
      const days =
        reason === "overdue"
          ? daysBetween(task.due_date, today)
          : reason === "stale"
            ? daysBetween((task.last_submitted_at ?? today).slice(0, 10), today)
            : Math.max(...blockers.map((b) => daysBetween(b.due_date, today)));
      return [{ task, reason, days, blockers }];
    })
    .sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason] || b.days - a.days || a.task.code.localeCompare(b.task.code));
}

export interface NetworkCounters {
  businesses: number;
  open: number;
  overdue: number;
  waiting_approval: number;
  blocked: number;
}

export function buildNetworkCounters(tasks: TaskWithComputed[], businesses: Business[]): NetworkCounters {
  return {
    businesses: businesses.length,
    open: tasks.filter((t) => t.status !== "accepted").length,
    overdue: tasks.filter((t) => t.is_overdue).length,
    waiting_approval: tasks.filter((t) => t.status === "submitted").length,
    blocked: tasks.filter((t) => t.is_blocked && t.status !== "accepted").length,
  };
}

export interface MatrixRow {
  business: Business;
  cells: { area: (typeof AREAS)[number]; health: Health; open: number; overdue: number }[];
  /** Worst of its areas. */
  health: Health;
}

const SEVERITY: Record<Health, number> = { grey: 0, green: 1, amber: 2, red: 3 };

/** Business × area health, using the one area-health rule. */
export function buildNetworkMatrix(tasks: TaskWithComputed[], versions: TaskVersion[], businesses: Business[], today = TODAY, amberDays?: number): MatrixRow[] {
  return businesses.map((business) => {
    const mine = tasks.filter((t) => t.business_id === business.id);
    const cells = AREAS.map((area) => {
      const inArea = mine.filter((t) => t.area === area);
      return {
        area,
        health: areaHealth(inArea, versions, today, amberDays),
        open: inArea.filter((t) => t.status !== "accepted").length,
        overdue: inArea.filter((t) => t.is_overdue).length,
      };
    });
    const health = cells.reduce<Health>((w, c) => (SEVERITY[c.health] > SEVERITY[w] ? c.health : w), "grey");
    return { business, cells, health };
  });
}

export interface FirmLoad {
  firm: Organization;
  open: number;
  overdue: number;
  /** Average days late over its overdue tasks; null if none overdue. */
  avg_days_late: number | null;
  /** Average days from last delivery to approval over approved tasks; null if none. */
  avg_days_to_approval: number | null;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** "Carga por firma": firms with tasks in scope, most overdue first. */
export function buildFirmLoad(tasks: TaskWithComputed[], versions: TaskVersion[], orgs: Organization[], today = TODAY): FirmLoad[] {
  return orgs
    .map((firm) => {
      const mine = tasks.filter((t) => t.organization_id === firm.id);
      const overdue = mine.filter((t) => t.is_overdue);
      const approval: number[] = [];
      for (const t of mine) {
        if (t.status !== "accepted" || !t.accepted_at) continue;
        const last = versions.filter((v) => v.task_id === t.id).map((v) => v.submitted_at).sort().at(-1);
        if (last) approval.push(Math.max(0, daysBetween(last.slice(0, 10), t.accepted_at.slice(0, 10))));
      }
      return {
        firm,
        total: mine.length,
        open: mine.filter((t) => t.status !== "accepted").length,
        overdue: overdue.length,
        avg_days_late: avg(overdue.map((t) => daysBetween(t.due_date, today))),
        avg_days_to_approval: avg(approval),
      };
    })
    .filter((f) => f.total > 0)
    .map(({ total: _total, ...rest }) => rest)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.firm.name.localeCompare(b.firm.name));
}
