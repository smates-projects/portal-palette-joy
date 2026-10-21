import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { todayIso } from "@/lib/clock";
import {
  useBottlenecks,
  useBusinesses,
  useNetworkSummary,
  useOffices,
  useOrganizations,
  useRules,
  useTasks,
  useVersions,
} from "@/lib/api/hooks";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { ALL_OFFICES, inOfficeScope, useOfficeScope } from "@/lib/office-scope";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_HOME_ITEMS, buildNetworkAttention, buildOfficeCards, scopeBottlenecks, scopeCounters, sortBottlenecks, stuckBusinesses } from "../logic";
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
  const [scope] = useOfficeScope();
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
  // "Viendo" in the header: one office, Corporate or the whole network. Counters, cards and areas follow it.
  const scoped = scope !== ALL_OFFICES;
  const offices = (officesQ.data ?? []).filter((o) => inOfficeScope(scope, o.office.id));
  const businesses = (bizQ.data ?? []).filter((b) => inOfficeScope(scope, b.office_id));
  const businessIds = new Set(businesses.map((b) => b.id));
  const tasks = (tasksQ.data ?? []).filter((x) => x.status !== "cancelled" && businessIds.has(x.business_id));
  const inProgram = businesses.filter((b) => b.status === "in_program");
  const matrix = buildNetworkMatrix(tasks, versionsQ.data ?? [], inProgram, todayIso(), rulesQ.data?.area_amber_days);
  const cards = buildOfficeCards(offices, matrix);
  const attention = buildNetworkAttention(tasks, businesses, orgsQ.data ?? []);
  const bottlenecks = sortBottlenecks(scopeBottlenecks(bottlenecksQ.data ?? [], scoped ? scope : null, matrix));
  const totals = scopeCounters(summary, offices, scoped, inProgram.length);

  // Conversion is a percentage: it has no plural and shows a dash when no assessment arrived this month. With one
  // office in view the office count says nothing, and a conversion it does not have is left out instead of a dash.
  const counters: { key: string; value: number | null; percent?: boolean }[] = [
    ...(scoped ? [] : [{ key: "offices", value: totals.offices }]),
    { key: "programs", value: totals.programs },
    { key: "leads_month", value: totals.leads_month },
    ...(scoped && totals.conversion === null ? [] : [{ key: "conversion", value: totals.conversion, percent: true }]),
    { key: "ready", value: totals.ready },
  ];
  // The office in view has nothing yet: one plain sentence instead of a row of zeros.
  const scopeEmpty = scoped && totals.programs === 0 && totals.leads_month === 0 && totals.ready === 0;
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
      {scopeEmpty ? (
        <div className="mt-6"><EmptyBox title={t("global.home.scope_empty_title")} body={t("global.home.scope_empty_body")} /></div>
      ) : (
      <div className={cn("mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:divide-x sm:divide-border", counters.length === 5 ? "sm:grid-cols-5" : counters.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        {counters.map((c) => (
          <div key={c.key} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className={cn("font-display text-2xl font-semibold tabular-nums", !c.value ? "text-muted-foreground/40" : "text-foreground")}>
                {c.value === null ? "—" : c.percent ? `${c.value}%` : c.value}
              </span>
              <span className="text-xs font-medium text-foreground">{t(`global.home.counters.${c.key}`, { count: c.value ?? 0 })}</span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* One card per office; with Corporate in view there is no office card to show */}
      {(!scoped || cards.length > 0) && (
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
      )}

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

      {/* Where the network gets stuck: six areas, worst first. Hidden while no business of the view is in program. */}
      {inProgram.length > 0 && (
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
      )}

      <BusinessSheet businessId={businessId} onClose={() => setBusinessId(null)} />
    </div>
  );
}
