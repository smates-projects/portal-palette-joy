import { TODAY } from "@/config/app";
import type { Task, TaskStatus, TaskWithComputed, UserRole } from "./types";

/** Blocked = depends on at least one task not yet accepted. Not a status. */
export function isBlocked(task: Task, all: Task[]): boolean {
  return task.depends_on_task_ids.some((id) => {
    const dep = all.find((t) => t.id === id);
    return !dep || dep.status !== "accepted";
  });
}

/** Overdue = due date passed and not accepted. Not a status. */
export function isOverdue(task: Task, today: string = TODAY): boolean {
  return task.status !== "accepted" && task.due_date < today;
}

export function withComputed(task: Task, all: Task[], today: string = TODAY): TaskWithComputed {
  return { ...task, is_blocked: isBlocked(task, all), is_overdue: isOverdue(task, today) };
}

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
};

export function canTransition(role: UserRole, from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[role][from]?.includes(to) ?? false;
}
