// Automatic entry of leads (assessment of the landing → summary email → meeting booked), zone routing, tasks the
// business already had, and the assessment snapshot kept by the business. Same shapes as the Laravel API.
import type { AreaCode, AssessmentBlock, IsoDateTime, Lead, LeadBand, LeadResult, Uuid } from "./types";

/** Meeting the owner booked from the summary email, as it arrives from the consultant's calendar. */
export interface LeadMeeting {
  starts_at: IsoDateTime;
  duration_minutes: number;
  meet_url: string;
  consultant_user_id: Uuid;
  /** When the owner booked it. */
  booked_at: IsoDateTime;
  /** When the consultant wrote the note after the meeting (null until then). */
  notes_at: IsoDateTime | null;
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
