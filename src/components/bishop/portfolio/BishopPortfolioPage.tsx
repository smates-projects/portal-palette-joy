import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBishopOpportunities, useBishopPortfolio } from "@/lib/api/hooks";
import type { BishopInvestment, BishopOpportunity } from "@/lib/api/types";
import { formatDate, formatNumber, formatUsd } from "@/lib/format";
import { DecisionTag, StageTag } from "@/components/bishop/opportunities/parts";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Metric, Panel, ProgressBar, ProvisionalTag, Screen } from "@/components/bishop/ui";
import { buildRecoveryRows, formatMonth, recoveryGap, sortByDecision } from "./recovery";

const MAX_OPPORTUNITIES = 5;

/** Latest payback month among the investments, null when any of them is not recovering. */
function latestPayback(investments: BishopInvestment[]): string | null {
  const months = investments.map((i) => i.estimated_payback_month);
  return months.length === 0 || months.some((m) => m === null) ? null : (months as string[]).sort().at(-1)!;
}

/** Home of the Business Bishop: how much he invested, how much came back and which businesses SM presents next. */
export function BishopPortfolioPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const portfolioQ = useBishopPortfolio();
  const oppsQ = useBishopOpportunities();

  if (portfolioQ.isError || oppsQ.isError)
    return (
      <Screen ns="bishop" screen="portfolio">
        <ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => { void portfolioQ.refetch(); void oppsQ.refetch(); }} />
      </Screen>
    );
  if (portfolioQ.isLoading || oppsQ.isLoading || !portfolioQ.data)
    return (
      <Screen ns="bishop" screen="portfolio">
        <LoadingBlocks />
      </Screen>
    );

  const { investments, totals } = portfolioQ.data;
  const opportunities = sortByDecision((oppsQ.data ?? []).filter((o) => o.decision !== "passed"));
  const shownOpportunities = opportunities.slice(0, MAX_OPPORTUNITIES);

  if (investments.length === 0)
    return (
      <Screen ns="bishop" screen="portfolio">
        <div className="mt-6 space-y-4">
          <EmptyBlock title={t("bishop.portfolio.empty_title")} body={t("bishop.portfolio.empty_body")} />
          <OpportunitiesPanel total={opportunities.length} shown={shownOpportunities} lng={lng} />
        </div>
      </Screen>
    );

  const rows = buildRecoveryRows(investments);
  const gap = recoveryGap(rows);
  const shares = [...new Set(investments.map((i) => i.current_share_pct))].sort((a, b) => b - a);
  const payback = latestPayback(investments);
  const money = (n: number) => formatUsd(n, lng);
  const compact = (n: number) => formatNumber(n, lng, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

  return (
    <Screen ns="bishop" screen="portfolio">
      <div className="mt-6 space-y-4">
        {/* 1. Totals */}
        <section className="grid overflow-hidden rounded-md border border-border bg-surface md:grid-cols-4">
          <Metric label={t("bishop.portfolio.invested")} value={money(totals.invested)} sub={t("bishop.portfolio.invested_sub", { count: investments.length })} />
          <Metric
            label={t("bishop.portfolio.recovered")}
            value={money(totals.recovered)}
            sub={t("bishop.portfolio.recovered_sub", { pct: totals.recovered_pct })}
          />
          <Metric
            label={t("bishop.portfolio.share")}
            badge={<ProvisionalTag />}
            value={shares.map((s) => `${s}%`).join(" / ")}
            sub={t("bishop.portfolio.share_sub")}
          />
          <Metric
            label={t("bishop.portfolio.payback")}
            value={payback ? formatMonth(payback, lng) : t("bishop.portfolio.payback_none")}
            sub={payback ? t("bishop.portfolio.payback_sub") : t("bishop.portfolio.payback_none_sub")}
          />
        </section>

        {/* 2. Projected vs actual recovery */}
        <Panel title={t("bishop.portfolio.chart_title")}>
          <div className="px-4 pb-4">
            <p className="text-sm text-muted-foreground">
              {gap === null
                ? t("bishop.portfolio.chart_no_data")
                : gap >= 0
                  ? t("bishop.portfolio.chart_ahead", { amount: money(gap) })
                  : t("bishop.portfolio.chart_behind", { amount: money(-gap) })}
            </p>
            <div role="img" aria-label={t("bishop.portfolio.chart_aria")} className="mt-3 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m, lng)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tickFormatter={compact} width={56} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    labelFormatter={(m: string) => formatMonth(m, lng)}
                    formatter={(value: number, name: string) => [money(value), name]}
                    contentStyle={{ border: "1px solid var(--border)", borderRadius: 4, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="projected" name={t("bishop.portfolio.series_projected")} stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual" name={t("bishop.portfolio.series_actual")} stroke="var(--brand-blue)" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-primary" />{t("bishop.portfolio.series_actual")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-muted-foreground" />{t("bishop.portfolio.series_projected")}</span>
            </div>
            {/* Same numbers as a table, for screen readers and for anyone who wants the exact figures. */}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-link hover:underline">{t("bishop.portfolio.chart_table")}</summary>
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{t("bishop.portfolio.col_month")}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t("bishop.portfolio.series_projected")}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t("bishop.portfolio.series_actual")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.month}>
                        <th scope="row" className="px-3 py-1.5 font-normal">{formatMonth(r.month, lng)}</th>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(r.projected)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.actual === null ? t("bishop.portfolio.no_data") : money(r.actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <p className="mt-3 text-xs text-muted-foreground">{t("bishop.portfolio.chart_note")}</p>
          </div>
        </Panel>

        {/* 3. Investments */}
        <Panel title={t("bishop.portfolio.investments_title")}>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.portfolio.col_business")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.portfolio.col_invested")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.portfolio.col_recovered")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.portfolio.col_share")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.portfolio.col_franchises")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.portfolio.col_payback")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investments.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{i.business_name}</p>
                      <p className="text-xs text-muted-foreground">{t("bishop.portfolio.since", { date: formatDate(i.invested_at, lng) })}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(i.invested)}</td>
                    <td className="w-56 px-4 py-3">
                      <p className="tabular-nums">{money(i.recovered)} <span className="text-xs text-muted-foreground">({i.recovered_pct}%)</span></p>
                      <div className="mt-1"><ProgressBar value={i.recovered_pct} label={t("bishop.portfolio.recovered")} /></div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{i.current_share_pct}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">{i.franchises}</td>
                    <td className="px-4 py-3">{i.estimated_payback_month ? formatMonth(i.estimated_payback_month, lng) : t("bishop.portfolio.payback_none")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 4. Opportunities */}
        <OpportunitiesPanel total={opportunities.length} shown={shownOpportunities} lng={lng} />
      </div>
    </Screen>
  );
}

/** Up to five businesses SM presents, with how ready they are to franchise. The rest is one click away. */
function OpportunitiesPanel({ total, shown, lng }: { total: number; shown: BishopOpportunity[]; lng: string }) {
  const { t } = useTranslation();
  return (
    <Panel title={t("bishop.portfolio.opps_title")}>
      {shown.length === 0 ? (
        <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("bishop.portfolio.opps_empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <Link to="/oportunidades/$opportunityId" params={{ opportunityId: o.id }} className="text-sm font-medium text-link hover:underline">
                    {o.business_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{o.industry} · {o.city}, {o.state}</p>
                </div>
                <div className="w-44">
                  <p className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("bishop.portfolio.franchisable")}</span>
                    <span className="font-display tabular-nums text-foreground">{o.franchisability_pct}%</span>
                  </p>
                  <div className="mt-1"><ProgressBar value={o.franchisability_pct} label={t("bishop.portfolio.franchisable")} /></div>
                </div>
                <div className="flex w-52 flex-wrap gap-1.5">
                  <StageTag stage={o.stage} />
                  {o.decision !== "none" && <DecisionTag decision={o.decision} />}
                </div>
                <p className="w-24 text-right text-sm tabular-nums">{formatUsd(o.investment, lng)}</p>
              </li>
            ))}
          </ul>
          <Link to="/oportunidades" className="block border-t border-border px-4 py-2.5 text-sm text-link hover:bg-muted">
            {t("bishop.portfolio.see_all", { count: total })}
          </Link>
        </>
      )}
    </Panel>
  );
}
