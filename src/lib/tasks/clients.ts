import { TODAY } from "@/config/app";
import type { TaskWithComputed } from "@/lib/api/types";

export type StuckLine =
  | { kind: "blocked"; code: string; by: string; task_id: string }
  | { kind: "waiting_owner"; count: number; task_id: string }
  | { kind: "changes"; code: string; task_id: string }
  | { kind: "none" };

export interface ClientSummary {
  business_id: string;
  open: number;
  overdue: number;
  accepted: number;
  next: TaskWithComputed | null;
  stuck: StuckLine;
}

/** Per-business figures for the firm's own tasks. "Open" = everything not approved. */
export function buildClientSummary(businessId: string, tasks: TaskWithComputed[], today = TODAY): ClientSummary {
  const mine = tasks.filter((t) => t.business_id === businessId);
  const open = mine.filter((t) => t.status !== "accepted");
  const next =
    open.filter((t) => t.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.code.localeCompare(b.code))[0] ?? null;

  // What is stuck, most serious first: a dependency, then the owner, then requested changes.
  let stuck: StuckLine = { kind: "none" };
  const blocked = open
    .filter((t) => t.is_blocked && (t.status === "pending" || t.status === "in_progress"))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const submitted = open.filter((t) => t.status === "submitted").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const waiting = submitted.length;
  const changes = open.find((t) => t.status === "changes_requested");
  if (blocked) {
    const dep = tasks.find((t) => blocked.depends_on_task_ids.includes(t.id) && t.status !== "accepted");
    stuck = { kind: "blocked", code: blocked.code, by: dep?.code ?? "", task_id: blocked.id };
  } else if (waiting) stuck = { kind: "waiting_owner", count: waiting, task_id: submitted[0]!.id };
  else if (changes) stuck = { kind: "changes", code: changes.code, task_id: changes.id };

  return {
    business_id: businessId,
    open: open.length,
    overdue: open.filter((t) => t.is_overdue).length,
    accepted: mine.length - open.length,
    next,
    stuck,
  };
}
