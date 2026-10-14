import { canTransition } from "@/lib/api/computed";
import type { TaskWithComputed, UserRole, VisibleTaskStatus } from "@/lib/api/types";

export const BOARD_COLUMNS: VisibleTaskStatus[] = ["pending", "in_progress", "submitted", "changes_requested", "accepted"];

export type BoardMove =
  | { ok: true; action: "start" | "submit" }
  | { ok: false; reason: "same" | "blocked" | "owner_only" | "already_submitted" | "already_accepted" | "start_first" | "no_going_back" };

/** Decides what a drag from one column to another means for this role. Never changes data. */
export function resolveBoardMove(task: TaskWithComputed, to: VisibleTaskStatus, role: UserRole): BoardMove {
  const from = task.status as VisibleTaskStatus;
  if (from === to) return { ok: false, reason: "same" };
  if (canTransition(role, from, to)) {
    if (to === "in_progress" && task.is_blocked) return { ok: false, reason: "blocked" };
    if (to === "in_progress") return { ok: true, action: "start" };
    if (to === "submitted") return { ok: true, action: "submit" };
  }
  if ((to === "accepted" || to === "changes_requested") && role !== "business_owner") {
    if (role !== "sm_team") return { ok: false, reason: from === "accepted" ? "already_accepted" : "owner_only" };
  }
  if (from === "accepted") return { ok: false, reason: "already_accepted" };
  if (from === "submitted") return { ok: false, reason: "already_submitted" };
  if (from === "pending" && to === "submitted") return { ok: false, reason: "start_first" };
  return { ok: false, reason: "no_going_back" };
}
