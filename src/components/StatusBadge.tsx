import { Ban, Check, Circle, CirclePlay, Clock, Lock, PencilLine, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { VisibleTaskStatus } from "@/lib/api/types";

export type BadgeKind = VisibleTaskStatus | "cancelled" | "blocked" | "overdue";

/**
 * Single source of the task-status look. Every place that shows a task status (badge, board bars,
 * roadmap bars, report segments, version history) reads from this map, which points to the
 * --task-* tokens in styles.css.
 */
export interface TaskStatusLook {
  icon: LucideIcon;
  /** Full badge: todo is outline, doing is tint, the rest are solid with their own text color. */
  badge: string;
  /** Solid color for bars, dots and chart segments. */
  solid: string;
  /** Text color that stays readable on `solid`. */
  onSolid: string;
  /** Soft bar for timelines: tint background with the status border, so labels stay readable. */
  soft: string;
}

export const TASK_STATUS_LOOK: Record<BadgeKind, TaskStatusLook> = {
  pending: {
    icon: Circle,
    badge: "border-task-todo-border bg-task-todo-tint text-task-todo-ink",
    solid: "bg-task-todo-solid",
    onSolid: "text-task-todo-fg",
    soft: "bg-task-todo-tint border-task-todo-border",
  },
  in_progress: {
    icon: CirclePlay,
    badge: "border-task-doing-border bg-task-doing-tint text-task-doing-ink",
    solid: "bg-task-doing-solid",
    onSolid: "text-task-doing-fg",
    soft: "bg-task-doing-tint border-task-doing-border",
  },
  submitted: {
    icon: Clock,
    badge: "border-task-review-border bg-task-review-solid text-task-review-fg",
    solid: "bg-task-review-solid",
    onSolid: "text-task-review-fg",
    soft: "bg-task-review-tint border-task-review-border",
  },
  changes_requested: {
    icon: PencilLine,
    badge: "border-task-fix-border bg-task-fix-solid text-task-fix-fg",
    solid: "bg-task-fix-solid",
    onSolid: "text-task-fix-fg",
    soft: "bg-task-fix-tint border-task-fix-border",
  },
  accepted: {
    icon: Check,
    badge: "border-task-done-border bg-task-done-solid text-task-done-fg",
    solid: "bg-task-done-solid",
    onSolid: "text-task-done-fg",
    soft: "bg-task-done-tint border-task-done-border",
  },
  blocked: {
    icon: Lock,
    badge: "border-task-blocked-border bg-task-blocked-solid text-task-blocked-fg",
    solid: "bg-task-blocked-solid",
    onSolid: "text-task-blocked-fg",
    soft: "bg-task-blocked-tint border-task-blocked-border",
  },
  overdue: {
    icon: TriangleAlert,
    badge: "border-task-blocked-border bg-task-blocked-solid text-task-blocked-fg",
    solid: "bg-task-blocked-solid",
    onSolid: "text-task-blocked-fg",
    soft: "bg-task-blocked-tint border-task-blocked-border",
  },
  cancelled: {
    icon: Ban,
    badge: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg line-through",
    solid: "bg-status-neutral-border",
    onSolid: "text-status-neutral-fg",
    soft: "bg-status-neutral-bg border-status-neutral-border",
  },
};

export function StatusBadge({ status, label, className }: { status: BadgeKind; label?: string; className?: string }) {
  const { t } = useTranslation();
  const look = TASK_STATUS_LOOK[status];
  const Icon = look.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-xs font-semibold leading-none",
        look.badge,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.5} />
      {label ?? t(`status.${status}`)}
    </span>
  );
}
