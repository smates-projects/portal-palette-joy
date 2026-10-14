import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PROGRAM_LENGTH_DAYS } from "@/config/app";
import { PROFIT_SPLIT } from "@/config/economics";
import { useBishopOpportunity, useClearOpportunityDecision, useExpressInterest, usePassOpportunity } from "@/lib/api/hooks";
import type { OpportunityDecision } from "@/lib/api/types";
import { formatDate, formatUsd } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Metric, Panel, primaryButton, ProgressBar, ProvisionalTag, secondaryButton, Screen, Tag } from "@/components/bishop/ui";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DecisionTag, StageTag } from "./parts";

type Answer = Exclude<OpportunityDecision, "none">;

/** Sheet of one business: numbers, 5-year projection, how ready it is, and the Bishop answer (interested / pass, with undo). */
export function OpportunityDetailPage({ opportunityId }: { opportunityId: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const oppQ = useBishopOpportunity(opportunityId);
  const interest = useExpressInterest();
  const pass = usePassOpportunity();
  const clear = useClearOpportunityDecision();
  /** Answer waiting for the confirmation dialog. */
  const [confirming, setConfirming] = useState<Answer | null>(null);

  const back = (
    <Link to="/oportunidades" className="mt-3 inline-flex items-center gap-1 text-sm text-link hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" />{t("bishop.opportunity_detail.back")}
    </Link>
  );

  if (oppQ.isError)
    return (
      <Screen ns="bishop" screen="opportunity_detail">
        {back}
        <ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => void oppQ.refetch()} />
      </Screen>
    );
  if (oppQ.isLoading)
    return (
      <Screen ns="bishop" screen="opportunity_detail">
        {back}
        <LoadingBlocks />
      </Screen>
    );
  const o = oppQ.data;
  if (!o)
    return (
      <Screen ns="bishop" screen="opportunity_detail">
        {back}
        <div className="mt-6"><EmptyBlock title={t("bishop.opportunity_detail.not_found_title")} body={t("bishop.opportunity_detail.not_found_body")} /></div>
      </Screen>
    );

  const money = (n: number) => formatUsd(n, lng);
  const totalForYou = o.projection.reduce((sum, p) => sum + p.bishop, 0);
  const programPct = Math.min(100, Math.round((o.program_day / PROGRAM_LENGTH_DAYS) * 100));
  const busy = interest.isPending || pass.isPending || clear.isPending;
  const fail = () => toast.error(t("bishop.error_action"));

  const undo = () => clear.mutate(o.id, { onSuccess: () => toast.success(t("bishop.opportunity_detail.t_undone")), onError: fail });
  const answer = (decision: Answer) => {
    const mutation = decision === "interested" ? interest : pass;
    mutation.mutate(o.id, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(t(`bishop.opportunity_detail.t_${decision}`, { name: o.business_name }), {
          action: { label: t("bishop.opportunity_detail.undo"), onClick: undo },
        });
      },
      onError: fail,
    });
  };

  return (
    <Screen ns="bishop" screen="opportunity_detail">
      {back}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{o.business_name}</h2>
        <StageTag stage={o.stage} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{o.industry} · {o.city}, {o.state}</p>
      <p className="mt-3 max-w-3xl text-sm">{o.summary}</p>

      <div className="mt-6 space-y-4">
        <section className="grid overflow-hidden rounded-md border border-border bg-surface md:grid-cols-5">
          <Metric
            label={t("bishop.opportunity_detail.verified_revenue")}
            value={o.verified_revenue === null ? t("bishop.opportunity_detail.not_verified") : money(o.verified_revenue)}
            sub={o.verified_revenue === null ? t("bishop.opportunity_detail.not_verified_sub") : t("bishop.opportunity_detail.verified_revenue_sub")}
          />
          <Metric label={t("bishop.opportunity_detail.investment")} value={money(o.investment)} sub={t("bishop.opportunity_detail.investment_sub")} />
          <Metric label={t("bishop.opportunity_detail.share_year1")} badge={<ProvisionalTag />} value={`${o.share_year1_pct}%`} sub={t("bishop.opportunity_detail.share_year1_sub")} />
          <Metric label={t("bishop.opportunity_detail.share_stable")} badge={<ProvisionalTag />} value={`${o.share_stable_pct}%`} sub={t("bishop.opportunity_detail.share_stable_sub")} />
          <Metric label={t("bishop.opportunity_detail.ready_date")} value={formatDate(o.ready_date, lng)} sub={t("bishop.opportunity_detail.ready_date_sub", { day: o.program_day, total: PROGRAM_LENGTH_DAYS })} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0 space-y-4">
            {/* Projection */}
            <Panel title={t("bishop.opportunity_detail.projection_title")} action={<ProvisionalTag />}>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">{t("bishop.opportunity_detail.col_year")}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunity_detail.col_franchises")}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunity_detail.col_revenue")}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunity_detail.col_result")}</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">{t("bishop.opportunity_detail.col_for_you")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {o.projection.map((p) => (
                      <tr key={p.year}>
                        <th scope="row" className="px-4 py-2 font-normal">{t("bishop.opportunity_detail.year", { year: p.year })}</th>
                        <td className="px-4 py-2 text-right tabular-nums">{p.franchises}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(p.revenue)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(p.result)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(p.bishop)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/50">
                      <th scope="row" colSpan={4} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">{t("bishop.opportunity_detail.total_for_you")}</th>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(totalForYou)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="px-4 pb-4 pt-3 text-xs text-muted-foreground">
                {t("bishop.opportunity_detail.projection_note", {
                  year1: o.share_year1_pct,
                  stable: o.share_stable_pct,
                  sm: Math.round(PROFIT_SPLIT.sm_from_year2 * 100),
                })}
              </p>
            </Panel>
          </div>

          <div className="min-w-0 space-y-4">
            {/* What is ready and what is missing */}
            <Panel title={t("bishop.opportunity_detail.ready_title")}>
              <div className="space-y-4 px-4 pb-4">
                <div>
                  <p className="flex justify-between text-sm">
                    <span>{t("bishop.opportunity_detail.franchisable")}</span>
                    <span className="font-display font-semibold tabular-nums">{o.franchisability_pct}%</span>
                  </p>
                  <div className="mt-1"><ProgressBar value={o.franchisability_pct} label={t("bishop.opportunity_detail.franchisable")} /></div>
                </div>
                <div>
                  <p className="flex justify-between text-sm">
                    <span>{t("bishop.opportunity_detail.program")}</span>
                    <span className="font-display font-semibold tabular-nums">{t("bishop.opportunity_detail.program_day", { day: o.program_day, total: PROGRAM_LENGTH_DAYS })}</span>
                  </p>
                  <div className="mt-1"><ProgressBar value={programPct} label={t("bishop.opportunity_detail.program")} /></div>
                </div>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {o.readiness.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{t(`bishop.opportunity_detail.readiness.${item.key}`)}</span>
                      <Tag tone={item.done ? "success" : "neutral"}>{t(item.done ? "bishop.opportunity_detail.readiness_done" : "bishop.opportunity_detail.readiness_pending")}</Tag>
                    </li>
                  ))}
                </ul>
                <p className="rounded-md border border-border px-3 py-2 text-sm">
                  {o.stage === "ready" ? t("bishop.opportunity_detail.ready_yes") : t("bishop.opportunity_detail.ready_no", { date: formatDate(o.ready_date, lng) })}
                </p>
              </div>
            </Panel>

            {/* Answer */}
            <Panel title={t("bishop.opportunity_detail.answer_title")}>
              <div className="px-4 pb-4">
                {o.decision === "none" ? (
                  <>
                    <p className="text-sm text-muted-foreground">{t("bishop.opportunity_detail.answer_help")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => setConfirming("interested")} className={primaryButton}>{t("bishop.opportunity_detail.interested")}</button>
                      <button disabled={busy} onClick={() => setConfirming("passed")} className={secondaryButton}>{t("bishop.opportunity_detail.pass")}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <DecisionTag decision={o.decision} />
                      {o.decided_at && <span className="text-xs text-muted-foreground">{formatDate(o.decided_at, lng)}</span>}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{t(`bishop.opportunity_detail.after_${o.decision}`)}</p>
                    <button disabled={busy} onClick={undo} className={`${secondaryButton} mt-3`}>{t("bishop.opportunity_detail.change_answer")}</button>
                  </>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming && t(`bishop.opportunity_detail.confirm_${confirming}_title`, { name: o.business_name })}</AlertDialogTitle>
            <AlertDialogDescription>{confirming && t(`bishop.opportunity_detail.confirm_${confirming}_body`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("bishop.opportunity_detail.confirm_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // Keep the dialog open until the answer is saved; it closes in onSuccess.
                e.preventDefault();
                if (confirming) answer(confirming);
              }}
            >
              {confirming && t(`bishop.opportunity_detail.confirm_${confirming}_action`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
