// The lead detail's journey strip and "Lo que toca hacer": pure rules shared by the screen and the tests; the
// Laravel backend reads the same dates from the same fields.
import type { Contract, IntakeSummary, Lead, LeadEvent, LeadInvestors, LeadMeeting } from "@/lib/api/types";
import type { LeadPrimaryAction } from "@/lib/leads/pipeline";

export const JOURNEY_STEPS = ["assessment", "reunion", "nda", "mou", "documentos", "inversor", "vinculacion", "programa"] as const;
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number];
export interface JourneyStep {
  key: JourneyStepKey;
  state: "done" | "current" | "pending";
  /** When it happened (null while pending or unknown). */
  at: string | null;
}

type JourneyLead = Pick<Lead, "stage" | "discarded_from" | "submitted_at" | "stage_entered_at" | "bishop_user_id" | "tripartite"> & {
  intake?: Pick<IntakeSummary, "nda_signed" | "mou_signed" | "approved_at"> | null | undefined;
  meeting?: Pick<LeadMeeting, "starts_at" | "outcome"> | null | undefined;
};

/** A discarded lead keeps the stage it had when SM discarded it. */
const baseStage = (l: Pick<Lead, "stage" | "discarded_from">) => (l.stage === "discarded" ? l.discarded_from ?? "evaluated" : l.stage);

/**
 * The eight steps of one lead, from the assessment to the program. Done steps carry their date; the first
 * incomplete one is "current" (gold in the strip) and the rest wait in grey.
 */
export function leadJourney(
  lead: JourneyLead,
  contracts: Pick<Contract, "kind" | "signed_at">[] = [],
  investors?: Pick<LeadInvestors, "bishop" | "tripartite"> | null,
): JourneyStep[] {
  const stage = baseStage(lead);
  const pastMeeting = !["evaluated", "meeting"].includes(stage);
  const nda = contracts.find((c) => c.kind === "nda");
  const mou = contracts.find((c) => c.kind === "mou");
  const pastDocuments = stage === "accepted" || stage === "in_program";
  const dates: Record<JourneyStepKey, string | null> = {
    assessment: lead.submitted_at,
    reunion: lead.meeting?.starts_at ?? (pastMeeting ? lead.stage_entered_at : null),
    nda: nda?.signed_at ?? null,
    mou: mou?.signed_at ?? null,
    documentos: lead.intake?.approved_at ?? null,
    inversor: investors?.bishop?.accepted_at ?? null,
    vinculacion: investors?.tripartite?.signed_at ?? null,
    programa: lead.stage === "in_program" ? lead.stage_entered_at : null,
  };
  const done: Record<JourneyStepKey, boolean> = {
    assessment: true,
    reunion: pastMeeting || lead.meeting?.outcome === "held",
    nda: !!nda?.signed_at || !!lead.intake?.nda_signed || pastDocuments,
    mou: !!mou?.signed_at || !!lead.intake?.mou_signed || pastDocuments,
    documentos: !!lead.intake?.approved_at || pastDocuments,
    inversor: !!investors?.bishop || !!lead.bishop_user_id || lead.stage === "in_program",
    vinculacion: investors?.tripartite?.state === "signed" || lead.tripartite === "signed" || lead.stage === "in_program",
    programa: lead.stage === "in_program",
  };
  const current = JOURNEY_STEPS.find((k) => !done[k]);
  return JOURNEY_STEPS.map((key) => ({
    key,
    state: done[key] ? "done" : key === current ? "current" : "pending",
    at: done[key] ? dates[key] : null,
  }));
}

/** The one block of the detail that needs action now, from the primary action of the stage. */
export type PendingBlock = "meeting" | "docs" | "contracts" | "validation" | "investors" | "funds" | null;

/**
 * Where the pending work lives. The validation form goes first while it is open in Aceptado (the Operating
 * Agreement and the presentation to Bishops wait for its percentages); then the block of the action itself.
 */
export function pendingBlock(action: LeadPrimaryAction, validationOpen: boolean): PendingBlock {
  switch (action) {
    case "meeting_outcome":
      return "meeting";
    case "review_docs":
    case "approve_docs":
      return "docs";
    case "send_nda":
    case "send_mou":
      return "contracts";
    case "wait_investor":
      return validationOpen ? "validation" : "investors";
    case "send_tripartite":
    case "wait_signatures":
      return validationOpen ? "validation" : "contracts";
    case "record_funds":
    case "start_program":
      return "funds";
    default:
      return null;
  }
}

/** Five minutes: two events of the same kind by the same person closer than this read as one action. */
export const EVENT_GROUP_WINDOW_MS = 5 * 60_000;

type GroupableEvent = Pick<LeadEvent, "id" | "kind" | "actor_user_id" | "created_at">;

/**
 * The activity tab's collapse: newest first, consecutive events of the same kind by the same person within five
 * minutes fold into one group ("Marilyn aceptó 13 documentos"). Everything else stays a group of one.
 */
export function collapseEvents<T extends GroupableEvent>(events: T[]): T[][] {
  const groups: T[][] = [];
  for (const e of events) {
    const last = groups.at(-1);
    const head = last?.[0];
    if (
      last && head &&
      head.kind === e.kind && head.actor_user_id === e.actor_user_id &&
      Math.abs(Date.parse(head.created_at) - Date.parse(e.created_at)) <= EVENT_GROUP_WINDOW_MS
    ) {
      last.push(e);
    } else {
      groups.push([e]);
    }
  }
  return groups;
}

/** Kinds whose collapsed group has its own sentence with a count ("aceptó 13 documentos"). */
export const GROUPABLE_KINDS = ["doc_accepted", "doc_requested"] as const;
