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
  type MeetingOutcome,
  type MouAcknowledgmentPoint,
  type OpportunityVisibility,
  type OwnerEntry,
  type OwnNdaSummary,
  type PlatformRules,
} from "@/lib/api/types";
import { meetingHeld } from "./entry";
import { entryMeetings } from "./meetings";

// ---------- Rules ----------

export interface EntryRules {
  opportunity_visibility: OpportunityVisibility;
  oa_waiting_days: number;
  require_expansion_meeting: boolean;
  nda_auto_signed_by_sm: boolean;
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
};

export const entryRules = (rules: Partial<PlatformRules> | null | undefined): EntryRules => ({
  opportunity_visibility: rules?.opportunity_visibility ?? ENTRY_RULE_DEFAULTS.opportunity_visibility,
  oa_waiting_days: rules?.oa_waiting_days ?? ENTRY_RULE_DEFAULTS.oa_waiting_days,
  require_expansion_meeting: rules?.require_expansion_meeting ?? ENTRY_RULE_DEFAULTS.require_expansion_meeting,
  nda_auto_signed_by_sm: rules?.nda_auto_signed_by_sm ?? ENTRY_RULE_DEFAULTS.nda_auto_signed_by_sm,
});

// ---------- Meeting outcome ----------

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
export function oaWaitingUntil(c: Pick<Contract, "kind" | "sent_at">, waitingDays: number, today: string = todayIso()): IsoDate | null {
  if (c.kind !== "tripartite" || !c.sent_at) return null;
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

// ---------- The owner's own NDA (kind owner_nda) ----------

/** Longest text the API accepts for the owner's own NDA (body_too_long beyond it). */
export const OWN_NDA_MAX_LENGTH = 20_000;

/**
 * Where the owner's own NDA stands. none: he did not write one; waiting_sm: sent, Strategic Mates has not signed;
 * signed_by_sm: Strategic Mates signed (the owner may sign too); signed_by_both.
 */
export type OwnNdaView = "none" | "waiting_sm" | "signed_by_sm" | "signed_by_both";

export function ownNdaView(own: Pick<OwnNdaSummary, "signed_by_sm" | "signed_by_owner"> | null | undefined): OwnNdaView {
  if (!own) return "none";
  if (!own.signed_by_sm) return "waiting_sm";
  return own.signed_by_owner ? "signed_by_both" : "signed_by_sm";
}

/** The owner edits his text only while nobody signed it. */
export const ownNdaEditable = (own: Pick<OwnNdaSummary, "signed_by_sm" | "signed_by_owner"> | null | undefined) =>
  !!own && !own.signed_by_sm && !own.signed_by_owner;

/** body_required / body_too_long, or null: the same check the API makes on POST and PATCH /own-nda. */
export function ownNdaBodyError(body: string): "body_required" | "body_too_long" | null {
  if (!body.trim()) return "body_required";
  if (body.length > OWN_NDA_MAX_LENGTH) return "body_too_long";
  return null;
}

/** Fills {{business_name}} and {{owner_name}} in the template (what GET /own-nda/template answers). */
export const fillOwnNdaTemplate = (template: string, values: { business_name: string; owner_name: string }) =>
  template.replace(/\{\{\s*business_name\s*\}\}/g, values.business_name).replace(/\{\{\s*owner_name\s*\}\}/g, values.owner_name);

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
 * meeting; the meeting only sends the documents list.
 */
export const OWNER_STEPS = ["nda", "mou", "meeting", "documents", "expansion", "operating_agreement"] as const;
export type OwnerStepKey = (typeof OWNER_STEPS)[number];
export type OwnerStepState = "done" | "current" | "upcoming";

export interface OwnerStepsInput {
  summary: Pick<IntakeSummary, "approved_at"> & Partial<Pick<IntakeSummary, "entry" | "required_total">>;
  nda: Contract | null;
  mou: Contract | null;
  operatingAgreement: Contract | null;
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
    nda: ndaStatus(input.nda) === "signed",
    // The documents list only goes out after "Se hizo": a list means the meeting was held (older rows have no outcome).
    meeting: meetings.initial?.outcome === "held" || (input.summary.required_total ?? 0) > 0 || approved,
    mou: signedBy(input.mou, "owner"),
    documents: approved,
    expansion: !input.rules.require_expansion_meeting || !!entry?.expansion_meeting_held_at || meetings.expansion?.outcome === "held",
    operating_agreement: signedBy(input.operatingAgreement, "owner"),
  };
  const keys = OWNER_STEPS.filter((k) => approved || (k !== "expansion" && k !== "operating_agreement"));
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
