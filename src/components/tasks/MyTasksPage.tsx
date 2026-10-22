import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Columns3, GanttChart, Search, Table2, X } from "lucide-react";
import { todayIso } from "@/lib/clock";
import { useBusinesses, useCurrentUser, useOrganizations, useTasks, useTasksWithCancelled } from "@/lib/api/hooks";
import { CancelTasksDialog, EditTasksDialog, type EditMode } from "@/components/tasks/sm/SmTaskActions";
import type { AreaCode, TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate, formatRelativeDate } from "@/lib/format";
import {
  DUE_FILTERS,
  VIEWS,
  VISIBLE_STATUSES,
  daysBetween,
  filterTasks,
  sortTasks,
  type SortKey,
  type TasksSearch,
  type TasksView,
} from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { AreaSquare } from "@/components/AreaTag";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskRoadmap } from "@/components/tasks/TaskRoadmap";
import { TaskCalendar, type MeetingsOnlyScope } from "@/components/tasks/TaskCalendar";
import { GlobalCalendarActions } from "@/components/global/calendar/GlobalCalendarActions";
import { useGlobalCalendar } from "@/lib/calendar/use-global-calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ALL = "__all";
const AREAS: AreaCode[] = ["B1", "B2", "B3", "B4", "B5", "B6"];
const COLUMNS: SortKey[] = ["code", "name", "business", "area", "step", "due", "status"];
const VIEW_ICONS = { table: Table2, board: Columns3, roadmap: GanttChart, calendar: CalendarDays } as const;

/**
 * Mis tareas, and the calendar of every role. `calendarRoute` is SM Global's /calendario: the same page in its
 * calendar view, fed with Global's meetings (useGlobalCalendar) and scoped by "Viendo"; only the data changes.
 */
export function MyTasksPage({ search, calendarRoute = false }: { search: TasksSearch; calendarRoute?: boolean }) {
  const { t, i18n } = useTranslation();
  const tasksNavigate = useNavigate({ from: "/tareas/" });
  const plainNavigate = useNavigate();
  const me = useCurrentUser().data;
  const isOwner = me?.role === "business_owner";
  const isSm = me?.role === "sm_team";
  const isGlobal = me?.role === "sm_global";
  const activeQ = useTasks();
  const withCancelledQ = useTasksWithCancelled(isSm && search.status === "cancelled");
  const tasksQ = isSm && search.status === "cancelled" ? withCancelledQ : activeQ;
  const bizQ = useBusinesses();
  const orgsQ = useOrganizations();
  // SM: selection for bulk edits (table view only).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<EditMode | "cancel" | null>(null);
  const [submitFor, setSubmitFor] = useState<string | null>(null);
  const [changesFor, setChangesFor] = useState<string | null>(null);

  const setSearch = (patch: Partial<TasksSearch>, replace = false) => {
    if (!calendarRoute) return tasksNavigate({ search: (prev: TasksSearch) => ({ ...prev, ...patch }), replace });
    // On /calendario a view tab goes to Mis tareas; the meeting panel stays here.
    if ("view" in patch) return plainNavigate({ to: "/tareas", search: { view: patch.view } });
    return plainNavigate({ to: "/calendario", search: { meeting: patch.meeting ?? undefined }, replace });
  };

  const businessName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";
  // SM opens on the tasks they supervise; sup=all shows every task of their office.
  const ctx = {
    businessName,
    statusLabel: (s: string) => t(`status.${s}`),
    supervisorId: isSm && search.sup !== "all" ? me?.id : undefined,
    all: activeQ.data,
  };
  const view: TasksView = calendarRoute ? "calendar" : (VIEWS as readonly string[]).includes(search.view ?? "") ? (search.view as TasksView) : "table";
  // SM Global's calendar: her meetings (or an office's, with Viendo) instead of the tasks.
  const globalCalendar = isGlobal && view === "calendar";
  const globalSource = useGlobalCalendar(globalCalendar);
  const noteCls = "mb-2 rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-sm text-status-info-fg";
  const meetingsOnly: MeetingsOnlyScope | undefined = globalCalendar
    ? {
        leadMeetings: globalSource.leadMeetings,
        portalFilter: globalSource.portalFilter,
        showGoogle: globalSource.showGoogle,
        loading: globalSource.loading,
        renderEmpty: (mode) => (
          <p role="status" className={noteCls}>
            {globalSource.view.kind === "office"
              ? t(`calendar.global.empty_office_${mode}`, { office: globalSource.officeName })
              : t(`calendar.global.empty_${mode}`)}{" "}
            <Link to="/embudo" className="font-medium underline underline-offset-2">{t("calendar.global.empty_link")}</Link>
          </p>
        ),
      }
    : undefined;

  const rows = useMemo(
    () => (tasksQ.data ? sortTasks(filterTasks(tasksQ.data, search, ctx), search, ctx) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksQ.data, bizQ.data, search, isSm, me?.id],
  );
  const codeById = (id: string) => tasksQ.data?.find((x) => x.id === id)?.code ?? "";
  const overdueCount = rows.filter((r) => r.is_overdue).length;
  const selected = tasksQ.data?.find((x) => x.id === search.task);
  const hasFilters = !!(search.business || search.area || search.status || search.due || search.blocked || search.q || search.firm || search.stale || search.attention);
  const clearFilters = { business: undefined, area: undefined, status: undefined, due: undefined, blocked: undefined, q: undefined, firm: undefined, stale: undefined, attention: undefined };
  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const selectable = isSm && view === "table";
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const firms = (orgsQ.data ?? []).filter((o) => o.kind === "partner_firm");

  const groups: { key: string; label: string; items: TaskWithComputed[] }[] =
    search.group === "business"
      ? (bizQ.data ?? [])
          .map((b) => ({ key: b.id, label: b.name, items: rows.filter((r) => r.business_id === b.id) }))
          .filter((g) => g.items.length)
      : [{ key: "all", label: "", items: rows }];

  const toggleSort = (key: SortKey) => {
    if (search.sort !== key) void setSearch({ sort: key, dir: "asc" });
    else if (search.dir !== "desc") void setSearch({ dir: "desc" });
    else void setSearch({ sort: undefined, dir: undefined });
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(isOwner ? "owner.for_role" : isSm ? "sm.for_role" : isGlobal ? "global.for_role" : "tasks.for_role")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(view === "calendar" ? "tasks.calendar_heading" : isOwner ? "owner.tasks_heading" : isSm ? "sm.tasks_heading" : "tasks.heading")}</h1>
        </div>
        <div role="tablist" aria-label={t("tasks.views.label")} className="flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-0.5">
          {VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v];
            return (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setSearch({ view: v === "table" ? undefined : v })}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-sm transition-colors",
                  view === v ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(`tasks.views.${v}`)}
              </button>
            );
          })}
        </div>
      </div>

      {(
        <>
          {/* Filters; on SM Global's calendar the row holds its two actions instead (no task to filter there). */}
          {globalCalendar ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <GlobalCalendarActions leads={globalSource.leads} />
              </div>
              {!globalSource.connected && (
                <p role="note" className={cn(noteCls, "mb-0 mt-3")}>
                  {t("calendar.global.not_connected")}{" "}
                  <Link to="/perfil" hash="google-calendar" className="font-medium underline underline-offset-2">{t("calendar.global.not_connected_link")}</Link>
                </p>
              )}
            </>
          ) : (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <label className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search.q ?? ""}
                onChange={(e) => setSearch({ q: e.target.value || undefined }, true)}
                placeholder={t("tasks.filters.search")}
                aria-label={t("tasks.filters.search")}
                className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </label>
            {isSm && (
              <Select value={search.sup === "all" ? "all" : "mine"} onValueChange={(v) => setSearch({ sup: v === "all" ? "all" : undefined })}>
                <SelectTrigger aria-label={t("sm.filter_scope")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", search.sup !== "all" && "border-ring")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">{t("sm.scope_mine")}</SelectItem>
                  <SelectItem value="all">{t("sm.scope_all", { office: orgsQ.data?.find((o) => o.id === me?.organization_id)?.name ?? "" })}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isSm && (
              <FilterSelect
                label={t("sm.filter_firm")}
                value={search.firm}
                allLabel={t("sm.all_firms")}
                options={firms.map((o) => ({ value: o.id, label: t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) }) }))}
                onChange={(v) => setSearch({ firm: v })}
              />
            )}
            {!isOwner && (
              <FilterSelect
                label={t("tasks.filters.business")}
                value={search.business}
                allLabel={t("tasks.filters.all_businesses")}
                options={(bizQ.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                onChange={(v) => setSearch({ business: v })}
              />
            )}
            <FilterSelect
              label={t("tasks.filters.area")}
              value={search.area}
              allLabel={t("tasks.filters.all_areas")}
              options={AREAS.map((a) => ({ value: a, label: `${a} · ${t(`areas.${a}`)}` }))}
              onChange={(v) => setSearch({ area: v })}
            />
            <FilterSelect
              label={t("tasks.filters.status")}
              value={search.status}
              allLabel={t("tasks.filters.all_statuses")}
              options={[...VISIBLE_STATUSES, ...(isSm ? (["cancelled"] as const) : [])].map((s) => ({ value: s, label: t(`status.${s}`) }))}
              onChange={(v) => setSearch({ status: v })}
            />
            <FilterSelect
              label={t("tasks.filters.due")}
              value={search.due}
              allLabel={t("tasks.filters.any_due")}
              options={DUE_FILTERS.map((d) => ({ value: d, label: t(`tasks.filters.${d}`) }))}
              onChange={(v) => setSearch({ due: v })}
            />
            {(["stale", "attention"] as const).map((k) =>
              search[k] === "1" ? (
                <button key={k} onClick={() => setSearch({ [k]: undefined })} className="flex h-8 items-center gap-1 rounded-md border border-ring bg-surface px-2 text-sm">
                  {t(`sm.chip_${k}`)}
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null,
            )}
            {hasFilters && (
              <button
                onClick={() => setSearch(clearFilters)}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-link hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
                {t("tasks.filters.clear")}
              </button>
            )}
            {!isOwner && <label className="ml-auto flex h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={search.group === "business"}
                onChange={(e) => setSearch({ group: e.target.checked ? "business" : undefined })}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t("tasks.filters.group_by_business")}
            </label>}
          </div>
          )}

          {/* Totals */}
          {tasksQ.data && !globalCalendar && (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-display font-semibold tabular-nums text-foreground">
                {t("tasks.count", { count: rows.length })}
              </span>
              {overdueCount > 0 && (
                <>
                  {" · "}
                  <span className="font-display font-semibold tabular-nums text-status-danger-fg">
                    {t("tasks.overdue_count", { count: overdueCount })}
                  </span>
                </>
              )}
            </p>
          )}

          {selectable && selectedRows.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-ring bg-accent/50 px-3 py-2 text-sm">
              <span className="font-medium">{t("sm.selected", { count: selectedRows.length })}</span>
              <span className="mx-1 h-4 w-px bg-border" />
              {(["assignee", "due", "step"] as const).map((m) => (
                <button key={m} onClick={() => setBulk(m)} className="h-7 rounded-md border border-border bg-surface px-2.5 hover:bg-muted">{t(`sm.bulk_${m}`)}</button>
              ))}
              <button onClick={() => setBulk("cancel")} className="h-7 rounded-md border border-border bg-surface px-2.5 text-status-danger-fg hover:bg-muted">{t("sm.action_cancel_task")}</button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-link hover:underline">{t("sm.clear_selection")}</button>
            </div>
          )}

          {/* Table */}
          <div className={cn("mt-3 min-h-0", view === "board" || view === "roadmap" || view === "calendar" ? "flex flex-1 flex-col" : "overflow-auto rounded-md border border-border bg-surface")}>
            {tasksQ.isError ? (
              <EmptyState
                inline
                title={t("tasks.error_title")}
                body={t("tasks.error_body")}
                action={{ label: t("tasks.retry"), onClick: () => void tasksQ.refetch() }}
              />
            ) : tasksQ.isLoading || bizQ.isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            ) : view === "calendar" ? (
              // The calendar shows portal meetings too, so it opens even without tasks (a Bishop from the bell).
              <TaskCalendar
                rows={rows}
                businessName={businessName}
                onOpen={(id) => {
                  setSubmitFor(null);
                  setChangesFor(null);
                  void setSearch({ task: id });
                }}
                focusMeetingId={search.meeting}
                onFocusMeeting={(id) => void setSearch({ meeting: id ?? undefined })}
                meetingsOnly={meetingsOnly}
              />
            ) : tasksQ.data?.length === 0 ? (
              <EmptyState inline title={t("tasks.empty_title")} body={t("tasks.empty_body")} />
            ) : rows.length === 0 ? (
              <EmptyState
                inline
                title={t("tasks.no_results_title")}
                body={t("tasks.no_results_body")}
                action={{
                  label: t("tasks.filters.clear"),
                  onClick: () => setSearch(clearFilters),
                }}
              />
            ) : view === "roadmap" ? (
              <>
              <p role="note" className="mb-2 rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-sm text-status-info-fg md:hidden">{t("tasks.roadmap_desktop_hint")}</p>
              <TaskRoadmap
                rows={rows}
                allTasks={tasksQ.data ?? []}
                businesses={bizQ.data ?? []}
                selectedId={search.task}
                onOpen={(id) => {
                  setSubmitFor(null);
                  setChangesFor(null);
                  void setSearch({ task: id });
                }}
              />
              </>
            ) : view === "board" ? (
              <TaskBoard
                rows={rows}
                selectedId={search.task}
                businessName={businessName}
                codeById={codeById}
                onOpen={(id) => {
                  setSubmitFor(null);
                  setChangesFor(null);
                  void setSearch({ task: id });
                }}
                onSubmit={(id) => {
                  setSubmitFor(id);
                  void setSearch({ task: id });
                }}
                onRequestChanges={(id) => {
                  setChangesFor(id);
                  void setSearch({ task: id });
                }}
              />
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    {selectable && (
                      <th className="w-8 py-2 pl-4">
                        <input
                          type="checkbox"
                          aria-label={t("sm.select_all")}
                          checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                          onChange={(e) => setSelectedIds(e.target.checked ? new Set(rows.filter((r) => r.status !== "cancelled").map((r) => r.id)) : new Set())}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                      </th>
                    )}
                    {COLUMNS.map((c) => {
                      const active = search.sort === c;
                      const Icon = !active ? ArrowUpDown : search.dir === "desc" ? ArrowDown : ArrowUp;
                      return (
                        <th key={c} className="px-3 py-2 font-medium first:pl-4" aria-sort={active ? (search.dir === "desc" ? "descending" : "ascending") : "none"}>
                          <button
                            onClick={() => toggleSort(c)}
                            aria-label={t("tasks.sort_by", { column: t(`tasks.columns.${c}`) })}
                            className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                          >
                            {t(`tasks.columns.${c}`)}
                            <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.key} className="divide-y divide-border">
                    {g.label && (
                      <tr className="bg-muted/40">
                        <td colSpan={COLUMNS.length + (selectable ? 1 : 0)} className="px-4 py-1.5 text-xs font-semibold text-foreground">
                          {g.label} <span className="ml-1 font-display font-normal tabular-nums text-muted-foreground">{g.items.length}</span>
                        </td>
                      </tr>
                    )}
                    {g.items.map((task) => (
                      <tr
                        key={task.id}
                        onClick={() => setSearch({ task: task.id })}
                        onKeyDown={(e) => e.key === "Enter" && setSearch({ task: task.id })}
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:bg-accent",
                          search.task === task.id && "bg-accent",
                        )}
                      >
                        {selectable && (
                          <td className="w-8 py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={t("sm.select_task", { code: task.code })}
                              disabled={task.status === "cancelled"}
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleRow(task.id)}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                          </td>
                        )}
                        <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-display text-xs font-semibold tabular-nums">{task.code}</td>
                        <td className="max-w-md px-3 py-2.5"><span className="line-clamp-1">{task.name}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{businessName(task.business_id)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <AreaSquare area={task.area} />
                            {t(`areas.${task.area}`)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{t(`steps.${task.step}`)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn(task.is_overdue && "text-status-danger-fg")}>
                                {formatRelativeDate(task.due_date, i18n.language)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{formatDate(task.due_date, i18n.language)}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={task.status === "cancelled" ? "cancelled" : (task.status as VisibleTaskStatus)} />
                            {task.is_blocked && (
                              <Indicator>
                                {t("tasks.blocked_by", { codes: task.depends_on_task_ids.map(codeById).join(", ") })}
                              </Indicator>
                            )}
                            {task.is_overdue && (
                              <Indicator>{t("tasks.overdue_days", { count: daysBetween(task.due_date, todayIso()) })}</Indicator>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </div>
        </>
      )}

      {bulk && bulk !== "cancel" && (
        <EditTasksDialog open onOpenChange={(o) => !o && setBulk(null)} tasks={selectedRows} mode={bulk} onDone={() => setSelectedIds(new Set())} />
      )}
      <CancelTasksDialog open={bulk === "cancel"} onOpenChange={(o) => !o && setBulk(null)} tasks={selectedRows} onDone={() => setSelectedIds(new Set())} />

      <Sheet open={!!selected} onOpenChange={(open) => {
          if (open) return;
          setSubmitFor(null);
                  setChangesFor(null);
          void setSearch({ task: undefined });
        }}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.code}</SheetDescription>
          {selected && (
            <TaskDetail
              key={selected.id + String(submitFor === selected.id) + String(changesFor === selected.id)}
              taskId={selected.id}
              mode="panel"
              openSubmit={submitFor === selected.id}
              openChanges={changesFor === selected.id}
              onClose={() => setSearch({ task: undefined })}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Indicator({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-status-danger-fg">
      <span className="h-1.5 w-1.5 rounded-full bg-status-danger-fg" />
      {children}
    </span>
  );
}

function FilterSelect(props: {
  label: string;
  value?: string | undefined;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Select value={props.value ?? ALL} onValueChange={(v) => props.onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={props.label} className={cn("h-8 w-auto min-w-36 gap-2 bg-surface text-sm", props.value && "border-ring text-foreground")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{props.allLabel}</SelectItem>
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState(props: { title: string; body: string; inline?: boolean; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", !props.inline && "mt-6 rounded-md border border-border bg-surface")}>
      <p className="font-semibold">{props.title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{props.body}</p>
      {props.action && (
        <button
          onClick={props.action.onClick}
          className="mt-4 h-8 rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {props.action.label}
        </button>
      )}
    </div>
  );
}
