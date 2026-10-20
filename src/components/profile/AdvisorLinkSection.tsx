import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { useCurrentUser } from "@/lib/api/hooks";
import { advisorAssessmentUrl } from "@/lib/leads/advisor";

/**
 * SM people: "Tu link de assessment". The public assessment with their key (?asesor=<slug>): the businesses that
 * complete it through this link show "Assessment completado con <nombre>" in the lead.
 */
export function AdvisorLinkSection() {
  const { t } = useTranslation();
  const { data: me } = useCurrentUser();
  if (!me || (me.role !== "sm_team" && me.role !== "sm_global")) return null;
  const url = advisorAssessmentUrl(me.advisor_slug);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("entry_contracts.advisor.t_copied"));
    } catch {
      toast.error(t("entry_contracts.advisor.t_copy_failed"));
    }
  };

  return (
    <section className="rounded-md border border-border bg-surface px-5 py-4">
      <h2 className="text-base font-semibold">{t("entry_contracts.advisor.title")}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("entry_contracts.advisor.body")}</p>
      {url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input readOnly value={url} aria-label={t("entry_contracts.advisor.title")} onFocus={(e) => e.currentTarget.select()}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-muted px-3 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          <button onClick={() => void copy()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
            <Copy className="h-4 w-4" />{t("entry_contracts.advisor.copy")}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-[4px] border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{t("entry_contracts.advisor.none")}</p>
      )}
    </section>
  );
}
