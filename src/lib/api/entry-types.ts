// Automatic entry of leads (assessment of the landing → summary email → meeting booked), zone routing, tasks the
// business already had, and the assessment snapshot kept by the business. Same shapes as the Laravel API.
import type { AreaCode, AssessmentBlock, IsoDateTime, Lead, LeadBand, LeadResult, Uuid } from "./types";

/** initial: the first meeting (presentación integral). expansion: the "reunión de ampliación" after the approval. */
export type MeetingKind = "initial" | "expansion";

/**
 * What the consultant answers after the meeting ("¿Se hizo?"). held on the initial meeting sends the MOU; held on the
 * expansion meeting opens the Operating Agreement. no_show and reschedule leave the lead waiting for a new booking.
 */
export const MEETING_OUTCOMES = ["held", "no_show", "reschedule"] as const;
export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

/** POST /leads/{id}/meetings/{meetingId}/outcome. The note only travels with "held". */
export interface MeetingOutcomeInput {
  outcome: MeetingOutcome;
  note?: string | null | undefined;
}

/** Meeting the owner booked from the summary email, as it arrives from the consultant's calendar. */
export interface LeadMeeting {
  /** Needed to answer the outcome. Older rows may come without it. */
  id?: Uuid | undefined;
  /** Absent = initial. */
  kind?: MeetingKind | undefined;
  starts_at: IsoDateTime;
  duration_minutes: number;
  meet_url: string;
  consultant_user_id: Uuid;
  /** When the owner booked it. */
  booked_at: IsoDateTime;
  /** When the consultant answered the outcome (or wrote the note, before outcomes existed); null until then. */
  notes_at: IsoDateTime | null;
  /** The consultant's answer after the meeting; null while nobody answered. */
  outcome?: MeetingOutcome | null | undefined;
  /** When the portal asked "¿Se hizo?" (the meeting ended and nobody answered yet). */
  outcome_prompted_at?: IsoDateTime | null | undefined;
}

/**
 * The four points of the MOU the owner confirms one by one ("Entendí") before signing. The API refuses the signature of
 * a MOU without the four (409 acknowledgment_required).
 */
export const MOU_ACKNOWLEDGMENT_POINTS = [
  "funds_finance_intervention",
  "business_stays_yours",
  "franchisor_entity_participation",
  "do_it_together_no_debt",
] as const;
export type MouAcknowledgmentPoint = (typeof MOU_ACKNOWLEDGMENT_POINTS)[number];

/** Which Bishops see an approved opportunity: only the ones SM presented it to, or every Bishop with the framework signed. */
export type OpportunityVisibility = "presented" | "all";

/**
 * What the owner's "Tu ingreso" needs about the entry that lives on the lead (the owner never reads the lead):
 * the meetings, the booking link of the consultant and whether the expansion meeting already happened.
 */
export interface OwnerEntry {
  /** The mock sends the two meetings by kind; the API sends `meetings[]` (and the latest expansion one). */
  meeting?: LeadMeeting | null | undefined;
  expansion_meeting?: LeadMeeting | null | undefined;
  /** Every meeting of the lead with its id (API: `duration_min` instead of `duration_minutes`, meet_url nullable). */
  meetings?: OwnerEntryMeeting[] | undefined;
  expansion_meeting_held_at: IsoDateTime | null;
  booking_url: string | null;
  consultant_name?: string | null | undefined;
}

/** One meeting as the entering owner reads it (intake.summary.entry.meetings[]). */
export interface OwnerEntryMeeting {
  id?: Uuid | undefined;
  kind?: MeetingKind | undefined;
  starts_at: IsoDateTime;
  duration_min?: number | undefined;
  duration_minutes?: number | undefined;
  meet_url?: string | null | undefined;
  outcome?: MeetingOutcome | null | undefined;
  outcome_prompted_at?: IsoDateTime | null | undefined;
}

/** A booked meeting of one lead, for the consultant's calendar and the SM home. */
export interface LeadMeetingItem {
  lead_id: Uuid;
  business_name: string;
  owner_name: string;
  city: string;
  state: string;
  meeting: LeadMeeting;
}

export type PreValidation = "pending" | "existing" | "needed";
export type ApprovalSource = "deliverable" | "existing";

/**
 * "Ya lo tenía" (with the evidence the owner showed), "Hay que hacerla", or back to "A validar" (undo). The mock keeps
 * evidence_file_name; the HTTP adapter uploads evidence_file and refuses a name without its File ("invalid_file").
 */
export type PreValidationInput =
  | { decision: "existing"; evidence_file_name: string; note: string; evidence_file?: File | null | undefined }
  | { decision: "needed" }
  | { decision: "pending" };

/** Assessment block → program areas whose tasks get "A validar" when the block is strong. SM Global edits it. */
export type AssessmentAreaMap = Record<AssessmentBlock, AreaCode[]>;

// ---------- Zone routing ----------

/** A zone belongs to one office: a whole state (city null) or one city inside a state. */
export interface ZoneRule {
  id: Uuid;
  /** Two-letter state code: "FL". */
  state: string;
  /** City inside the state, or null for the whole state. */
  city: string | null;
  office_id: Uuid;
}

export interface RoutingRules {
  zones: ZoneRule[];
  /** Office that gets every lead no zone matches. */
  default_office_id: Uuid;
}

export type ZoneRuleInput = Omit<ZoneRule, "id"> & { id?: Uuid | undefined };

// ---------- Business file (ficha del negocio) ----------

/** The assessment result as the owner saw it. For the owner himself the score and band come back null. */
export type SnapshotResult = Omit<LeadResult, "score" | "band"> & { score: number | null; band: LeadBand | null };

/**
 * Copy of the assessment and the entry data, kept by the business when the lead goes to in_program. It never
 * changes afterwards, however the business moves.
 */
export interface AssessmentSnapshot {
  business_id: Uuid;
  lead_id: Uuid;
  /** Day the copy was taken (entry to the program). */
  taken_at: IsoDateTime;
  /** Day of the assessment. */
  submitted_at: IsoDateTime;
  contact: Lead["contact"];
  business: Lead["business"];
  result: SnapshotResult;
  /** Each priority with the program area that works on it (an open priority = its area has unapproved tasks). */
  priorities: { text: string; area: AreaCode }[];
  know_how_example: string | null;
}

export type BusinessMilestoneKind =
  | "assessment" | "meeting" | "contract_signed" | "program_started" | "consultant_changed" | "firm_changed" | "required_approved";

/** One milestone of the business activity (SM only). */
export interface BusinessMilestone {
  id: string;
  kind: BusinessMilestoneKind;
  at: IsoDateTime;
  /** Display names: consultant (consultant_changed), "Person (Firm)" (firm_changed). */
  from: string | null;
  to: string | null;
  task_code: string | null;
  task_name: string | null;
}
