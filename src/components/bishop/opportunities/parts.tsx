import { useTranslation } from "react-i18next";
import type { BishopOpportunity, OpportunityDecision, OpportunityPhase } from "@/lib/api/types";
import { Tag, type Tone } from "@/components/bishop/ui";

const PHASE_TONE: Record<OpportunityPhase, Tone> = {
  in_review: "neutral", available: "info", accepted_by_you: "success", in_contract: "warning", funds_pending: "warning",
};

/** Where the opportunity is, as this Bishop sees it. */
export function PhaseTag({ phase }: { phase: OpportunityPhase }) {
  const { t } = useTranslation();
  return <Tag tone={PHASE_TONE[phase]}>{t(`bishop.phase.${phase}`)}</Tag>;
}

/** Only "No me interesa" is an answer; nothing shown while there is none. */
export function DecisionTag({ decision }: { decision: OpportunityDecision }) {
  const { t } = useTranslation();
  if (decision === "none") return null;
  return <Tag tone="neutral">{t("bishop.decision_passed")}</Tag>;
}

/** Commercial name once accepted; before that, "Rubro en Ciudad, ST". */
export function useOpportunityTitle() {
  const { t } = useTranslation();
  return (o: Pick<BishopOpportunity, "business_name" | "industry" | "city" | "state">) =>
    o.business_name ?? t("bishop.alias", { industry: t(`pipeline.industries.${o.industry}`), city: o.city, state: o.state });
}

/** "Día 6 de 15" while SM reviews the documents. */
export function ReviewDay({ o }: { o: Pick<BishopOpportunity, "review"> }) {
  const { t } = useTranslation();
  if (!o.review) return null;
  if (o.review.status === "paused") return <span className="text-xs text-muted-foreground">{t("bishop.review_paused")}</span>;
  if (o.review.status === "waiting_upload") return <span className="text-xs text-muted-foreground">{t("bishop.review_waiting")}</span>;
  return <span className="text-xs text-muted-foreground">{t("bishop.review_day", { day: Math.max(o.review.day, 1), total: o.review.total })}</span>;
}
