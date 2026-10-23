import { todayIso } from "@/lib/clock";
import type { Task, TaskStatus, TaskWithComputed, UserRole } from "./types";

/** Blocked = depends on at least one task not yet accepted. Not a status. */
export function isBlocked(task: Task, all: Task[]): boolean {
  return task.depends_on_task_ids.some((id) => {
    const dep = all.find((t) => t.id === id);
    return !dep || dep.status !== "accepted";
  });
}

/** Overdue = due date passed and not accepted. Not a status. */
export function isOverdue(task: Task, today: string = todayIso()): boolean {
  return task.status !== "accepted" && task.status !== "cancelled" && task.due_date < today;
}

/** Demo (the API sends the same): every field the screens read about a task, computed from the program. */
export function withComputed(task: Task, all: Task[], today: string = todayIso()): TaskWithComputed {
  const blockers = task.depends_on_task_ids.flatMap((id) => {
    const dep = all.find((t) => t.id === id);
    return dep && dep.status !== "accepted" ? [dep] : [];
  });
  return {
    ...task,
    is_blocked: isBlocked(task, all),
    is_overdue: isOverdue(task, today),
    blocked_by_task_ids: blockers.map((d) => d.id),
    blocked_by_codes: blockers.map((d) => d.code),
  };
}

/** "B2-03, B6-01": the codes of what blocks the task, as the API names them (never blanks for unseen tasks). */
export const blockingCodes = (task: Pick<TaskWithComputed, "blocked_by_codes">): string =>
  (task.blocked_by_codes ?? []).filter((c) => c.trim() !== "").join(", ");

const TRANSITIONS: Record<UserRole, Partial<Record<TaskStatus, TaskStatus[]>>> = {
  partner_firm: {
    pending: ["in_progress"],
    // in_progress → pending lets the firm undo a start made by mistake.
    in_progress: ["submitted", "pending"],
    changes_requested: ["submitted"],
  },
  business_owner: {
    submitted: ["accepted", "changes_requested"],
  },
  sm_team: {
    pending: ["in_progress"],
    // in_progress → pending lets the firm undo a start made by mistake.
    in_progress: ["submitted", "pending"],
    changes_requested: ["submitted"],
    submitted: ["accepted", "changes_requested"],
  },
  // These roles never work on program tasks.
  sm_global: {},
  bishop: {},
  franchisee: {},
};

export function canTransition(role: UserRole, from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[role][from]?.includes(to) ?? false;
}
