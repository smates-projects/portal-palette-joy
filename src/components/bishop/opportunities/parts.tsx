import { useTranslation } from "react-i18next";
import type { BishopOpportunity, OpportunityDecision } from "@/lib/api/types";
import { Tag } from "@/components/bishop/ui";

/** Whether SM presents the business as ready or still preparing it. */
export function StageTag({ stage }: { stage: BishopOpportunity["stage"] }) {
  const { t } = useTranslation();
  return <Tag tone={stage === "ready" ? "success" : "info"}>{t(`bishop.stage_${stage}`)}</Tag>;
}

/** What the Bishop answered; nothing is shown while he has not decided. */
export function DecisionTag({ decision }: { decision: OpportunityDecision }) {
  const { t } = useTranslation();
  if (decision === "none") return <Tag>{t("bishop.decision_none")}</Tag>;
  return <Tag tone={decision === "interested" ? "success" : "neutral"}>{t(`bishop.decision_${decision}`)}</Tag>;
}
