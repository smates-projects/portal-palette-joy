import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLeadInvestors, useReleaseOpportunity } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { TextDialog } from "./IntakeChecklist";

/** SM view of the Bishops on one lead: who saw the opportunity, who passed, who accepted, and "Liberar oportunidad". */
export function InvestorsSection({ leadId, businessName, readOnly }: { leadId: string; businessName: string; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadInvestors(leadId);
  const release = useReleaseOpportunity();
  const [releasing, setReleasing] = useState(false);

  if (q.isLoading || q.isError || !q.data) return null;
  const { views, bishop, tripartite } = q.data;
  const passed = views.filter((v) => v.decision === "passed");
  const canRelease = !readOnly && bishop && tripartite?.state !== "signed";

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.investors.title")}</h3>
      <div className="space-y-3 rounded-md border border-border p-4 text-sm">
        {bishop ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{t("pipeline.investors.accepted_by", { name: bishop.name, date: formatDate(bishop.accepted_at, lng) })}</p>
            {canRelease && (
              <button onClick={() => setReleasing(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("pipeline.investors.release")}</button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("pipeline.investors.none")}</p>
        )}
        <p>{t("pipeline.investors.viewed", { count: views.length })}</p>
        {views.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {views.map((v) => (
              <li key={v.bishop_user_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="font-medium text-foreground">{v.name}</span>
                <span className="text-muted-foreground">
                  {t("pipeline.investors.viewed_on", { date: formatDate(v.viewed_at, lng) })}
                  {v.decision === "passed" && v.decided_at && ` · ${t("pipeline.investors.passed_on", { date: formatDate(v.decided_at, lng) })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {passed.length > 0 && <p className="text-xs text-muted-foreground">{t("pipeline.investors.passed", { count: passed.length })}</p>}
      </div>
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
