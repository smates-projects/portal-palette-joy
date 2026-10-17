import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { nowIso } from "@/config/app";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/api/hooks";
import type { AppNotification, NotificationKind } from "@/lib/api/types";
import { firstName, formatDateTime, localeTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { describeChange } from "@/lib/tasks/changes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/** Discreet dot color per kind, inside the brand palette. */
const DOT: Record<NotificationKind, string> = {
  due_today: "bg-status-warning-fg",
  due_tomorrow: "bg-status-warning-border",
  overdue: "bg-status-danger-fg",
  submitted_for_approval: "bg-primary",
  changes_requested: "bg-status-warning-fg",
  mentioned: "bg-link",
  meeting_proposed: "bg-link",
  meeting_confirmed: "bg-primary",
  unblocked: "bg-status-success-fg",
  task_updated: "bg-link",
  bishop_accepted: "bg-status-success-fg",
  funds_reported: "bg-primary",
  lead_assessment: "bg-link",
  meeting_booked: "bg-primary",
};

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const q = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const all = q.data ?? [];
  const unread = all.filter((n) => !n.read_at);
  const list = tab === "unread" ? unread : all;

  const relative = (iso: string) => {
    const mins = Math.round((Date.parse(nowIso()) - Date.parse(iso)) / 60000);
    const rtf = new Intl.RelativeTimeFormat(localeTag(i18n.language), { numeric: "auto" });
    if (mins < 60) return rtf.format(-Math.max(1, mins), "minute");
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), "hour");
    return rtf.format(-Math.round(mins / 1440), "day");
  };

  const openNotification = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    setOpen(false);
    // Lead notifications open the lead in the Embudo; the rest open the task.
    if (n.lead_id) void navigate({ to: "/embudo", search: { lead: n.lead_id } });
    else void navigate({ to: "/tareas", search: { task: n.task_id } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={unread.length ? t("notifications.bell_unread", { count: unread.length }) : t("topbar.notifications")}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-[4px] bg-status-danger-fg px-1 font-display text-[10px] font-semibold tabular-nums text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 pt-2">
          <div role="tablist" className="flex gap-3">
            {(["unread", "all"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "-mb-px border-b-2 pb-2 text-sm transition-colors",
                  tab === k ? "border-gold font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`notifications.tab_${k}`)}
                {k === "unread" && unread.length > 0 && <span className="ml-1 font-display tabular-nums text-muted-foreground">{unread.length}</span>}
              </button>
            ))}
          </div>
          {unread.length > 0 && (
            <button onClick={() => markAll.mutate()} className="pb-2 text-xs text-link hover:underline">
              {t("notifications.mark_all")}
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {q.isLoading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : q.isError ? (
            <div className="p-4 text-sm">
              <p>{t("notifications.error")}</p>
              <button onClick={() => void q.refetch()} className="mt-1 text-link hover:underline">{t("notifications.retry")}</button>
            </div>
          ) : list.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t(tab === "unread" ? "notifications.empty_unread" : "notifications.empty_all")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openNotification(n)} className={cn("flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-accent", !n.read_at && "bg-accent/40")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[n.kind], n.read_at && "opacity-40")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.read_at && "font-medium")}>
                        {n.change
                          ? describeChange(n.change, n.actor_name ? firstName(n.actor_name) : "", t, i18n.language)
                          : t(`notifications.kind_${n.kind}`, {
                              name: n.actor_name ? firstName(n.actor_name) : "",
                              // Automatic entry: "Nuevo assessment de {business} ({place})", "{owner} agendó reunión para el {date}".
                              owner: n.actor_name ?? "", business: n.business_name, place: n.lead_place ?? "",
                              date: n.meeting_at ? formatDateTime(n.meeting_at, i18n.language) : "",
                            })}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {n.lead_id ? (
                          <>{t("notifications.lead_ref", { name: n.business_name })}</>
                        ) : (
                          <><span className="font-display tabular-nums text-foreground">{n.task_code}</span> {n.task_name} · {n.business_name}</>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground" title={formatDateTime(n.created_at, i18n.language)}>
                        {relative(n.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
