import { ScreenPlaceholder } from "@/components/soon/ScreenPlaceholder";

/** Placeholder: replace with the real screen. Opportunity sheet (route /oportunidades/$opportunityId). Hooks: useBishopOpportunity(opportunityId), useExpressInterest, usePassOpportunity, useClearOpportunityDecision. */
export function OpportunityDetailPage({ opportunityId }: { opportunityId: string }) {
  void opportunityId;
  return <ScreenPlaceholder ns="bishop" screen="opportunity_detail" />;
}

