import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle, FileText, ShieldAlert } from "lucide-react";
import { PROFIT_SPLIT } from "@/config/economics";
import { useAcceptOpportunity, useBishopAgreements, useBishopOpportunity, useClearOpportunityDecision, useCurrentUser, usePassOpportunity } from "@/lib/api/hooks";
import { acceptBlock } from "@/lib/leads/opportunity";
import { formatDate, formatUsd } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Metric, Panel, primaryButton, ProvisionalTag, secondaryButton, Screen, SplitTag, Tag } from "@/components/bishop/ui";
import type { Contract } from "@/lib/api/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BlockBadge } from "@/components/pipeline/LeadBadges";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { contractExplainerIn, contractLanguageOf, hasContractText } from "@/lib/contracts/language";
import { DecisionTag, PhaseTag, ReviewDay, useOpportunityTitle } from "./parts";

/** One opportunity: owner's declaration, SM's verified facts, entry checklist, projection and "Aceptar oportunidad". */
export function OpportunityDetailPage({ opportunityId }: { opportunityId: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const oppQ = useBishopOpportunity(opportunityId);
  const agreementsQ = useBishopAgreements();
  const me = useCurrentUser().data;
  const accept = useAcceptOpportunity();
  const pass = usePassOpportunity();
  const clear = useClearOpportunityDecision();
  const title = useOpportunityTitle();
  const [confirming, setConfirming] = useState(false);
  const [signing, setSigning] = useState<Contract | null>(null);
  const [reading, setReading] = useState<Contract | null>(null);

  const back = (
    <Link to="/oportunidades" className="mt-3 inline-flex items-center gap-1 text-sm text-link hover:underline">
      <ArrowLeft className="h-3.5 w-3.5" />{t("bishop.opportunity_detail.back")}
    </Link>
  );

  if (oppQ.isError)
    return <Screen ns="bishop" screen="opportunity_detail">{back}<ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => void oppQ.refetch()} /></Screen>;
  if (oppQ.isLoading) return <Screen ns="bishop" screen="opportunity_detail">{back}<LoadingBlocks /></Screen>;
  const o = oppQ.data;
  if (!o)
    return (
      <Screen ns="bishop" screen="opportunity_detail">
        {back}
        <div className="mt-6"><EmptyBlock title={t("bishop.opportunity_detail.not_found_title")} body={t("bishop.opportunity_detail.not_found_body")} /></div>
      </Screen>
    );

  const money = (n: number) => formatUsd(n, lng);
  const frameworkSigned = agreementsQ.data?.find((a) => a.kind === "framework")?.state === "signed";
  const block = acceptBlock(o.phase, frameworkSigned);
  const name = title(o);
  const totalForYou = o.projection.reduce((sum, p) => sum + p.bishop, 0);
  const fail = () => toast.error(t("bishop.error_action"));
  // The Acuerdo de Vinculación comes first, then the Operating Agreement: the first one still waiting for him.
  const pendingForMe = (c: Contract | null | undefined) => !!c?.signers.some((s) => s.party === "bishop" && (s.status === "sent" || s.status === "opened"));
  const toSign = [o.binding ?? null, o.tripartite].find(pendingForMe) ?? null;
  const contractsShown = [o.binding ?? null, o.tripartite].filter((c): c is Contract => !!c);
  /** The explainer's first paragraph in the app language (Spanish when the English one is missing). */
  const firstExplainerLine = (c: Contract) => contractExplainerIn(c, contractLanguageOf(lng)).value?.paragraphs[0] ?? null;

  const doAccept = () =>
    accept.mutate(o.id, {
      onSuccess: () => { setConfirming(false); toast.success(t("bishop.opportunity_detail.t_accepted")); },
      onError: (e) => { setConfirming(false); toast.error(e instanceof Error && e.message === "taken" ? t("bishop.opportunity_detail.t_taken") : t("bishop.error_action")); },
    });
  const undo = () => clear.mutate(o.id, { onSuccess: () => toast.success(t("bishop.opportunity_detail.t_undone")), onError: fail });
  const doPass = () =>
    pass.mutate(o.id, {
      onSuccess: () => toast.success(t("bishop.opportunity_detail.t_passed", { name }), { action: { label: t("bishop.opportunity_detail.undo"), onClick: undo } }),
      onError: fail,
    });

  const check = (done: boolean, label: string, extra?: string) => (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2">
        {done ? <CheckCircle2 className="h-4 w-4 text-status-success-fg" aria-hidden /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />}
        {label}
      </span>
      {extra && <span className="text-xs tabular-nums text-muted-foreground">{extra}</span>}
    </li>
  );

  return (
    <Screen ns="bishop" screen="opportunity_detail">
      {back}
      <p className="mt-4 flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("bishop.opportunity_detail.reminder")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{name}</h2>
        <PhaseTag phase={o.phase} />
        <ReviewDay o={o} />
        <DecisionTag decision={o.decision} />
      </div>
      {o.owner_name && <p className="mt-1 text-sm text-muted-foreground">{t("bishop.opportunity_detail.owner", { name: o.owner_name })}</p>}

      {/* One primary action */}
      <div className="mt-4 rounded-md border border-border bg-surface p-4">
        {o.phase === "in_review" || o.phase === "available" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setConfirming(true)} disabled={block !== null || accept.isPending} className={primaryButton}>
                {t("bishop.opportunity_detail.accept")}
              </button>
              {o.decision === "passed" ? (
                <button onClick={undo} disabled={clear.isPending} className={secondaryButton}>{t("bishop.opportunity_detail.change_answer")}</button>
              ) : (
                <button onClick={doPass} disabled={pass.isPending} className={secondaryButton}>{t("bishop.opportunity_detail.pass")}</button>
              )}
            </div>
            {block && <p className="mt-2 text-xs text-muted-foreground">{t(`bishop.opportunity_detail.block_${block}`)}</p>}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{t(`bishop.opportunity_detail.next_${o.phase}`)}</p>
            {toSign && (
              <button onClick={() => setSigning(toSign)} className={primaryButton}>
                {t(toSign.kind === "binding" ? "bishop.opportunity_detail.sign_binding" : "bishop.opportunity_detail.sign_tripartite")}
              </button>
            )}
            {o.phase === "funds_pending" && <Link to="/acuerdos" className={primaryButton}>{t("funds.bishop.go_to_funds")}</Link>}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <section className="grid overflow-hidden rounded-md border border-border bg-surface md:grid-cols-4">
          <Metric label={t("bishop.opportunity_detail.investment")} value={money(o.investment)} sub={t("bishop.opportunity_detail.investment_sub")} />
          {o.split_final ? (
            // Definitive: his participation in the franchisor, fixed in the validation (one number, not two years).
            <Metric label={t("bishop.opportunity_detail.share_final")} badge={<SplitTag final />} value={`${o.share_stable_pct}%`} sub={t("bishop.opportunity_detail.share_final_sub")} />
          ) : (
            <>
              <Metric label={t("bishop.opportunity_detail.share_year1")} badge={<ProvisionalTag />} value={`${o.share_year1_pct}%`} sub={t("bishop.opportunity_detail.share_year1_sub")} />
              <Metric label={t("bishop.opportunity_detail.share_stable")} badge={<ProvisionalTag />} value={`${o.share_stable_pct}%`} sub={t("bishop.opportunity_detail.share_stable_sub")} />
            </>
          )}
          <Metric label={t("bishop.opportunity_detail.score")} value={o.score} sub={t(`pipeline.bands.${o.band}`)} />
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0 space-y-4">
            {/* Declared by the owner */}
            <Panel title={t("bishop.opportunity_detail.assessment_title")} action={<Tag tone="neutral">{t("bishop.opportunity_detail.declared_tag")}</Tag>}>
              <div className="space-y-4 px-4 pb-4">
                <p className="font-semibold">{t(`pipeline.detail.headline.${o.band}`)}</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {o.result.blocks.map((b) => (
                    <li key={b.key} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span>{t(`pipeline.blocks.${b.key}`)}</span><BlockBadge status={b.status} />
                    </li>
                  ))}
                </ul>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.strengths")}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{o.result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.priorities")}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{o.result.priorities.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-3 text-sm">
                  {([
                    ["pipeline.detail.activity", o.declared.activity],
                    ["pipeline.revenue", t(`pipeline.revenue_ranges.${o.declared.revenue_range}`)],
                    ["pipeline.detail.margin", t(`pipeline.margin_ranges.${o.declared.margin_range ?? "unknown"}`)],
                    ["pipeline.detail.team", t(`pipeline.team_ranges.${o.declared.team_range}`)],
                    ["pipeline.detail.years", t(`pipeline.years_ranges.${o.declared.years_range}`)],
                    ["pipeline.detail.active_clients", t(o.declared.has_active_clients ? "pipeline.detail.yes" : "pipeline.detail.no")],
                  ] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-muted-foreground">{t(k)}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
                {o.know_how_example && (
                  <div className="rounded-md border-l-2 border-gold bg-muted/60 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bishop.opportunity_detail.know_how")}</p>
                    <p className="mt-1.5 text-sm">“{o.know_how_example}”</p>
                  </div>
                )}
              </div>
            </Panel>

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
                {t("bishop.opportunity_detail.projection_note", { year1: o.share_year1_pct, stable: o.share_stable_pct, sm: Math.round(PROFIT_SPLIT.sm_from_year2 * 100) })}
              </p>
            </Panel>
          </div>

          <div className="min-w-0 space-y-4">
            {/* Verified by SM */}
            <Panel title={t("bishop.opportunity_detail.verified_title")} action={<Tag tone="success">{t("bishop.opportunity_detail.verified_tag")}</Tag>}>
              <ul className="divide-y divide-border border-t border-border">
                {o.verified.map((v) => (
                  <li key={v.name} className="px-4 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">{v.name}</p>
                    <p className={v.fact ? "font-medium" : "text-muted-foreground"}>{v.fact ?? t("bishop.opportunity_detail.pending_verify")}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            {/* Entry checklist */}
            <Panel title={t("bishop.opportunity_detail.checklist_title")}>
              <div className="px-4 pb-4">
                <ul className="divide-y divide-border rounded-md border border-border">
                  {check(o.checklist.nda_signed, t("bishop.opportunity_detail.c_nda"))}
                  {check(o.checklist.mou_signed, t("bishop.opportunity_detail.c_mou"))}
                  {check(o.checklist.uploaded >= o.checklist.required_total, t("bishop.opportunity_detail.c_uploaded"), `${o.checklist.uploaded} / ${o.checklist.required_total}`)}
                  {check(o.checklist.accepted >= o.checklist.required_total, t("bishop.opportunity_detail.c_accepted"), `${o.checklist.accepted} / ${o.checklist.required_total}`)}
                  {check(o.checklist.approved, t("bishop.opportunity_detail.c_approved"))}
                </ul>
                {o.review && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {o.review.status === "paused" ? t("bishop.review_paused_long") : t("bishop.review_long", { day: Math.max(o.review.day, 1), total: o.review.total })}
                  </p>
                )}
              </div>
            </Panel>

            {/* After accepting: files and the tripartite contract */}
            {o.files.length > 0 && (
              <Panel title={t("bishop.opportunity_detail.files_title")}>
                <ul className="divide-y divide-border border-t border-border">
                  {o.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span className="min-w-0 truncate">{f.name}</span>
                      <button onClick={() => toast.info(t("bishop.agreements.t_download", { file: f.file_name }))} className={secondaryButton}>
                        <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.opportunity_detail.open_file")}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="px-4 py-2 text-xs text-muted-foreground">{t("bishop.opportunity_detail.files_note")}</p>
              </Panel>
            )}
            {contractsShown.map((c) => (
              <Panel key={c.id} title={c.name} action={c.sign_by && c.state !== "signed" ? <span className="text-xs text-muted-foreground">{t("entry_contracts.checklist.sign_by", { date: formatDate(c.sign_by, lng) })}</span> : undefined}>
                {c.kind === "binding" && firstExplainerLine(c) && <p className="px-4 pb-2 text-xs text-muted-foreground">{firstExplainerLine(c)}</p>}
                {hasContractText(c) && (
                  <div className="px-4 pb-3">
                    <button onClick={() => setReading(c)} aria-label={t("contracts_lang.read_for", { name: c.name })} className={secondaryButton}><FileText className="mr-1.5 h-3.5 w-3.5" />{t("contracts_lang.read")}</button>
                  </div>
                )}
                <ul className="divide-y divide-border border-t border-border">
                  {c.signers.map((s) => (
                    <li key={s.name + s.party} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                      <span>{s.name}</span>
                      <Tag tone={s.status === "signed" ? "success" : s.status === "declined" ? "danger" : "neutral"}>
                        {t(`intake.signer_status.${s.status ?? "sent"}`)}{s.signed_at ? ` · ${formatDate(s.signed_at, lng)}` : ""}
                      </Tag>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={(v) => !v && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bishop.opportunity_detail.confirm_title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("bishop.opportunity_detail.confirm_body", { amount: money(o.investment) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("bishop.opportunity_detail.confirm_cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doAccept(); }} disabled={accept.isPending}>{t("bishop.opportunity_detail.confirm_action")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {signing && <DocuSealSigner contract={signing} party="bishop" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      {reading && <SignedContractDialog contract={reading} onClose={() => setReading(null)} />}
    </Screen>
  );
}
