import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLeadInvestors, usePresentToBishops, useReleaseOpportunity } from "@/lib/api/hooks";
import type { LeadInvestors } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { investorRows, presentChoices } from "@/lib/leads/investors";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { TextDialog } from "./IntakeChecklist";

const sectionTitle = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

type Props = { leadId: string; businessName: string; readOnly: boolean; canPresent: boolean };

/**
 * SM view of the Bishops on one lead: who SM presented it to, who saw it, who passed, who accepted, "Presentar a
 * Bishops" (accepted and nobody took it yet) and "Liberar oportunidad". A row the section cannot render stays inside
 * the section (error boundary): the rest of the lead keeps working.
 */
export function InvestorsSection(props: Props) {
  const { t } = useTranslation();
  const q = useLeadInvestors(props.leadId);
  return (
    <SectionErrorBoundary
      resetKey={q.dataUpdatedAt}
      fallback={(retry) => (
        <section className="space-y-2">
          <h3 className={sectionTitle}>{t("pipeline.investors.title")}</h3>
          <div className="rounded-md border border-border p-4 text-sm">
            <p className="text-muted-foreground">{t("pipeline.investors.load_error")}</p>
            <button onClick={() => { retry(); void q.refetch(); }} className="mt-2 text-link hover:underline">{t("pipeline.retry")}</button>
          </div>
        </section>
      )}
    >
      <InvestorsContent {...props} />
    </SectionErrorBoundary>
  );
}

function InvestorsContent({ leadId, businessName, readOnly, canPresent }: Props) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadInvestors(leadId);
  const release = useReleaseOpportunity();
  const [releasing, setReleasing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  if (q.isLoading || q.isError || !q.data) return null;
  const { bishop, tripartite } = q.data;
  const views = q.data.views ?? [];
  const presented = q.data.presented ?? [];
  const passed = views.filter((v) => v.decision === "passed");
  const canRelease = !readOnly && bishop && tripartite?.state !== "signed";
  const rows = investorRows(q.data);
  const date = (iso: string | null) => (iso ? formatDate(iso, lng) : "");

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={sectionTitle}>{t("pipeline.investors.title")}</h3>
        {canPresent && !readOnly && !bishop && (
          <button onClick={() => setPresenting(true)} className="inline-flex h-8 items-center rounded-[4px] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            {t("pipeline.investors.present")}
          </button>
        )}
      </div>
      <div className="space-y-3 rounded-md border border-border p-4 text-sm">
        {bishop ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{t("pipeline.investors.accepted_by", { name: bishop.name, date: date(bishop.accepted_at) })}</p>
            {canRelease && (
              <button onClick={() => setReleasing(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("pipeline.investors.release")}</button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t(presented.length > 0 ? "pipeline.investors.none_presented" : "pipeline.investors.none")}</p>
        )}
        <p>{t("pipeline.investors.summary", { presented: presented.length, viewed: views.length })}</p>
        {rows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-muted-foreground">
                  {[
                    r.presented_at ? t("pipeline.investors.presented_on", { date: date(r.presented_at) }) : null,
                    r.viewed_at ? t("pipeline.investors.viewed_on", { date: date(r.viewed_at) }) : r.presented_at ? t("pipeline.investors.not_viewed") : null,
                    r.passed_at ? t("pipeline.investors.passed_on", { date: date(r.passed_at) }) : null,
                    r.accepted_at ? t("pipeline.investors.accepted_on", { date: date(r.accepted_at) }) : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {passed.length > 0 && <p className="text-xs text-muted-foreground">{t("pipeline.investors.passed", { count: passed.length })}</p>}
      </div>
      {presenting && <PresentDialog leadId={leadId} businessName={businessName} investors={q.data} onClose={() => setPresenting(false)} />}
      {releasing && (
        <TextDialog
          title={t("pipeline.investors.release_title", { name: businessName })}
          body={t("pipeline.investors.release_body")}
          label={t("pipeline.investors.release_label")}
          confirm={t("pipeline.investors.release_confirm")}
          required={t("pipeline.reason_required")}
          pending={release.isPending}
          onClose={() => setReleasing(false)}
          onConfirm={(reason) =>
            release.mutate({ id: leadId, reason }, {
              onSuccess: () => { setReleasing(false); toast.success(t("pipeline.investors.t_released", { name: businessName })); },
              onError: () => toast.error(t("pipeline.t_error")),
            })
          }
        />
      )}
    </section>
  );
}

/**
 * "Presentar a Bishops": the API's candidates as checkboxes, one per Bishop id. Already presented ones stay ticked and
 * fixed; one without the framework agreement signed cannot be ticked. "Presentar" waits for at least one new tick.
 */
function PresentDialog({ leadId, businessName, investors, onClose }: { leadId: string; businessName: string; investors: LeadInvestors; onClose: () => void }) {
  const { t } = useTranslation();
  const present = usePresentToBishops();
  const [picked, setPicked] = useState<string[]>([]);
  const choices = presentChoices(investors);
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const submit = () => {
    if (picked.length === 0) return;
    present.mutate({ id: leadId, bishopUserIds: picked }, {
      onSuccess: () => { onClose(); toast.success(t("pipeline.investors.t_presented", { count: picked.length, name: businessName })); },
      onError: () => toast.error(t("pipeline.t_error")),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.investors.present_title", { name: businessName })}</DialogTitle>
          <DialogDescription>{t("pipeline.investors.present_body")}</DialogDescription>
        </DialogHeader>
        {choices.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("pipeline.investors.present_empty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-[4px] border border-border">
            {choices.map((c) => {
              const inputId = `present-bishop-${c.user_id}`;
              const fixed = c.state !== "available";
              return (
                <li key={c.user_id}>
                  <label htmlFor={inputId} className={`flex items-center gap-3 px-3 py-2 text-sm ${fixed ? "cursor-default" : "cursor-pointer"}`}>
                    <input
                      id={inputId}
                      type="checkbox"
                      value={c.user_id}
                      className="h-4 w-4 accent-primary"
                      checked={c.state === "already" || picked.includes(c.user_id)}
                      disabled={fixed}
                      onChange={() => toggle(c.user_id)}
                    />
                    <span className="flex-1">{c.name}</span>
                    {c.state === "already" && <span className="text-xs text-muted-foreground">{t("pipeline.investors.already_presented")}</span>}
                    {c.state === "no_framework" && <span className="text-xs text-muted-foreground">{t("pipeline.investors.no_framework")}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {/* Why a Bishop may be missing or greyed: his framework agreement is not signed by both parties yet. */}
        <p className="text-xs text-muted-foreground">{t("pipeline.investors.framework_explainer")}</p>
        <DialogFooter>
          <SecondaryButton onClick={onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton disabled={picked.length === 0 || present.isPending} onClick={submit}>{t("pipeline.investors.present_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
