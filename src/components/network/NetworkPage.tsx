import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
import { useBusinesses, useOrganizations, useRules, useTasks, useVersions } from "@/lib/api/hooks";
import { AREAS, type Health } from "@/lib/tasks/owner";
import { buildFirmLoad, buildNetworkCounters, buildNetworkMatrix, type NetworkCounters } from "@/lib/tasks/sm";
import type { TasksSearch } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const DOT: Record<Health, string> = {
  red: "bg-status-danger-fg",
  amber: "bg-status-warning-fg",
  green: "bg-status-success-fg",
  grey: "bg-status-neutral-border",
};
const COUNTERS: { key: keyof NetworkCounters; search: TasksSearch | null; danger?: boolean }[] = [
  { key: "businesses", search: null },
  { key: "open", search: {} },
  { key: "overdue", search: { due: "overdue" }, danger: true },
  { key: "waiting_approval", search: { status: "submitted" } },
  { key: "blocked", search: { blocked: "1" }, danger: true },
];

interface NetworkPageProps {
  /** "Ver programa" from the pipeline: only that business. */
  businessId?: string | undefined;
  /** Only the businesses in the program and the firms of this office (SM Global looking at one office). */
  officeId?: string | undefined;
  /**
   * Look without touching: no heading of its own and no number, cell or firm opens Mis tareas.
   * The business name still calls `onOpenBusiness`.
   */
  readOnly?: boolean | undefined;
  onOpenBusiness?: ((businessId: string) => void) | undefined;
}

/** Red: the whole office at a glance. Every number and cell opens Mis tareas over the whole office. */
export function NetworkPage({ businessId, officeId, readOnly = false, onOpenBusiness }: NetworkPageProps = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const orgsQ = useOrganizations();
  const versionsQ = useVersions();
  const rulesQ = useRules();
  const go = (search: TasksSearch) => void navigate({ to: "/tareas", search: { ...search, sup: "all" } });
  const nf = (n: number) => formatNumber(n, i18n.language, { maximumFractionDigits: 1 });

  const header = readOnly ? null : (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sm.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("sm.network_heading")}</h1>
    </>
  );
  /** Own page frame, except when it sits inside another screen. */
  const frame = (children: ReactNode) => (readOnly ? <div>{children}</div> : <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>);
  const queries = [tasksQ, bizQ, orgsQ, versionsQ, rulesQ];

  if (queries.some((q) => q.isError))
    return frame(
      <>
        {header}
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("tasks.error_title")}</p>
          <button onClick={() => queries.forEach((q) => void q.refetch())} className="mt-3 text-link hover:underline">
            {t("tasks.retry")}
          </button>
        </div>
      </>,
    );
  if (queries.some((q) => q.isLoading))
    return frame(
      <>
        {header}
        <Skeleton className="mt-6 h-[76px] rounded-md" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]"><Skeleton className="h-64 rounded-md" /><Skeleton className="h-64 rounded-md" /></div>
      </>,
    );

  // "Ver programa" from the pipeline: only that business.
  const focus = businessId ? (bizQ.data ?? []).find((b) => b.id === businessId) : undefined;
  const businesses = (bizQ.data ?? []).filter((b) => (!focus || b.id === focus.id) && (!officeId || (b.office_id === officeId && b.status === "in_program")));
  const businessIds = new Set(businesses.map((b) => b.id));
  const tasks = (tasksQ.data ?? []).filter((x) => businessIds.has(x.business_id));
  const counters = buildNetworkCounters(tasks, businesses);
  const matrix = buildNetworkMatrix(tasks, versionsQ.data ?? [], businesses, undefined, rulesQ.data?.area_amber_days);
  const firms = (orgsQ.data ?? []).filter((o) => o.kind === "partner_firm" && (!officeId || o.parent_id === officeId));
  const load = buildFirmLoad(tasks, versionsQ.data ?? [], firms);

  if (businesses.length === 0)
    return frame(
      <>
        {header}
        <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8 text-sm">
          <p className="font-medium">{t(readOnly ? "global.office.network_empty_title" : "sm.network_empty_title")}</p>
          <p className="mt-1 text-muted-foreground">{t(readOnly ? "global.office.network_empty_body" : "sm.network_empty_body")}</p>
        </div>
      </>,
    );

  return frame(
    <>
      {header}
      {focus && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="rounded-[4px] border border-ring bg-accent/60 px-2 py-1">{t("pipeline.network_filtered", { name: focus.name })}</span>
          <button onClick={() => void navigate({ to: "/red", search: {} })} className="text-link hover:underline">{t("pipeline.network_all")}</button>
        </div>
      )}

      {/* Counters */}
      <div className={cn("grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-5 sm:divide-x sm:divide-border", !readOnly && "mt-6")}>
        {COUNTERS.map((c) => {
          const value = counters[c.key];
          const alert = c.danger && value > 0;
          const body = (
            <div className="flex items-baseline gap-2">
              <span className={cn("font-display text-2xl font-semibold tabular-nums", value === 0 ? "text-muted-foreground/40" : alert ? "text-status-danger-fg" : "text-foreground")}>{value}</span>
              <span className="text-xs font-medium text-foreground">{t(`sm.counters.${c.key}`, { count: value })}</span>
            </div>
          );
          return c.search && !readOnly ? (
            <button key={c.key} onClick={() => go(c.search!)} className="px-4 py-3 text-left transition-colors hover:bg-accent/40">{body}</button>
          ) : (
            <div key={c.key} className="px-4 py-3">{body}</div>
          );
        })}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_400px]">
        {/* Matrix */}
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("sm.matrix_title")}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("sm.matrix_business")}</th>
                  {AREAS.map((a) => (
                    <th key={a} className="px-2 py-2 text-center font-medium">
                      <span className="block font-display text-foreground">{a}</span>
                      <span className="block truncate text-[11px] font-normal">{t(`areas.${a}`)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matrix.map((row) => {
                  const businessLabel = (
                    <>
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[row.health])} />
                      <span>
                        <span className="block font-medium">{row.business.name}</span>
                        <span className="block text-xs text-muted-foreground">{t("sm.program_day", { day: row.business.program_day })}</span>
                      </span>
                    </>
                  );
                  return (
                    <tr key={row.business.id}>
                      <td className="px-4 py-2.5">
                        {readOnly && !onOpenBusiness ? (
                          <span className="flex items-center gap-2 text-left">{businessLabel}</span>
                        ) : (
                          <button onClick={() => (readOnly ? onOpenBusiness?.(row.business.id) : go({ business: row.business.id }))} className="flex items-center gap-2 text-left hover:underline">
                            {businessLabel}
                          </button>
                        )}
                      </td>
                      {row.cells.map((c) => {
                        const label = t(`sm.health.${c.health}`);
                        const cellLabel = `${row.business.name} · ${t(`areas.${c.area}`)}: ${label}`;
                        return (
                          <td key={c.area} className="px-2 py-2.5 text-center">
                            {c.health === "grey" ? (
                              <span className="inline-flex h-8 w-full items-center justify-center" aria-label={label} title={label}>
                                <span className={cn("h-2.5 w-2.5 rounded-full", DOT.grey)} />
                              </span>
                            ) : readOnly ? (
                              <span className="inline-flex h-8 w-full items-center justify-center gap-1.5" aria-label={cellLabel} title={`${label} · ${t("sm.cell_detail", { open: c.open, overdue: c.overdue })}`}>
                                <span className={cn("h-2.5 w-2.5 rounded-full", DOT[c.health])} />
                                <span className="font-display text-xs tabular-nums text-muted-foreground">{c.open}</span>
                              </span>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => go({ business: row.business.id, area: c.area })}
                                    aria-label={cellLabel}
                                    className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT[c.health])} />
                                    <span className="font-display text-xs tabular-nums text-muted-foreground">{c.open}</span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {label} · {t("sm.cell_detail", { open: c.open, overdue: c.overdue })}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {(["green", "amber", "red", "grey"] as Health[]).map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", DOT[h])} />
                {t(`sm.health.${h}`)}
              </span>
            ))}
            {!readOnly && <span className="ml-auto">{t("sm.matrix_hint")}</span>}
          </div>
        </section>

        {/* Firm load */}
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t("sm.load_title")}</h2>
          </div>
          {load.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("sm.load_empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("sm.load_firm")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("sm.load_open")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("sm.load_overdue")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("sm.load_late")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("sm.load_approval")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {load.map((f) => (
                  <tr
                    key={f.firm.id}
                    {...(readOnly
                      ? {}
                      : {
                          tabIndex: 0,
                          className: "cursor-pointer outline-none hover:bg-muted/60 focus-visible:bg-accent",
                          onClick: () => go({ firm: f.firm.id }),
                          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go({ firm: f.firm.id }); } },
                        })}
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-medium">{f.firm.name}</span>
                      <span className="block text-xs text-muted-foreground">{t(`firmWhat.${f.firm.area ?? "B1"}`)}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-display tabular-nums">{f.open}</td>
                    <td className="px-2 py-2.5 text-right font-display tabular-nums">
                      {f.overdue > 0 ? (
                        readOnly ? (
                          <span className="text-status-danger-fg">{f.overdue}</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); go({ firm: f.firm.id, due: "overdue" }); }} className="text-status-danger-fg hover:underline">{f.overdue}</button>
                        )
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-display tabular-nums text-muted-foreground">
                      {f.avg_days_late === null ? "—" : t("sm.days_short", { value: nf(f.avg_days_late) })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-display tabular-nums text-muted-foreground">
                      {f.avg_days_to_approval === null ? "—" : t("sm.days_short", { value: nf(f.avg_days_to_approval) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{t("sm.load_hint")}</p>
        </section>
      </div>
    </>,
  );
}
