import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { TODAY } from "@/config/app";
import { useBusinesses, useStartTask, useTasks, useUpcomingMeetings } from "@/lib/api/hooks";
import type { TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { buildSummary, buildToday, nextDue, SUMMARY_FILTER, type SummaryKey } from "@/lib/tasks/home";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";

const CARD_TONE: Record<SummaryKey, string> = {
  overdue: "text-status-danger-fg",
  today: "text-status-warning-fg",
  week: "text-status-info-fg",
  changes: "text-status-warning-fg",
  waiting: "text-status-review-fg",
};

export function HomePage({ taskId }: { taskId?: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const navigate = useNavigate();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const meetingsQ = useUpcomingMeetings();
  const start = useStartTask();
  const [submitFor, setSubmitFor] = useState<string | null>(null);

  const tasks = tasksQ.data ?? [];
  const bizName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";
  const openTask = (id: string | undefined, submit = false) => {
    setSubmitFor(submit && id ? id : null);
    void navigate({ to: "/", search: id ? { task: id } : {}, replace: true });
  };
  const selected = tasks.find((x) => x.id === taskId);

  const dueText = (task: TaskWithComputed) => {
    const d = daysBetween(TODAY, task.due_date);
    if (d < 0) return t("home.overdue_by", { count: -d });
    if (d === 0) return t("home.due_today");
    if (d === 1) return t("home.due_tomorrow");
    return t("home.due_in", { count: d });
  };

  const whenText = (iso: string) => {
    const d = daysBetween(TODAY, iso);
    const weekday = new Intl.DateTimeFormat(lng === "en" ? "en-US" : "es-AR", { weekday: "long" }).format(new Date(`${iso}T12:00:00`));
    return d <= 6 ? t("home.when_weekday", { day: weekday }) : t("home.when_date", { date: formatDate(iso, lng) });
  };

  const action = (task: TaskWithComputed) => {
    const s = task.status as VisibleTaskStatus;
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    if (task.is_blocked && (s === "pending" || s === "in_progress"))
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          {t("home.blocked")}
        </span>
      );
    const cls =
      "h-7 shrink-0 rounded-md bg-primary px-3 font-display text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
    if (s === "pending")
      return (
        <button
          className={cls}
          disabled={start.isPending}
          onClick={(e) => {
            stop(e);
            start.mutate(task.id, {
              onSuccess: () => toast.success(t("taskDetail.t_started", { code: task.code })),
              onError: () => toast.error(t("taskDetail.t_error")),
            });
          }}
        >
          {t("taskDetail.action_start")}
        </button>
      );
    if (s === "in_progress" || s === "changes_requested")
      return (
        <button className={cls} onClick={(e) => (stop(e), openTask(task.id, true))}>
          {s === "in_progress" ? t("taskDetail.action_submit") : t("taskDetail.action_resubmit")}
        </button>
      );
    return null;
  };

  const loading = tasksQ.isLoading || bizQ.isLoading;
  const summary = buildSummary(tasks);
  const today = buildToday(tasks);
  const next = nextDue(tasks);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tasks.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("home.heading")}</h1>

      {tasksQ.isError ? (
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("tasks.error_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("tasks.error_body")}</p>
          <button onClick={() => tasksQ.refetch()} className="mt-3 text-link hover:underline">{t("tasks.retry")}</button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-md" />)
              : summary.map((c) => {
                  const off = c.count === 0;
                  return (
                    <Link
                      key={c.key}
                      to="/tareas"
                      search={SUMMARY_FILTER[c.key]}
                      className={cn(
                        "group rounded-md border border-border bg-surface p-4 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        off && "bg-muted/40",
                      )}
                    >
                      <p className={cn("text-xs font-medium", off ? "text-muted-foreground/70" : "text-muted-foreground")}>{t(`home.cards.${c.key}`)}</p>
                      <p className={cn("mt-1 font-display text-3xl font-semibold tabular-nums", off ? "text-muted-foreground/50" : CARD_TONE[c.key])}>
                        {c.count}
                      </p>
                      <p className={cn("mt-1 truncate text-xs", off ? "text-muted-foreground/60" : "text-muted-foreground")}>
                        {off
                          ? t("home.cards.none")
                          : c.byBusiness.map((b) => t("home.cards.in_business", { count: b.count, name: bizName(b.business_id) })).join(", ")}
                      </p>
                    </Link>
                  );
                })}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Para hoy */}
            <section>
              <h2 className="mb-3 text-sm font-semibold">{t("home.today_title")}</h2>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}</div>
              ) : today.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-surface p-6 text-sm">
                  <p className="font-medium">{t("home.empty_title")}</p>
                  <p className="mt-1 text-muted-foreground">
                    {next
                      ? t("home.empty_next", { code: next.code, name: bizName(next.business_id), when: whenText(next.due_date) })
                      : t("home.empty_none")}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                  {today.map(({ task }) => (
                    <li
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openTask(task.id)}
                      onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                    >
                      <span className="w-12 shrink-0 font-display text-xs font-semibold tabular-nums">{task.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{task.name}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{bizName(task.business_id)}</span>
                          <span>·</span>
                          <span className={cn("tabular-nums", task.is_overdue && "text-status-danger-fg")} title={formatDate(task.due_date, lng)}>
                            {dueText(task)}
                          </span>
                        </p>
                      </div>
                      <StatusBadge status={task.status as VisibleTaskStatus} className="hidden sm:inline-flex" />
                      {action(task)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Próximas reuniones */}
            <aside>
              <h2 className="mb-3 text-sm font-semibold">{t("home.meetings_title")}</h2>
              {meetingsQ.isLoading || loading ? (
                <Skeleton className="h-24 rounded-md" />
              ) : meetingsQ.isError ? (
                <p className="text-sm text-muted-foreground">{t("home.meetings_error")}</p>
              ) : (meetingsQ.data ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">{t("home.meetings_empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {meetingsQ.data!.map((m) => {
                    const task = tasks.find((x) => x.id === m.task_id);
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => openTask(m.task_id)}
                          className="w-full rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-ring"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-xs font-semibold tabular-nums">{formatDateTime(m.starts_at, lng)}</span>
                            <span
                              className={cn(
                                "rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium",
                                m.status === "confirmed"
                                  ? "border-status-success-border bg-status-success-bg text-status-success-fg"
                                  : "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
                              )}
                            >
                              {t(`home.meeting_${m.status}`)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm">{m.topic}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {task ? `${bizName(task.business_id)} · ${task.code} ${task.name}` : ""}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && openTask(undefined)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.code}</SheetDescription>
          {selected && (
            <TaskDetail
              key={selected.id + String(submitFor === selected.id)}
              taskId={selected.id}
              mode="panel"
              openSubmit={submitFor === selected.id}
              onClose={() => openTask(undefined)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
