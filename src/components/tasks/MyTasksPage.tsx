import { useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Columns3, GanttChart, Search, Table2, X } from "lucide-react";
import { TODAY } from "@/config/app";
import { useBusinesses, useTasks } from "@/lib/api/hooks";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ALL = "__all";
const AREAS: AreaCode[] = ["B1", "B2", "B3", "B4", "B5", "B6"];
const COLUMNS: SortKey[] = ["code", "name", "business", "area", "step", "due", "status"];
const VIEW_ICONS = { table: Table2, board: Columns3, roadmap: GanttChart, calendar: CalendarDays } as const;
const AREA_DOT: Record<AreaCode, string> = {
  B1: "bg-area-b1", B2: "bg-area-b2", B3: "bg-area-b3", B4: "bg-area-b4", B5: "bg-area-b5", B6: "bg-area-b6",
};

export function MyTasksPage({ search }: { search: TasksSearch }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate({ from: "/tareas/" });
  const tasksQ = useTasks();
  const bizQ = useBusinesses();

  const setSearch = (patch: Partial<TasksSearch>, replace = false) =>
    navigate({ search: (prev: TasksSearch) => ({ ...prev, ...patch }), replace });

  const businessName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";
  const ctx = { businessName, statusLabel: (s: string) => t(`status.${s}`) };
  const view: TasksView = (VIEWS as readonly string[]).includes(search.view ?? "") ? (search.view as TasksView) : "table";

  const rows = useMemo(
    () => (tasksQ.data ? sortTasks(filterTasks(tasksQ.data, search, ctx), search, ctx) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasksQ.data, bizQ.data, search],
  );
  const codeById = (id: string) => tasksQ.data?.find((x) => x.id === id)?.code ?? "";
  const overdueCount = rows.filter((r) => r.is_overdue).length;
  const selected = tasksQ.data?.find((x) => x.id === search.task);
  const hasFilters = !!(search.business || search.area || search.status || search.due || search.q);

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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tasks.for_role")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("tasks.heading")}</h1>
        </div>
        <div role="tablist" aria-label={t("tasks.views.label")} className="flex rounded-md border border-border bg-surface p-0.5">
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

      {view !== "table" ? (
        <EmptyState
          title={t("tasks.coming_soon_title", { view: t(`tasks.views.${view}`) })}
          body={t("tasks.coming_soon_body")}
          action={{ label: t("tasks.back_to_table"), onClick: () => setSearch({ view: undefined }) }}
        />
      ) : (
        <>
          {/* Filters */}
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
            <FilterSelect
              label={t("tasks.filters.business")}
              value={search.business}
              allLabel={t("tasks.filters.all_businesses")}
              options={(bizQ.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              onChange={(v) => setSearch({ business: v })}
            />
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
              options={VISIBLE_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
              onChange={(v) => setSearch({ status: v })}
            />
            <FilterSelect
              label={t("tasks.filters.due")}
              value={search.due}
              allLabel={t("tasks.filters.any_due")}
              options={DUE_FILTERS.map((d) => ({ value: d, label: t(`tasks.filters.${d}`) }))}
              onChange={(v) => setSearch({ due: v })}
            />
            {hasFilters && (
              <button
                onClick={() => setSearch({ business: undefined, area: undefined, status: undefined, due: undefined, q: undefined })}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-link hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
                {t("tasks.filters.clear")}
              </button>
            )}
            <label className="ml-auto flex h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={search.group === "business"}
                onChange={(e) => setSearch({ group: e.target.checked ? "business" : undefined })}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t("tasks.filters.group_by_business")}
            </label>
          </div>

          {/* Totals */}
          {tasksQ.data && (
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

          {/* Table */}
          <div className="mt-3 min-h-0 overflow-auto rounded-md border border-border bg-surface">
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
            ) : tasksQ.data?.length === 0 ? (
              <EmptyState inline title={t("tasks.empty_title")} body={t("tasks.empty_body")} />
            ) : rows.length === 0 ? (
              <EmptyState
                inline
                title={t("tasks.no_results_title")}
                body={t("tasks.no_results_body")}
                action={{
                  label: t("tasks.filters.clear"),
                  onClick: () => setSearch({ business: undefined, area: undefined, status: undefined, due: undefined, q: undefined }),
                }}
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted text-left text-xs text-muted-foreground">
                  <tr>
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
                        <td colSpan={COLUMNS.length} className="px-4 py-1.5 text-xs font-semibold text-foreground">
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
                        <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-display text-xs font-semibold tabular-nums">{task.code}</td>
                        <td className="max-w-md px-3 py-2.5"><span className="line-clamp-1">{task.name}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{businessName(task.business_id)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full", AREA_DOT[task.area])} />
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
                            <StatusBadge status={task.status as VisibleTaskStatus} />
                            {task.is_blocked && (
                              <Indicator>
                                {t("tasks.blocked_by", { codes: task.depends_on_task_ids.map(codeById).join(", ") })}
                              </Indicator>
                            )}
                            {task.is_overdue && (
                              <Indicator>{t("tasks.overdue_days", { count: daysBetween(task.due_date, TODAY) })}</Indicator>
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

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSearch({ task: undefined })}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.code}</SheetDescription>
          {selected && (
            <TaskDetail taskId={selected.id} mode="panel" onClose={() => setSearch({ task: undefined })} />
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
