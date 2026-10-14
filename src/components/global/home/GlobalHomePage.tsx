import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TODAY } from "@/config/app";
import {
  useBottlenecks,
  useBusinesses,
  useFranchisabilityMany,
  useNetworkSummary,
  useOffices,
  useOrganizations,
  useRules,
  useTasks,
  useVersions,
} from "@/lib/api/hooks";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_HOME_ITEMS, buildNetworkAttention, buildOfficeCards, sortBottlenecks, stuckBusinesses } from "../logic";
import { BusinessSheet, EmptyBox, ErrorBox, GlobalHeader, HealthBadge } from "../shared";

/** Inicio de SM Global: how the whole network is doing, which offices need a look and where work gets stuck. */
export function GlobalHomePage() {
  const { t } = useTranslation();
  const summaryQ = useNetworkSummary();
  const officesQ = useOffices();
  const bottlenecksQ = useBottlenecks();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const versionsQ = useVersions();
  const orgsQ = useOrganizations();
  const rulesQ = useRules();
  const programIds = (bizQ.data ?? []).filter((b) => b.status === "in_program").map((b) => b.id);
  const franchisabilityQ = useFranchisabilityMany(programIds);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const queries = [summaryQ, officesQ, bottlenecksQ, tasksQ, bizQ, versionsQ, orgsQ, rulesQ];
  const header = <GlobalHeader question={t("global.home.question")} />;

  if (queries.some((q) => q.isError))
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => queries.forEach((q) => void q.refetch())} /></div>
      </div>
    );
  if (queries.some((q) => q.isLoading))
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <Skeleton className="mt-6 h-[76px] rounded-md" />
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-md" />)}</div>
      </div>
    );

  const summary = summaryQ.data!;
  const offices = officesQ.data ?? [];
  const businesses = bizQ.data ?? [];
  const tasks = (tasksQ.data ?? []).filter((x) => x.status !== "cancelled");
  const inProgram = businesses.filter((b) => b.status === "in_program");
  const matrix = buildNetworkMatrix(tasks, versionsQ.data ?? [], inProgram, TODAY, rulesQ.data?.area_amber_days);
  const cards = buildOfficeCards(offices, matrix);
  const attention = buildNetworkAttention(tasks, businesses, orgsQ.data ?? []);
  const bottlenecks = sortBottlenecks(bottlenecksQ.data ?? []);
  const ready = franchisabilityQ.data.filter((f) => f.is_ready).length;

  const counters: { key: string; value: number; danger?: boolean }[] = [
    { key: "offices", value: summary.offices },
    { key: "programs", value: summary.programs },
    { key: "open_leads", value: summary.open_leads },
    { key: "ready", value: ready },
    { key: "overdue", value: summary.overdue_tasks, danger: true },
  ];
  const reasonText = (a: (typeof attention)[number]) =>
    a.reason === "overdue"
      ? t("tasks.overdue_days", { count: a.days })
      : a.reason === "stale"
        ? t("sm.reason_stale", { count: a.days })
        : t("sm.reason_long_block", { codes: a.blockers.map((b) => b.code).join(", ") });
  const shownAttention = showAllAttention ? attention : attention.slice(0, MAX_HOME_ITEMS);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {header}

      {/* Counters */}
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-5 sm:divide-x sm:divide-border">
        {counters.map((c) => (
          <div key={c.key} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className={cn("font-display text-2xl font-semibold tabular-nums", c.value === 0 ? "text-muted-foreground/40" : c.danger ? "text-status-danger-fg" : "text-foreground")}>{c.value}</span>
              <span className="text-xs font-medium text-foreground">{t(`global.home.counters.${c.key}`, { count: c.value })}</span>
            </div>
          </div>
        ))}
      </div>

      {/* One card per office */}
      <section className="mt-6" aria-labelledby="home-offices">
        <h2 id="home-offices" className="text-sm font-semibold">{t("global.home.offices_title")}</h2>
        {cards.length === 0 ? (
          <div className="mt-3"><EmptyBox title={t("global.home.offices_empty_title")} body={t("global.home.offices_empty_body")} /></div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Link
                key={c.summary.office.id}
                to="/oficinas/$officeId"
                params={{ officeId: c.summary.office.id }}
                aria-label={t("global.home.open_office", { name: c.summary.office.name })}
                className="block rounded-md border border-border bg-surface p-4 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">{c.summary.office.name}</h3>
                    <p className="text-xs text-muted-foreground">{c.summary.office.city}</p>
                  </div>
                  {c.summary.stats.programs > 0 && <HealthBadge health={c.health} />}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("global.home.card_programs")}</dt>
                    <dd className="font-display text-lg font-semibold tabular-nums">{c.summary.stats.programs}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("global.home.card_overdue")}</dt>
                    <dd className={cn("font-display text-lg font-semibold tabular-nums", c.overdue > 0 ? "text-status-danger-fg" : "text-muted-foreground/40")}>{c.overdue}</dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  {c.worst
                    ? t("global.home.worst_line", { business: c.worst.business_name, count: c.worst.overdue, area: t(`areas.${c.worst.area}`) })
                    : t("global.home.worst_none")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Needs attention: 5 rows and "Ver todo" */}
      <section className="mt-6 rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("global.home.attention_title")}</h2>
          <span className="text-xs text-muted-foreground">{t("sm.attention_count", { count: attention.length })}</span>
        </div>
        {attention.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("global.home.attention_empty")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shownAttention.map((a) => (
                <li key={a.task.id}>
                  <button onClick={() => setBusinessId(a.task.business_id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/60">
                    <span className="w-12 shrink-0 font-display text-xs font-semibold tabular-nums">{a.task.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{a.task.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.business_name} · {a.office_name}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs", a.reason === "stale" ? "text-status-warning-fg" : "text-status-danger-fg")}>{reasonText(a)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {attention.length > MAX_HOME_ITEMS && (
              <button onClick={() => setShowAllAttention((v) => !v)} className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:underline">
                {showAllAttention ? t("global.home.see_less") : t("sm.see_all", { count: attention.length })}
              </button>
            )}
          </>
        )}
      </section>

      {/* Where the network gets stuck: six areas, worst first */}
      <section className="mt-6 rounded-md border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("global.home.stuck_title")}</h2>
        </div>
        <ul className="divide-y divide-border">
          {bottlenecks.map((b) => {
            const stuck = stuckBusinesses(matrix, b.area);
            const open = openArea === b.area;
            const stuckNow = b.overdue > 0;
            return (
              <li key={b.area}>
                <button
                  onClick={() => setOpenArea(open ? null : b.area)}
                  disabled={!stuckNow}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground", !stuckNow && "opacity-30")} />}
                  <span className="text-sm">
                    {stuckNow
                      ? t("global.home.stuck_line", { area: t(`areas.${b.area}`), red: b.red_businesses, total: inProgram.length, count: b.overdue })
                      : t("global.home.stuck_ok", { area: t(`areas.${b.area}`) })}
                  </span>
                </button>
                {open && (
                  <ul className="border-t border-border bg-muted/40 px-4 py-2">
                    {stuck.map((s) => (
                      <li key={s.business.id}>
                        <button onClick={() => setBusinessId(s.business.id)} className="flex w-full items-center justify-between gap-3 py-1.5 pl-7 text-left text-sm hover:underline">
                          <span>{s.business.name} <span className="text-xs text-muted-foreground">· {orgsQ.data?.find((o) => o.id === s.business.office_id)?.name}</span></span>
                          <span className="text-xs text-status-danger-fg">{t("global.home.stuck_business", { count: s.overdue })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{t("global.home.stuck_hint")}</p>
      </section>

      <BusinessSheet businessId={businessId} onClose={() => setBusinessId(null)} />
    </div>
  );
}
