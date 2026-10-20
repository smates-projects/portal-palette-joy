import { useTranslation } from "react-i18next";
import type { PortalMeetingStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<PortalMeetingStatus, string> = {
  proposed: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  confirmed: "border-status-success-border bg-status-success-bg text-status-success-fg",
  cancelled: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
};

/** Propuesta / Confirmada / Cancelada, with a visible border. */
export function MeetingStatusChip({ status, className }: { status: PortalMeetingStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("shrink-0 rounded-[4px] border px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[status], className)}>
      {t(`calendar.status.${status}`)}
    </span>
  );
}

/** The small mark of a meeting that lives in Google Calendar. */
export function GoogleMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span title={t("calendar.google_mark_title")} className={cn("shrink-0 rounded-[4px] border border-border bg-surface px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {t("calendar.google_mark")}
    </span>
  );
}
