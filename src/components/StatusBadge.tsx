import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { VisibleTaskStatus } from "@/lib/api/types";

type BadgeKind = VisibleTaskStatus | "cancelled" | "blocked" | "overdue";

const styles: Record<BadgeKind, string> = {
  pending: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
  in_progress: "bg-status-info-bg text-status-info-fg border-status-info-border",
  submitted: "bg-status-review-bg text-status-review-fg border-status-review-border",
  changes_requested: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  accepted: "bg-status-success-bg text-status-success-fg border-status-success-border",
  cancelled: "bg-status-neutral-bg text-muted-foreground border-status-neutral-border line-through",
  blocked: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
  overdue: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
};

export function StatusBadge({ status, className }: { status: BadgeKind; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none",
        styles[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
