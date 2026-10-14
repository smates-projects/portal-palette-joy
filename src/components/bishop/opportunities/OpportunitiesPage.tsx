import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useBishopOpportunities } from "@/lib/api/hooks";
import { formatDate, formatUsd } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, ProgressBar, ProvisionalTag, Screen } from "@/components/bishop/ui";
import { sortByDecision } from "@/components/bishop/portfolio/recovery";
import { DecisionTag, StageTag } from "./parts";

/** All the businesses SM presents to the Bishop. Undecided ones come first. */
export function OpportunitiesPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const oppsQ = useBishopOpportunities();

  if (oppsQ.isError)
    return (
      <Screen ns="bishop" screen="opportunities">
        <ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => void oppsQ.refetch()} />
      </Screen>
    );
  if (oppsQ.isLoading || !oppsQ.data)
    return (
      <Screen ns="bishop" screen="opportunities">
        <LoadingBlocks rows={2} />
      </Screen>
    );
  if (oppsQ.data.length === 0)
    return (
      <Screen ns="bishop" screen="opportunities">
        <div className="mt-6"><EmptyBlock title={t("bishop.opportunities.empty_title")} body={t("bishop.opportunities.empty_body")} /></div>
      </Screen>
    );

  const items = sortByDecision(oppsQ.data);

  return (
    <Screen ns="bishop" screen="opportunities">
      <div className="mt-6">
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_business")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_ready")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunities.col_investment")}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-2">{t("bishop.opportunities.col_share")}<ProvisionalTag /></span>
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunities.col_decision")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                {items.map((o) => (
                  <tr key={o.id} className={o.decision === "passed" ? "text-muted-foreground" : undefined}>
                    <td className="px-4 py-3">
                      <Link to="/oportunidades/$opportunityId" params={{ opportunityId: o.id }} className="font-medium text-link hover:underline">
                        {o.business_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{o.industry} · {o.city}, {o.state}</p>
                    </td>
                    <td className="w-60 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StageTag stage={o.stage} />
                        <span className="font-display text-xs tabular-nums">{o.franchisability_pct}%</span>
                      </div>
                      <div className="mt-1.5"><ProgressBar value={o.franchisability_pct} label={t("bishop.portfolio.franchisable")} /></div>
                      <p className="mt-1 text-xs text-muted-foreground">{t("bishop.opportunities.ready_date", { date: formatDate(o.ready_date, lng) })}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(o.investment, lng)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {t("bishop.opportunities.share_values", { year1: o.share_year1_pct, stable: o.share_stable_pct })}
                    </td>
                    <td className="px-4 py-3"><DecisionTag decision={o.decision} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <p className="mt-3 text-xs text-muted-foreground">{t("bishop.opportunities.share_note")}</p>
      </div>
    </Screen>
  );
}
