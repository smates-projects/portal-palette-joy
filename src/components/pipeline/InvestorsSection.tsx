import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLeadInvestors, usePresentToBishops, useReleaseOpportunity } from "@/lib/api/hooks";
import type { LeadInvestors } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { TextDialog } from "./IntakeChecklist";

/**
 * SM view of the Bishops on one lead: who SM presented it to, who saw it, who passed, who accepted, "Presentar a
 * Bishops" (accepted and nobody took it yet) and "Liberar oportunidad".
 */
export function InvestorsSection({ leadId, businessName, readOnly, canPresent }: { leadId: string; businessName: string; readOnly: boolean; canPresent: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadInvestors(leadId);
  const release = useReleaseOpportunity();
  const [releasing, setReleasing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  if (q.isLoading || q.isError || !q.data) return null;
  const { views, bishop, tripartite } = q.data;
  const presented = q.data.presented ?? [];
  const passed = views.filter((v) => v.decision === "passed");
  const canRelease = !readOnly && bishop && tripartite?.state !== "signed";
  // One row per Bishop SM presented it to or who opened it: presented, viewed, passed or accepted.
  const rows = [...new Set([...presented.map((p) => p.bishop_user_id), ...views.map((v) => v.bishop_user_id)])].map((id) => {
    const p = presented.find((x) => x.bishop_user_id === id);
    const v = views.find((x) => x.bishop_user_id === id);
    return { id, name: p?.name ?? v?.name ?? "", presented_at: p?.presented_at ?? null, view: v ?? null };
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.investors.title")}</h3>
        {canPresent && !readOnly && !bishop && (
          <button onClick={() => setPresenting(true)} className="inline-flex h-8 items-center rounded-[4px] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            {t("pipeline.investors.present")}
          </button>
        )}
      </div>
      <div className="space-y-3 rounded-md border border-border p-4 text-sm">
        {bishop ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{t("pipeline.investors.accepted_by", { name: bishop.name, date: formatDate(bishop.accepted_at, lng) })}</p>
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
                    r.presented_at ? t("pipeline.investors.presented_on", { date: formatDate(r.presented_at, lng) }) : null,
                    r.view ? t("pipeline.investors.viewed_on", { date: formatDate(r.view.viewed_at, lng) }) : r.presented_at ? t("pipeline.investors.not_viewed") : null,
                    r.view?.decision === "passed" && r.view.decided_at ? t("pipeline.investors.passed_on", { date: formatDate(r.view.decided_at, lng) }) : null,
                    bishop?.user_id === r.id ? t("pipeline.investors.accepted_on", { date: formatDate(bishop.accepted_at, lng) }) : null,
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

/** "Presentar a Bishops": active Bishops with the framework agreement signed, as checkboxes. Already presented ones stay ticked and fixed. */
function PresentDialog({ leadId, businessName, investors, onClose }: { leadId: string; businessName: string; investors: LeadInvestors; onClose: () => void }) {
  const { t } = useTranslation();
  const present = usePresentToBishops();
  const already = new Set((investors.presented ?? []).map((p) => p.bishop_user_id));
  const [picked, setPicked] = useState<string[]>([]);
  const candidates = investors.candidates ?? [];
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const submit = () =>
    present.mutate({ id: leadId, bishopUserIds: picked }, {
      onSuccess: () => { onClose(); toast.success(t("pipeline.investors.t_presented", { count: picked.length, name: businessName })); },
      onError: () => toast.error(t("pipeline.t_error")),
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.investors.present_title", { name: businessName })}</DialogTitle>
          <DialogDescription>{t("pipeline.investors.present_body")}</DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("pipeline.investors.present_empty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-[4px] border border-border">
            {candidates.map((c) => (
              <li key={c.user_id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={already.has(c.user_id) || picked.includes(c.user_id)}
                    disabled={already.has(c.user_id)}
                    onChange={() => toggle(c.user_id)}
                  />
                  <span className="flex-1">{c.name}</span>
                  {already.has(c.user_id) && <span className="text-xs text-muted-foreground">{t("pipeline.investors.already_presented")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <SecondaryButton onClick={onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton disabled={picked.length === 0 || present.isPending} onClick={submit}>{t("pipeline.investors.present_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
