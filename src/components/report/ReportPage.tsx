import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/lib/format";
import { useBusinesses, useCurrentUser, useOrganizations, useTasks, useVersions } from "@/lib/api/hooks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildFirmReport } from "@/lib/tasks/report";
import { VISIBLE_STATUSES, type TasksSearch } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_STATUS_LOOK } from "@/components/StatusBadge";


export function ReportPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const tasksQ = useTasks();
  const role = useCurrentUser().data?.role;
  const isOwner = role === "business_owner";
  const isSm = role === "sm_team";
  const orgsQ = useOrganizations();
  // SM sees the whole office and can narrow to one firm.
  const [firm, setFirm] = useState<string | undefined>(undefined);
  const bizQ = useBusinesses();
  const versionsQ = useVersions();
  const go = (search: TasksSearch) =>
    void navigate({ to: "/tareas", search: isSm ? { ...search, sup: "all", ...(firm ? { firm } : {}) } : search });
  const firms = (orgsQ.data ?? []).filter((o) => o.kind === "partner_firm" && (tasksQ.data ?? []).some((x) => x.organization_id === o.id));
  const nf = (n: number) => formatNumber(n, i18n.language, { maximumFractionDigits: 1 });

  const header = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(isOwner ? "owner.for_role" : isSm ? "sm.for_role" : "tasks.for_role")}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t(isOwner ? "owner.report_heading" : isSm ? "sm.report_heading" : "report.heading")}</h1>
        {isSm && (
          <Select value={firm ?? "__all"} onValueChange={(v) => setFirm(v === "__all" ? undefined : v)}>
            <SelectTrigger aria-label={t("sm.filter_firm")} className={cn("h-8 w-auto min-w-48 gap-2 bg-surface text-sm", firm && "border-ring")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("sm.all_firms")}</SelectItem>
              {firms.map((o) => (
                <SelectItem key={o.id} value={o.id}>{t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </>
  );

  if (tasksQ.isError || bizQ.isError || versionsQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("report.error_title")}</p>
          <button onClick={() => { void tasksQ.refetch(); void bizQ.refetch(); void versionsQ.refetch(); }} className="mt-3 text-link hover:underline">
            {t("report.retry")}
          </button>
        </div>
      </div>
    );

  if (tasksQ.isLoading || bizQ.isLoading || versionsQ.isLoading)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <Skeleton className="mt-6 h-28 rounded-md" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 rounded-md" /><Skeleton className="h-64 rounded-md" /></div>
      </div>
    );

  const bizName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";
  const scoped = (tasksQ.data ?? []).filter((x) => !firm || x.organization_id === firm);
  const r = buildFirmReport(scoped, versionsQ.data ?? [], bizQ.data ?? []);
  if (r.total === 0)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8 text-sm">
          <p className="font-medium">{t("report.empty_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("report.empty_body")}</p>
        </div>
      </div>
    );

  const counters: { key: string; value: number; search: TasksSearch; danger?: boolean }[] = [
    { key: "pending", value: r.pending, search: { status: "pending" } },
    { key: "in_progress", value: r.in_progress, search: { status: "in_progress" } },
    { key: "waiting", value: r.waiting_approval, search: { status: "submitted" } },
    { key: "overdue", value: r.overdue, search: { due: "overdue" }, danger: true },
    { key: "blocked", value: r.blocked.length, search: { blocked: "1" }, danger: true },
  ];
  const Num = ({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) => (
    <button onClick={onClick} className={cn("font-display tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm", className)}>
      {children}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {header}

      {/* Progress + counters */}
      <section className="mt-6 grid overflow-hidden rounded-md border border-border bg-surface md:grid-cols-[1.4fr_repeat(5,1fr)]">
        <div className="border-b border-t-2 border-border border-t-transparent p-4 md:border-b-0 md:border-r">
          <p className="text-xs text-muted-foreground">{t("report.progress")}</p>
          <Num onClick={() => go({ status: "accepted" })} className="mt-1 text-3xl font-semibold">{r.progress_pct}%</Num>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gold" style={{ width: `${r.progress_pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("report.progress_detail", { accepted: r.accepted, total: r.total })}</p>
        </div>
        {counters.map((c) => (
          <div key={c.key} className={cn("border-b border-t-2 border-border border-t-transparent p-4 md:border-b-0 md:border-r last:border-r-0", c.danger && c.value > 0 && "border-t-2 border-t-status-danger-fg")}>
            <p className="text-xs text-muted-foreground">{t(`report.c_${c.key}`)}</p>
            <Num
              onClick={() => go(c.search)}
              className={cn("mt-1 text-3xl font-semibold", c.value === 0 ? "text-muted-foreground/50" : c.danger ? "text-status-danger-fg" : "text-foreground")}
            >
              {c.value}
            </Num>
          </div>
        ))}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* By client */}
        <section className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("report.by_client")}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {VISIBLE_STATUSES.map((s) => (
                <span key={s} className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-[2px]", TASK_STATUS_LOOK[s].solid)} />{t(`status.${s}`)}</span>
              ))}
            </div>
          </div>
          <ul className="mt-4 space-y-4">
            {r.by_client.map((c) => (
              <li key={c.business.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <button onClick={() => go({ business: c.business.id })} className="font-medium hover:underline">{c.business.name}</button>
                  <span className="text-xs text-muted-foreground">
                    {t("report.client_detail", { accepted: c.counts.accepted, total: c.total })}
                  </span>
                </div>
                <div className="mt-1.5 flex h-5 overflow-hidden rounded-[4px] border border-border">
                  {VISIBLE_STATUSES.filter((s) => c.counts[s] > 0).map((s) => (
                    <button
                      key={s}
                      onClick={() => go({ business: c.business.id, status: s })}
                      title={`${t(`status.${s}`)}: ${c.counts[s]}`}
                      style={{ width: `${(c.counts[s] / c.total) * 100}%` }}
                      className={cn("grid place-items-center border-r border-surface text-[10px] font-medium tabular-nums last:border-r-0 hover:brightness-95", TASK_STATUS_LOOK[s].solid, TASK_STATUS_LOOK[s].onSolid)}
                    >
                      {c.counts[s]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          {/* Blocked */}
          <section className="rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{t("report.blocked_title")}</h2>
            {r.blocked.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("report.blocked_none")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {r.blocked.map(({ task, by }) => (
                  <li key={task.id} className="py-2 text-sm">
                    <button onClick={() => go({ task: task.id, blocked: "1" })} className="text-left hover:underline">
                      <span className="font-display font-medium tabular-nums">{task.code}</span> {task.name} <span className="text-muted-foreground">· {bizName(task.business_id)}</span>
                    </button>
                    <p className="mt-0.5 text-xs text-status-danger-fg">
                      {t("report.blocked_by", { codes: by.map((d) => d.code).join(", ") })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Review speed */}
          <section className="grid grid-cols-2 rounded-md border border-border bg-surface">
            <div className="border-r border-border p-4">
              <p className="text-xs text-muted-foreground">{t("report.avg_days")}</p>
              {r.avg_days_to_approval === null ? <p className="mt-1 text-3xl text-muted-foreground/50">—</p> : (
                <Num onClick={() => go({ status: "accepted" })} className="mt-1 text-3xl font-semibold">{nf(r.avg_days_to_approval)}</Num>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t("report.avg_days_hint")}</p>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground">{t("report.avg_rounds")}</p>
              {r.avg_change_rounds === null ? <p className="mt-1 text-3xl text-muted-foreground/50">—</p> : (
                <Num onClick={() => go({ status: "accepted" })} className="mt-1 text-3xl font-semibold">{nf(r.avg_change_rounds)}</Num>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t("report.avg_rounds_hint")}</p>
            </div>
          </section>
        </div>
      </div>

    </div>
  );
}
