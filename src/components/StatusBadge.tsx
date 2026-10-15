import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { VisibleTaskStatus } from "@/lib/api/types";

type BadgeKind = VisibleTaskStatus | "cancelled" | "blocked" | "overdue";

const styles: Record<BadgeKind, string> = {
  pending: "bg-badge-todo text-primary-foreground border-badge-todo font-bold",
  in_progress: "bg-badge-doing text-primary-foreground border-badge-doing font-bold",
  submitted: "bg-badge-review text-primary-foreground border-badge-review font-bold",
  changes_requested: "bg-badge-fix text-foreground border-badge-fix font-bold",
  accepted: "bg-badge-done text-primary-foreground border-badge-done font-bold",
  cancelled: "bg-status-neutral-bg text-muted-foreground border-status-neutral-border line-through",
  blocked: "bg-badge-blocked text-primary-foreground border-badge-blocked font-bold",
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
