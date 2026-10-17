import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSendAssessment } from "@/lib/api/hooks";
import type { LeadWithComputed } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { SecondaryButton } from "@/components/tasks/detail/dialogs";
import { AssessmentBadge } from "./LeadBadges";

/**
 * Business added by hand (referral, event): origin "Manual", no assessment result yet. "Enviar el assessment"
 * simulates the mail and leaves it as "Assessment pendiente" until the result arrives from the public form.
 */
export function ManualLeadSection({ lead, readOnly }: { lead: LeadWithComputed; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const send = useSendAssessment();
  const sent = !!lead.assessment_sent_at;
  return (
    <section className="rounded-md border border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[4px] border border-border bg-surface px-1.5 py-0.5 text-xs font-medium">{t("pipeline.manual.origin")}</span>
          {!lead.result && <AssessmentBadge lead={lead} />}
        </div>
        {!readOnly && !lead.result && !sent && (
          <SecondaryButton
            onClick={() =>
              send.mutate(lead.id, {
                onSuccess: () => toast.success(t("pipeline.manual.t_sent", { name: lead.contact.name })),
                onError: () => toast.error(t("pipeline.t_error")),
              })
            }
          >
            {t("pipeline.manual.send_assessment")}
          </SecondaryButton>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {lead.result
          ? t("pipeline.manual.origin_hint_done")
          : sent
            ? t("pipeline.manual.sent_hint", { date: formatDate(lead.assessment_sent_at!, i18n.language) })
            : t("pipeline.manual.origin_hint")}
      </p>
    </section>
  );
}
