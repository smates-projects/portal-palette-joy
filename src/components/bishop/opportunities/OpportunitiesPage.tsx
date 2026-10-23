import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useBishopAgreements, useBishopOpportunities } from "@/lib/api/hooks";
import { OPPORTUNITY_PHASES, type OpportunityPhase } from "@/lib/api/types";
import { formatDate, formatUsd } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, ProvisionalTag, Screen } from "@/components/bishop/ui";
import { sortByDecision } from "@/components/bishop/portfolio/recovery";
import { DecisionTag, PhaseTag, ReviewDay, useOpportunityTitle } from "./parts";
import { FrameworkGate } from "./FrameworkGate";

/** Businesses in entry that SM offers to Bishops, by phase. Without the framework agreement signed, only the gate. */
export function OpportunitiesPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const oppsQ = useBishopOpportunities();
  const agreementsQ = useBishopAgreements();
  const title = useOpportunityTitle();
  const [phase, setPhase] = useState<OpportunityPhase | "">("");

  if (oppsQ.isError || agreementsQ.isError)
    return (
      <Screen ns="bishop" screen="opportunities">
        <ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => { void oppsQ.refetch(); void agreementsQ.refetch(); }} />
      </Screen>
    );
  if (oppsQ.isLoading || agreementsQ.isLoading || !oppsQ.data)
    return (
      <Screen ns="bishop" screen="opportunities">
        <LoadingBlocks rows={2} />
      </Screen>
    );

  const framework = agreementsQ.data?.find((a) => a.kind === "framework");
  if (framework?.contract && framework.state !== "signed")
    return (
      <Screen ns="bishop" screen="opportunities">
        <FrameworkGate contract={framework.contract} />
      </Screen>
    );

  if (oppsQ.data.length === 0)
    return (
      <Screen ns="bishop" screen="opportunities">
        <div className="mt-6"><EmptyBlock title={t("bishop.opportunities.empty_title")} body={t("bishop.opportunities.empty_body")} /></div>
      </Screen>
    );

  const items = sortByDecision(oppsQ.data.filter((o) => !phase || o.phase === phase));

  return (
    <Screen ns="bishop" screen="opportunities">
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label htmlFor="opp-phase" className="text-sm text-muted-foreground">{t("bishop.opportunities.filter_phase")}</label>
        <select id="opp-phase" value={phase} onChange={(e) => setPhase(e.target.value as OpportunityPhase | "")}
          className="h-9 rounded-md border border-input bg-surface px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">{t("bishop.opportunities.all_phases")}</option>
          {OPPORTUNITY_PHASES.map((p) => <option key={p} value={p}>{t(`bishop.phase.${p}`)}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <Panel>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("bishop.opportunities.empty_filter")}</p>
          ) : (
            <>
            {/* Small screens: one card per row with the same data, nothing hidden off-screen. */}
            <ul className="divide-y divide-border md:hidden">
              {items.map((o) => (
                <li key={o.id} className={o.decision === "passed" ? "space-y-2 px-4 py-3 text-muted-foreground" : "space-y-2 px-4 py-3"}>
                  <div className="flex items-start justify-between gap-3">
                    <Link to="/oportunidades/$opportunityId" params={{ opportunityId: o.id }} className="min-w-0 font-medium text-link hover:underline">{title(o)}</Link>
                    <DecisionTag decision={o.decision} />
                  </div>
                  {o.presented_at && <p className="text-xs text-muted-foreground">{t("bishop.opportunities.presented_by_sm", { date: formatDate(o.presented_at, lng) })}</p>}
                  <div className="flex flex-wrap items-center gap-2"><PhaseTag phase={o.phase} /><ReviewDay o={o} /></div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">{t("bishop.opportunities.col_score")}</dt><dd className="font-display text-sm tabular-nums">{o.score}</dd></div>
                    <div><dt className="text-muted-foreground">{t("bishop.opportunities.col_investment")}</dt><dd className="text-sm tabular-nums">{formatUsd(o.investment, lng)}</dd></div>
                    <div><dt className="text-muted-foreground">{t("bishop.opportunities.col_share")}</dt><dd className="text-sm tabular-nums">{o.split_final ? t("bishop.opportunities.share_final", { pct: o.share_stable_pct }) : t("bishop.opportunities.share_values", { year1: o.share_year1_pct, stable: o.share_stable_pct })}</dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_business")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_phase")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunities.col_score")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunities.col_investment")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {/* "Provisional" only while some split shown is still provisional (each row says final or not). */}
                      <span className="inline-flex items-center gap-2">{t("bishop.opportunities.col_share")}{items.some((o) => !o.split_final) && <ProvisionalTag />}</span>
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_decision")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border border-t border-border">
                  {items.map((o) => (
                    <tr key={o.id} className={o.decision === "passed" ? "text-muted-foreground" : undefined}>
                      <td className="px-4 py-3">
                        <Link to="/oportunidades/$opportunityId" params={{ opportunityId: o.id }} className="font-medium text-link hover:underline">
                          {title(o)}
                        </Link>
                        {o.presented_at && <p className="mt-0.5 text-xs text-muted-foreground">{t("bishop.opportunities.presented_by_sm", { date: formatDate(o.presented_at, lng) })}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1"><PhaseTag phase={o.phase} /><ReviewDay o={o} /></div>
                      </td>
                      <td className="px-4 py-3 text-right font-display tabular-nums">{o.score}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatUsd(o.investment, lng)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{o.split_final ? t("bishop.opportunities.share_final", { pct: o.share_stable_pct }) : t("bishop.opportunities.share_values", { year1: o.share_year1_pct, stable: o.share_stable_pct })}</td>
                      <td className="px-4 py-3"><DecisionTag decision={o.decision} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>
        {items.some((o) => !o.split_final) && <p className="mt-3 text-xs text-muted-foreground">{t("bishop.opportunities.share_note")}</p>}
      </div>
    </Screen>
  );
}
