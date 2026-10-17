// Phase of a Bishop opportunity, computed from the lead. Same rule in the mock and, later, in the Laravel backend.
import type { LeadStage, OpportunityPhase, TripartiteState, Uuid } from "@/lib/api/types";

export interface OpportunityInput {
  stage: LeadStage;
  nda_signed: boolean;
  mou_signed: boolean;
  bishop_user_id: Uuid | null;
  tripartite: TripartiteState;
}

/**
 * Phase as `viewer` (a Bishop) sees it, or null when he must not see it: before NDA + MOU are signed by both,
 * outside Documentación / Aceptado, or once another Bishop took it.
 */
export function opportunityPhase(lead: OpportunityInput, viewer: Uuid): OpportunityPhase | null {
  if (lead.stage !== "documents" && lead.stage !== "accepted") return null;
  if (!lead.nda_signed || !lead.mou_signed) return null;
  if (lead.bishop_user_id && lead.bishop_user_id !== viewer) return null;
  if (lead.stage === "documents") return "in_review";
  if (!lead.bishop_user_id) return "available";
  if (lead.tripartite === "none") return "accepted_by_you";
  return lead.tripartite === "pending" ? "in_contract" : "funds_pending";
}

/** Why "Aceptar oportunidad" is disabled, or null when the Bishop can accept. */
export function acceptBlock(phase: OpportunityPhase, frameworkSigned: boolean): "framework" | "in_review" | "taken" | null {
  if (!frameworkSigned) return "framework";
  if (phase === "in_review") return "in_review";
  if (phase !== "available") return "taken";
  return null;
}

/** Signed by everyone, waiting for someone, or not sent. */
export function tripartiteState(c: { state: string } | null | undefined): TripartiteState {
  if (!c) return "none";
  return c.state === "signed" ? "signed" : "pending";
}
