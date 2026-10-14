import { canTransition } from "@/lib/api/computed";
import type { TaskWithComputed, UserRole, VisibleTaskStatus } from "@/lib/api/types";

export const BOARD_COLUMNS: VisibleTaskStatus[] = ["pending", "in_progress", "submitted", "changes_requested", "accepted"];

export type BoardMove =
  | { ok: true; action: "start" | "unstart" | "submit" | "approve" | "request_changes" }
  | { ok: false; reason: "same" | "blocked" | "owner_only" | "already_submitted" | "already_accepted" | "start_first" | "no_going_back" | "firm_only" };

/** Decides what a drag from one column to another means for this role. Never changes data. */
export function resolveBoardMove(task: TaskWithComputed, to: VisibleTaskStatus, role: UserRole): BoardMove {
  const from = task.status as VisibleTaskStatus;
  if (from === to) return { ok: false, reason: "same" };
  if (canTransition(role, from, to)) {
    if (to === "in_progress" && task.is_blocked) return { ok: false, reason: "blocked" };
    if (to === "in_progress") return { ok: true, action: "start" };
    if (to === "submitted") return { ok: true, action: "submit" };
    if (to === "pending") return { ok: true, action: "unstart" };
    if (to === "accepted") return { ok: true, action: "approve" };
    if (to === "changes_requested") return { ok: true, action: "request_changes" };
  }
  // The owner approves or requests changes; starting and delivering is the firm's job.
  if (role === "business_owner") {
    if (from === "accepted") return { ok: false, reason: "already_accepted" };
    if (to === "pending" || to === "in_progress" || to === "submitted") return { ok: false, reason: "firm_only" };
    return { ok: false, reason: "no_going_back" };
  }
  if (to === "accepted" || to === "changes_requested") {
    if (role !== "sm_team") return { ok: false, reason: from === "accepted" ? "already_accepted" : "owner_only" };
  }
  if (from === "accepted") return { ok: false, reason: "already_accepted" };
  if (from === "submitted") return { ok: false, reason: "already_submitted" };
  if (from === "pending" && to === "submitted") return { ok: false, reason: "start_first" };
  return { ok: false, reason: "no_going_back" };
}
