import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, Maximize2, ChevronDown, Plus, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Lock, Target } from "lucide-react";
import { TODAY } from "@/config/app";
import { useBusinesses, useStartTask, useTasks, useUpcomingMeetings } from "@/lib/api/hooks";
import type { TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate, formatDateTime, localeTag } from "@/lib/format";
import { buildProgress, buildSummary, buildToday, nextDue, SUMMARY_FILTER, type TodayReason } from "@/lib/tasks/home";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { StatusBadge, TASK_STATUS_LOOK } from "@/components/StatusBadge";
import { AreaSquare, AreaTag, areaAccentStyle } from "@/components/AreaTag";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AddEventDialog } from "@/components/home/AddEventDialog";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";

const GROUPS: TodayReason[] = ["overdue", "today", "changes", "week"];
const PILL: Record<TodayReason, string> = {
  overdue: TASK_STATUS_LOOK.overdue.badge,
  today: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  changes: TASK_STATUS_LOOK.changes_requested.badge,
  week: "border-status-info-border bg-status-info-bg text-status-info-fg",
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function HomePage({ taskId }: { taskId?: string | undefined }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const locale = localeTag(lng);
  const navigate = useNavigate();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const meetingsQ = useUpcomingMeetings();
  const start = useStartTask();
  const [submitFor, setSubmitFor] = useState<string | null>(null);
  const [closed, setClosed] = useState<Partial<Record<TodayReason, boolean>>>({});
  const [weekStart, setWeekStart] = useState(() => addDays(TODAY, -3));
  const [day, setDay] = useState(TODAY);
  const [addOpen, setAddOpen] = useState(false);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const meetings = meetingsQ.data ?? [];
  const dayMeetings = meetings.filter((m) => m.starts_at.slice(0, 10) === day);

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

  const dueSub = (task: TaskWithComputed) => {
    const d = daysBetween(TODAY, task.due_date);
    if (d < 0) return t("home.due_sub_ago", { count: -d });
    if (d === 0) return t("home.due_sub_today");
    if (d === 1) return t("home.due_sub_tomorrow");
    return t("home.due_sub_in", { count: d });
  };

  const whenText = (iso: string) => {
    const d = daysBetween(TODAY, iso);
    const weekday = new Intl.DateTimeFormat(localeTag(lng), { weekday: "long" }).format(new Date(`${iso}T12:00:00`));
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
  const progress = buildProgress(tasks, (id) => bizQ.data?.find((b) => b.id === id)?.program_day ?? 0);

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
          {/* Summary strip: one bar, five counters */}
          {loading ? (
            <Skeleton className="mt-6 h-[76px] rounded-md" />
          ) : (
            <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-5 sm:divide-x sm:divide-border">
              {summary.map((c) => {
                const off = c.count === 0;
                const alert = !off && c.key === "overdue";
                return (
                  <Link
                    key={c.key}
                    to="/tareas"
                    search={SUMMARY_FILTER[c.key]}
                    className={cn(
                      "relative px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
                      alert && "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-status-danger-fg",
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-display text-2xl font-semibold tabular-nums", off ? "text-muted-foreground/40" : alert ? "text-status-danger-fg" : "text-foreground")}>
                        {c.count}
                      </span>
                      <span className={cn("text-xs font-medium", off ? "text-muted-foreground/60" : "text-foreground")}>{t(`home.cards.${c.key}`)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {off ? t("home.cards.none") : c.byBusiness.map((b) => t("home.cards.in_business", { count: b.count, name: bizName(b.business_id) })).join(", ")}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* Para hoy, grouped by urgency */}
            <section className="rounded-md border border-border bg-surface p-5">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <ClipboardList className="h-4 w-4 text-primary" />
                {t("home.today_title")}
              </h2>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
              ) : today.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-sm">
                  <p className="font-medium">{t("home.empty_title")}</p>
                  <p className="mt-1 text-muted-foreground">
                    {next
                      ? t("home.empty_next", { code: next.code, name: bizName(next.business_id), when: whenText(next.due_date) })
                      : t("home.empty_none")}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {GROUPS.map((g) => {
                    const rows = today.filter((r) => r.reason === g);
                    if (!rows.length) return null;
                    const open = !closed[g];
                    return (
                      <div key={g}>
                        <button
                          onClick={() => setClosed((c) => ({ ...c, [g]: open }))}
                          aria-expanded={open}
                          className="flex items-center gap-2 text-xs"
                        >
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-[10px] font-display font-semibold uppercase leading-none tracking-wide", PILL[g])}>
                            {t(`home.cards.${g}`)}
                          </span>
                          <span className="text-muted-foreground">· {t("home.group_count", { count: rows.length })}</span>
                        </button>
                        {open && (
                          <div className="mt-2">
                            <div className="grid grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_124px_88px_112px] gap-3 border-b border-border px-1 py-2 text-xs text-muted-foreground">
                              <span>{t("home.col_task")}</span>
                              <span className="hidden sm:block">{t("home.col_status")}</span>
                              <span>{t("home.col_due")}</span>
                              <span className="hidden sm:block" />
                            </div>
                            <ul className="divide-y divide-border border-b border-border">
                              {rows.map(({ task }) => (
                                <li
                                  key={task.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openTask(task.id)}
                                  onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
                                  className="grid cursor-pointer grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_124px_88px_112px] items-center gap-3 px-1 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <AreaSquare area={task.area} />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm">
                                        <span className="mr-2 font-display text-xs font-semibold tabular-nums">{task.code}</span>
                                        {task.name}
                                      </p>
                                      <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                                        {bizName(task.business_id)}
                                        <span className="sm:hidden">{action(task)}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="hidden items-center sm:flex">
                                    <StatusBadge status={task.status as VisibleTaskStatus} />
                                  </div>
                                  <div title={formatDate(task.due_date, lng)}>
                                    <p className={cn("text-sm font-medium", (task.is_overdue || g === "today") && "text-status-danger-fg")}>
                                      {t(task.is_overdue ? "home.due_label_overdue" : "home.due_label_due")}
                                    </p>
                                    <p className="text-[11px] leading-tight tabular-nums text-muted-foreground">{dueSub(task)}</p>
                                  </div>
                                  <div className="hidden justify-end sm:flex">{action(task)}</div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="space-y-6">
              {/* Agenda: week strip + meetings of the chosen day */}
              <section className="rounded-md border border-border bg-surface p-5">
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {t("home.calendar_title")}
                  <span className="ml-auto text-xs font-normal capitalize text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${weekStart}T12:00:00`))}
                  </span>
                  <button onClick={() => void navigate({ to: "/tareas", search: { view: "calendar" } })} aria-label={t("home.open_calendar")} title={t("home.open_calendar")} className="rounded p-1 text-primary hover:bg-accent">
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setAddOpen(true)} aria-label={t("home.add_event")} title={t("home.add_event")} className="rounded p-1 text-primary hover:bg-accent">
                    <Plus className="h-4 w-4" />
                  </button>
                </h2>
                <div className="flex items-center gap-1">
                  <button aria-label="‹" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded p-1 hover:bg-accent">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="grid flex-1 grid-cols-7 gap-1">
                    {week.map((d) => {
                      const sel = d === day;
                      const has = meetings.some((m) => m.starts_at.slice(0, 10) === d);
                      const dt = new Date(`${d}T12:00:00`);
                      return (
                        <button
                          key={d}
                          onClick={() => setDay(d)}
                          onDoubleClick={() => void navigate({ to: "/tareas", search: { view: "calendar" } })}
                          className={cn(
                            "flex flex-col items-center rounded-md py-1.5 transition-colors",
                            sel ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                          )}
                        >
                          <span className={cn("text-[10px] capitalize", sel ? "opacity-80" : "text-muted-foreground")}>
                            {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)}
                          </span>
                          <span className="font-display text-sm font-semibold tabular-nums">{d.slice(8)}</span>
                          <span className={cn("mt-0.5 h-1 w-1 rounded-full", has ? (sel ? "bg-gold-light" : "bg-gold") : "bg-transparent")} />
                        </button>
                      );
                    })}
                  </div>
                  <button aria-label="›" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded p-1 hover:bg-accent">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {meetingsQ.isLoading || loading ? (
                    <Skeleton className="h-20 rounded-md" />
                  ) : meetingsQ.isError ? (
                    <p className="text-sm text-muted-foreground">{t("home.meetings_error")}</p>
                  ) : meetings.length === 0 ? (
                    <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">{t("home.meetings_empty")}</p>
                  ) : dayMeetings.length === 0 ? (
                    <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">{t("home.day_empty")}</p>
                  ) : (
                    dayMeetings.map((m) => {
                      const task = tasks.find((x) => x.id === m.task_id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => void navigate({ to: "/tareas", search: { view: "calendar" } })}
                          className="w-full rounded-md border border-border p-4 text-left transition-[filter] hover:brightness-95"
                          style={task ? areaAccentStyle(task.area, 4) : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{m.topic}</p>
                            <span
                              className={cn(
                                "shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium",
                                m.status === "confirmed"
                                  ? "border-status-success-border bg-status-success-bg text-status-success-fg"
                                  : "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
                              )}
                            >
                              {t(`home.meeting_${m.status}`)}
                            </span>
                          </div>
                          <p className="mt-1 font-display text-xs tabular-nums text-muted-foreground">{formatDateTime(m.starts_at, lng)}</p>
                          <p className="mt-2 inline-block max-w-full truncate rounded-md border border-border bg-surface px-2 py-1 text-xs">
                            {task ? `${bizName(task.business_id)} · ${task.code}` : ""}
                          </p>
                          {task && <AreaTag area={task.area} className="mt-2 text-xs text-muted-foreground" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Progress per business */}
              <section className="rounded-md border border-border bg-surface p-5">
                <div className="mb-4 flex items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Target className="h-4 w-4 text-primary" />
                    {t("home.progress_title")}
                  </h2>
                  {!loading && (
                    <span className="font-display text-xs tabular-nums text-muted-foreground">
                      {t("home.progress_total", { done: progress.reduce((a, p) => a + p.accepted, 0), total: progress.reduce((a, p) => a + p.total, 0) })}
                    </span>
                  )}
                </div>
                {loading ? (
                  <Skeleton className="h-32 rounded-md" />
                ) : (
                  <div className="space-y-4">
                    {progress.map((p) => {
                      const biz = bizQ.data?.find((b) => b.id === p.business_id);
                      const share = p.total ? Math.round((p.accepted / p.total) * 100) : 0;
                      // One pace rule for the text and the bar, so they never disagree (brand status colors only).
                      const pace = p.gap >= -5 ? "success" : p.gap >= -15 ? "warning" : "danger";
                      const tone = { success: "text-status-success-fg", warning: "text-status-warning-fg", danger: "text-status-danger-fg" }[pace];
                      const bar = { success: "bg-status-success-fg", warning: "bg-status-warning-fg", danger: "bg-status-danger-fg" }[pace];
                      return (
                        <Link key={p.business_id} to="/tareas" search={{ business: p.business_id }} className="-mx-2 flex items-center gap-4 rounded-md px-2 py-1 transition-colors hover:bg-accent/40">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{biz?.name}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {t("home.progress_day", { day: biz?.program_day ?? 0 })} ·{" "}
                              <span className={tone}>{p.gap >= -5 ? t("home.progress_on_track") : t("home.progress_behind", { count: Math.abs(p.gap) })}</span>
                            </p>
                          </div>
                          <div
                            className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
                            role="img"
                            aria-label={t("home.progress_aria", { done: p.accepted, submitted: p.submitted, active: p.in_progress, total: p.total })}
                          >
                            <span className={cn("absolute inset-y-0 left-0 rounded-full", bar)} style={{ width: `${share}%` }} />
                          </div>
                          <span className="w-10 shrink-0 text-right font-display text-sm font-semibold tabular-nums">{share}%</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </aside>
            <AddEventDialog open={addOpen} onOpenChange={setAddOpen} day={day} tasks={tasks} bizName={bizName} />
          </div>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && openTask(undefined)}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
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
