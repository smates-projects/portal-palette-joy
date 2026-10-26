// Revised entry flow (flujo-vinculacion-lineal): NDA at booking with Strategic Mates pre-signed, the outcome of the
// meeting, the MOU accepted point by point, documents locked until the MOU is signed, the Bishops SM presents the
// business to, the expansion meeting and the waiting period of the Operating Agreement. Pure rules shared by the mock
// and the screens; the API applies the same ones and answers the same codes.
import { todayIso, nowIso } from "@/lib/clock";
import {
  MOU_ACKNOWLEDGMENT_POINTS,
  type BusinessDocument,
  type Contract,
  type IntakeDocumentHelp,
  type IntakeSummary,
  type IsoDate,
  type LeadMeeting,
  type MeetingKind,
  type MeetingOutcome,
  type MouAcknowledgmentPoint,
  type OpportunityVisibility,
  type OwnerEntry,
  type PlatformRules,
  type User,
} from "@/lib/api/types";
import { meetingHeld } from "./entry";
import { entryMeetings } from "./meetings";

// ---------- Rules ----------

export interface EntryRules {
  opportunity_visibility: OpportunityVisibility;
  oa_waiting_days: number;
  require_expansion_meeting: boolean;
  nda_auto_signed_by_sm: boolean;
  /** The Corporate signer's written delegation is on file: only then does the pre-signature apply (API default false). */
  sm_written_delegation: boolean;
}

/**
 * What applies when SM Global never set the rule. "all" keeps every approved business visible to the Bishops with the
 * framework signed (as before the rule existed); SM Global switches to "presented" in Reglas.
 */
export const ENTRY_RULE_DEFAULTS: EntryRules = {
  opportunity_visibility: "all",
  oa_waiting_days: 7,
  require_expansion_meeting: true,
  nda_auto_signed_by_sm: true,
  sm_written_delegation: false,
};

export const entryRules = (rules: Partial<PlatformRules> | null | undefined): EntryRules => ({
  opportunity_visibility: rules?.opportunity_visibility ?? ENTRY_RULE_DEFAULTS.opportunity_visibility,
  oa_waiting_days: rules?.oa_waiting_days ?? ENTRY_RULE_DEFAULTS.oa_waiting_days,
  require_expansion_meeting: rules?.require_expansion_meeting ?? ENTRY_RULE_DEFAULTS.require_expansion_meeting,
  nda_auto_signed_by_sm: rules?.nda_auto_signed_by_sm ?? ENTRY_RULE_DEFAULTS.nda_auto_signed_by_sm,
  sm_written_delegation: rules?.sm_written_delegation ?? ENTRY_RULE_DEFAULTS.sm_written_delegation,
});

// ---------- Meeting outcome ----------

/**
 * The reason the API writes when it discards a lead by itself: the meeting was held and the MOU was not signed in it.
 * The lead detail translates it and SM Global gets "Reactivar".
 */
export const AUTO_DISCARD_MOU_NOT_SIGNED = "mou_not_signed";

/** "Se hizo" on the first meeting with the MOU unsigned: the lead leaves the process. The screen warns before. */
export const heldWithoutMou = (outcome: MeetingOutcome, kind: MeetingKind | null | undefined, mouSignedByOwner: boolean | null | undefined) =>
  outcome === "held" && (kind ?? "initial") === "initial" && !mouSignedByOwner;

const kindOf = (m: Pick<LeadMeeting, "kind">) => m.kind ?? "initial";

/** The meeting ended and nobody answered "¿Se hizo?": the lead shows "Resultado de la reunión pendiente". */
export const outcomePending = (m: LeadMeeting | null | undefined, now: string = nowIso()): boolean =>
  !!m && !m.outcome && meetingHeld(m, now);

/**
 * Why an outcome cannot be recorded, or null. "Se hizo" and "No se presentó" only once the meeting started;
 * "Reagendar" any time. A meeting answers once (outcome_already_set).
 */
export function outcomeBlock(
  m: LeadMeeting | null | undefined,
  outcome: MeetingOutcome,
  now: string = nowIso(),
): "not_found" | "outcome_already_set" | "invalid_transition" | null {
  if (!m) return "not_found";
  if (m.outcome) return "outcome_already_set";
  if (outcome !== "reschedule" && Date.parse(m.starts_at) > Date.parse(now)) return "invalid_transition";
  return null;
}

export const isExpansion = (m: Pick<LeadMeeting, "kind">) => kindOf(m) === "expansion";

/**
 * Who answers "¿Se hizo?" (the API refuses anyone else with 403): the person who held the meeting (its organizer),
 * the lead's consultant, or an admin of the lead's office. Not the role nor the funnel: SM Global answers the leads it
 * consults or the meetings it held, and an office colleague who is none of these sees the question without buttons.
 */
export function canAnswerOutcome(
  me: Pick<User, "id" | "role" | "is_admin" | "organization_id"> | null | undefined,
  lead: { consultant_user_id: string; office_id: string },
  meeting: Pick<LeadMeeting, "organizer_user_id">,
): boolean {
  if (!me) return false;
  return (
    (!!meeting.organizer_user_id && me.id === meeting.organizer_user_id) ||
    me.id === lead.consultant_user_id ||
    (!!me.is_admin && me.role === "sm_team" && me.organization_id === lead.office_id)
  );
}

const needsNewBooking = (m: LeadMeeting | null | undefined) => !m || m.outcome === "no_show" || m.outcome === "reschedule";

/**
 * What a booking from the consultant's calendar does to the lead, or null when it books nothing: the first meeting
 * (Evaluado), a new one after "No se presentó" / "Reagendar" (Reunión), or the expansion meeting (Aceptado).
 */
export function bookingKind(
  lead: { stage: string; meeting: LeadMeeting | null; expansion_meeting?: LeadMeeting | null | undefined; expansion_meeting_held_at?: string | null | undefined },
): "initial" | "rebook" | "expansion" | null {
  if (lead.stage === "evaluated") return "initial";
  if (lead.stage === "meeting" && lead.meeting && needsNewBooking(lead.meeting)) return "rebook";
  if (lead.stage === "accepted" && !lead.expansion_meeting_held_at && needsNewBooking(lead.expansion_meeting)) return "expansion";
  return null;
}

// ---------- MOU acknowledgment ----------

/** The points still to confirm, in the order the screen shows them. */
export const missingAcknowledgments = (acks: readonly string[] | null | undefined): MouAcknowledgmentPoint[] =>
  MOU_ACKNOWLEDGMENT_POINTS.filter((p) => !(acks ?? []).includes(p));

/** "Firmar" activates only with the four points confirmed. */
export const acknowledgedAll = (acks: readonly string[] | null | undefined) => missingAcknowledgments(acks).length === 0;

/** The four points exactly (no repeats, nothing else): what POST /contracts/{id}/acknowledge accepts. */
export const validAcknowledgment = (points: readonly string[]) =>
  points.length === MOU_ACKNOWLEDGMENT_POINTS.length && acknowledgedAll(points) && new Set(points).size === points.length;

/** acknowledgment_required when the owner signs a MOU without the four points; null otherwise. */
export function signBlock(c: Pick<Contract, "kind" | "signers">, party: "owner" | "sm" | "bishop"): "acknowledgment_required" | null {
  if (c.kind !== "mou" || party !== "owner") return null;
  const owner = c.signers.find((s) => s.party === "owner");
  return acknowledgedAll(owner?.acknowledgments) ? null : "acknowledgment_required";
}

// ---------- Operating Agreement: waiting period and expansion meeting ----------

const addDays = (date: string, n: number) => {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** First day anyone can sign: the day it went out plus the waiting days. */
export const oaSignableFrom = (sentAt: IsoDate, waitingDays: number): IsoDate => addDays(sentAt, Math.max(0, waitingDays));

/**
 * The date the Operating Agreement can be signed from while the waiting period runs ("Podrás firmar desde el ..."),
 * or null when it can be signed today (or the contract is not an Operating Agreement or was not sent).
 */
export function oaWaitingUntil(c: Pick<Contract, "kind" | "sent_at"> & Partial<Pick<Contract, "rule_code">>, waitingDays: number, today: string = todayIso()): IsoDate | null {
  // An Operating Agreement created by its rule has a deadline to sign (sign_by) instead of a waiting period.
  if (c.kind !== "tripartite" || !c.sent_at || c.rule_code) return null;
  const from = oaSignableFrom(c.sent_at, waitingDays);
  return from > today ? from : null;
}

/** Why SM cannot send the Operating Agreement yet, or null. */
export function oaSendBlock(
  lead: { bishop_user_id: string | null; expansion_meeting_held_at?: string | null | undefined },
  rules: EntryRules,
): "no_bishop" | "expansion_meeting_required" | null {
  if (!lead.bishop_user_id) return "no_bishop";
  if (rules.require_expansion_meeting && !lead.expansion_meeting_held_at) return "expansion_meeting_required";
  return null;
}

// ---------- Bishop visibility ----------

/** With "presented" a Bishop sees only what SM presented to him; with "all", every approved business. */
export const bishopSees = (visibility: OpportunityVisibility, presentedToHim: boolean) => visibility === "all" || presentedToHim;

// ---------- NDA as SM sees it ----------

export type NdaStatus = "none" | "signed" | "pending";

/** firmado / pendiente. */
export function ndaStatus(c: Contract | null | undefined): NdaStatus {
  if (!c) return "none";
  if (c.signers.length > 0 && c.signers.every((s) => s.status === "signed")) return "signed";
  return "pending";
}

// ---------- Documents ----------

/** Entry documents the owner can upload now: not locked by the MOU and requested or asked again. */
export const uploadable = (d: Pick<BusinessDocument, "state" | "locked_until_mou">) =>
  !d.locked_until_mou && (d.state === "requested" || d.state === "rejected");

/**
 * What the upload input takes for an entry document: the API's allowlist (PDF, PNG, JPG, Word, Excel). A photo from
 * the phone counts: "sirve una captura o una foto legible".
 */
export const INTAKE_DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The help of an entry document (what it is, "Sirve:", the tip), from the rule it was created from. Null when the
 * rule has none (or the document is not an entry document). Empty lines of "Sirve:" are left out.
 */
export function intakeDocumentHelp(
  d: Pick<BusinessDocument, "rule_id" | "area">,
  rules: Pick<PlatformRules, "intake_documents"> | null | undefined,
): IntakeDocumentHelp | null {
  if (d.area !== "intake" || !d.rule_id) return null;
  return cleanDocumentHelp(rules?.intake_documents.find((r) => r.id === d.rule_id)?.help);
}

/** The help as shown and saved: trimmed, empty "Sirve:" lines left out, null when nothing is written. */
export function cleanDocumentHelp(help: IntakeDocumentHelp | null | undefined): IntakeDocumentHelp | null {
  if (!help) return null;
  const clean = { what: help.what.trim(), counts: help.counts.map((c) => c.trim()).filter(Boolean), tip: help.tip.trim() };
  return clean.what || clean.counts.length > 0 || clean.tip ? clean : null;
}

// ---------- Owner "Tu ingreso" ----------

/**
 * The order of "Tu ingreso": NDA → MOU → Tu reunión → Documentos, then (after the approval) the expansion meeting and
 * the Operating Agreement. The MOU exists as soon as the owner signs the NDA, so he can sign it before or during the
 * meeting. The documents open when the MOU is signed, independent of the meeting.
 */
export const OWNER_STEPS = ["nda", "mou", "meeting", "documents", "expansion", "binding", "operating_agreement"] as const;
export type OwnerStepKey = (typeof OWNER_STEPS)[number];
export type OwnerStepState = "done" | "current" | "upcoming";

export interface OwnerStepsInput {
  summary: Pick<IntakeSummary, "approved_at"> & Partial<Pick<IntakeSummary, "entry" | "required_total" | "nda_signed_by_owner">>;
  nda: Contract | null;
  mou: Contract | null;
  operatingAgreement: Contract | null;
  /**
   * The Acuerdo de Vinculación, signed in the linking meeting. Leave it out (undefined) where the entry has no binding
   * rule: the step is not shown then. null = the rule exists and the contract does not yet.
   */
  binding?: Contract | null | undefined;
  rules: EntryRules;
}

const signedBy = (c: Contract | null, party: "owner" | "sm" | "bishop") =>
  !!c?.signers.some((s) => s.party === party && s.status === "signed");

/**
 * The steps of "Tu ingreso" with their state. The four entry steps always show; after the approval come the expansion
 * meeting and the Operating Agreement. The first step not done is the current one.
 */
export function ownerSteps(input: OwnerStepsInput): { key: OwnerStepKey; state: OwnerStepState }[] {
  const entry: OwnerEntry | null = input.summary.entry ?? null;
  const meetings = entryMeetings(entry);
  const approved = !!input.summary.approved_at;
  const done: Record<OwnerStepKey, boolean> = {
    // The owner's own signature enables the next step; Strategic Mates' may still be missing.
    nda: !!input.summary.nda_signed_by_owner || ndaStatus(input.nda) === "signed",
    // Only the outcome says the meeting was held: the API creates the documents at the NDA signature, so a documents
    // list (or the list being open after the MOU) says nothing about the meeting. The approval comes after it.
    meeting: meetings.initial?.outcome === "held" || approved,
    mou: signedBy(input.mou, "owner"),
    documents: approved,
    expansion: !input.rules.require_expansion_meeting || !!entry?.expansion_meeting_held_at || meetings.expansion?.outcome === "held",
    binding: signedBy(input.binding ?? null, "owner"),
    operating_agreement: signedBy(input.operatingAgreement, "owner"),
  };
  const afterApproval: OwnerStepKey[] = ["expansion", "binding", "operating_agreement"];
  const keys = OWNER_STEPS.filter((k) => (k !== "binding" || input.binding !== undefined) && (approved || !afterApproval.includes(k)));
  const current = keys.find((k) => !done[k]);
  return keys.map((key) => ({ key, state: done[key] ? "done" : key === current ? "current" : "upcoming" }));
}

/**
 * What a meeting step of "Tu ingreso" shows. book: nothing booked (the booking link); rebook: it did not happen
 * (no-show / reschedule: book again); upcoming: date, time and the Meet link; waiting_outcome: it already passed and
 * the consultant has not answered; held: "Reunión hecha". `heldAt` (expansion_meeting_held_at) counts as held even
 * when the meeting itself did not come in the answer.
 */
export type OwnerMeetingView = "book" | "rebook" | "upcoming" | "waiting_outcome" | "held";

export function ownerMeetingView(
  m: Pick<LeadMeeting, "starts_at" | "duration_minutes" | "outcome"> | null | undefined,
  options: { heldAt?: string | null | undefined; now?: string } = {},
): OwnerMeetingView {
  if (m?.outcome === "held" || options.heldAt) return "held";
  if (!m) return "book";
  if (m.outcome === "no_show" || m.outcome === "reschedule") return "rebook";
  return meetingHeld(m, options.now ?? nowIso()) ? "waiting_outcome" : "upcoming";
}
