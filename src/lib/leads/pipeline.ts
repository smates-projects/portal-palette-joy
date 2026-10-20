import { todayIso, nowIso } from "@/lib/clock";
import { isNewLead, meetingHeld } from "./entry";
import {
  LEAD_STAGES,
  type ActiveLeadStage,
  type Lead,
  type LeadMeeting,
  type TripartiteState,
  type LeadBand,
  type LeadIndustry,
  type LeadStage,
  type IntakeSummary,
  type RevenueRange,
} from "@/lib/api/types";

/** Days in a stage after which the card turns red. */
export const STALE_STAGE_DAYS = 5;
/** An evaluated lead nobody contacted for more than this many days counts as "sin contactar". */
export const UNCONTACTED_DAYS = 2;

const day = (iso: string) => iso.slice(0, 10);
export const daysSince = (iso: string, today: string = todayIso()) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day(iso)}T12:00:00Z`)) / 86_400_000);

export type LeadMove =
  | { ok: true; action: "move" | "restore" | "discard" }
  | { ok: false; reason: "same" | "skip" | "locked" | "restore_only" | "action_only" };

/** Stages reached only through their action (Enviar NDA y MOU, Aprobar documentación, start of the program). */
const ACTION_ONLY: LeadStage[] = ["documents", "accepted", "in_program"];

/**
 * Valid moves: one step back, or Evaluado → Reunión. Documentación, Aceptado and En programa are reached only with
 * their action, never by dragging. Discard from any active stage (needs a reason). En programa is never left.
 * A discarded lead can only be reactivated to Evaluado.
 */
export function resolveLeadMove(from: LeadStage, to: LeadStage): LeadMove {
  if (from === to) return { ok: false, reason: "same" };
  if (from === "in_program") return { ok: false, reason: "locked" };
  if (from === "discarded") return to === "evaluated" ? { ok: true, action: "restore" } : { ok: false, reason: "restore_only" };
  if (to === "discarded") return { ok: true, action: "discard" };
  const diff = LEAD_STAGES.indexOf(to as ActiveLeadStage) - LEAD_STAGES.indexOf(from);
  if (diff === -1) return { ok: true, action: "move" };
  if (diff === 1) return ACTION_ONLY.includes(to) ? { ok: false, reason: "action_only" } : { ok: true, action: "move" };
  return { ok: false, reason: "skip" };
}

export type LeadPrimaryAction =
  | "schedule" | "join_meet" | "meeting_outcome" | "rebook" | "send_nda" | "send_mou" | "review_docs" | "approve_docs" | "wait_investor"
  | "send_tripartite" | "wait_signatures" | "record_funds" | "start_program" | "view_program" | "restore";

/**
 * One primary action per stage, from the next pending step. In Reunión with a booked meeting: join it until it is
 * over, then answer "¿Se hizo?" on the meeting card ("Se hizo" sends the MOU and moves the lead to Documentación by
 * itself). Not shown or to reschedule: send the booking link again. Moved to Reunión by hand (no booking): send the
 * NDA, then the MOU. In Aceptado: wait for a Bishop, send the Operating Agreement, wait for the three signatures,
 * record the funds, and once everything is in, confirm the start.
 */
export function primaryActionFor(
  lead: Pick<Lead, "stage"> & {
    intake?: IntakeSummary | null;
    bishop_user_id?: string | null;
    tripartite?: TripartiteState;
    funds?: { ready_to_start: boolean } | null;
    meeting?: LeadMeeting | null;
  },
  now: string = nowIso(),
): LeadPrimaryAction {
  switch (lead.stage) {
    case "evaluated": return "schedule";
    case "meeting":
      if (lead.meeting && !lead.meeting.outcome && !meetingHeld(lead.meeting, now)) return "join_meet";
      if (lead.meeting && !lead.meeting.outcome) return "meeting_outcome";
      if (lead.meeting && lead.meeting.outcome !== "held") return "rebook";
      return lead.intake ? "send_mou" : "send_nda";
    case "documents": return lead.intake && lead.intake.to_review > 0 ? "review_docs" : "approve_docs";
    case "accepted":
      if (!lead.bishop_user_id) return "wait_investor";
      if (!lead.tripartite || lead.tripartite === "none") return "send_tripartite";
      if (lead.tripartite === "pending") return "wait_signatures";
      return lead.funds?.ready_to_start ? "start_program" : "record_funds";
    case "in_program": return "view_program";
    case "discarded": return "restore";
  }
}

const mondayOf = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};
const sameMonth = (iso: string, today: string) => iso.slice(0, 7) === today.slice(0, 7);

export type LeadQuick = "week" | "uncontacted" | "signed_month" | "in_review" | "review_overdue" | "no_investor";

type WithIntake = Lead & { intake?: IntakeSummary | null };

export function matchesQuick(lead: WithIntake, quick: LeadQuick, today: string = todayIso()) {
  if (quick === "in_review") return lead.stage === "documents";
  if (quick === "review_overdue") return lead.stage === "documents" && lead.intake?.clock.tone === "red";
  if (quick === "no_investor") return lead.stage === "accepted" && !lead.bishop_user_id;
  if (quick === "week") return day(lead.submitted_at) >= mondayOf(today) && day(lead.submitted_at) <= today;
  if (quick === "uncontacted") return lead.stage === "evaluated" && !lead.last_contact_at && daysSince(lead.submitted_at, today) > UNCONTACTED_DAYS;
  return lead.stage === "in_program" && sameMonth(lead.stage_entered_at, today);
}

export interface PipelineCounters {
  week: number;
  uncontacted: number;
  /** In Documentación with the review clock running or paused. */
  in_review: number;
  /** Review past the SM Global deadline. */
  review_overdue: number;
  /** Accepted, waiting for an investor (part 2 adds the Bishop; today every accepted lead counts). */
  accepted_no_investor: number;
  signed_month: number;
  /** Assessments submitted this month and how many of all leads entered the program this month. */
  month_assessments: number;
  conversion_pct: number | null;
}

export function buildPipelineCounters(leads: WithIntake[], today: string = todayIso()): PipelineCounters {
  const signed = leads.filter((l) => matchesQuick(l, "signed_month", today)).length;
  const monthAssessments = leads.filter((l) => sameMonth(l.submitted_at, today)).length;
  return {
    week: leads.filter((l) => matchesQuick(l, "week", today)).length,
    uncontacted: leads.filter((l) => matchesQuick(l, "uncontacted", today)).length,
    in_review: leads.filter((l) => matchesQuick(l, "in_review", today)).length,
    review_overdue: leads.filter((l) => matchesQuick(l, "review_overdue", today)).length,
    accepted_no_investor: leads.filter((l) => matchesQuick(l, "no_investor", today)).length,
    signed_month: signed,
    month_assessments: monthAssessments,
    conversion_pct: monthAssessments === 0 ? null : Math.round((signed / monthAssessments) * 100),
  };
}

// ---------- URL filters ----------

export interface LeadsSearch {
  view?: "board" | "table";
  stage?: LeadStage;
  consultant?: string;
  band?: LeadBand;
  industry?: LeadIndustry;
  revenue?: RevenueRange;
  quick?: LeadQuick;
  lead?: string;
  /** Opened from the bell: the part of the lead to bring into view ("Resultado de la reunión pendiente"). */
  focus?: "meeting";
}

const ALL_STAGES: LeadStage[] = [...LEAD_STAGES, "discarded"];
const BANDS: LeadBand[] = ["high", "mid", "low", "track"];
// Strategic Mates works only with construction trades (same keys as the public assessment). To add a trade, add it
// here, in LeadIndustry and in locales pipeline.industries.
export const INDUSTRIES: readonly LeadIndustry[] = ["construction", "remodeling", "installations_repairs", "maintenance", "cleaning", "other_related"];
export const REVENUES: RevenueRange[] = ["lt_250k", "250k_500k", "500k_750k", "750k_1m", "1m_2m", "gt_2m"];
const QUICKS: LeadQuick[] = ["week", "uncontacted", "signed_month", "in_review", "review_overdue", "no_investor"];
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

export function validateLeadsSearch(raw: Record<string, unknown>): LeadsSearch {
  const out: LeadsSearch = {};
  const view = pick(raw["view"], ["board", "table"] as const);
  if (view) out.view = view;
  const stage = pick(raw["stage"], ALL_STAGES);
  if (stage) out.stage = stage;
  if (typeof raw["consultant"] === "string" && raw["consultant"]) out.consultant = raw["consultant"];
  const band = pick(raw["band"], BANDS);
  if (band) out.band = band;
  const industry = pick(raw["industry"], INDUSTRIES);
  if (industry) out.industry = industry;
  const revenue = pick(raw["revenue"], REVENUES);
  if (revenue) out.revenue = revenue;
  const quick = pick(raw["quick"], QUICKS);
  if (quick) out.quick = quick;
  if (typeof raw["lead"] === "string" && raw["lead"]) out.lead = raw["lead"];
  if (raw["focus"] === "meeting" && out.lead) out.focus = "meeting";
  return out;
}

export function filterLeads<T extends WithIntake>(leads: T[], s: LeadsSearch, today: string = todayIso()): T[] {
  return leads.filter(
    (l) =>
      (!s.stage || l.stage === s.stage) &&
      (!s.consultant || l.consultant_user_id === s.consultant) &&
      (!s.band || l.result?.band === s.band) &&
      (!s.industry || l.business.industry === s.industry) &&
      (!s.revenue || l.business.revenue_range === s.revenue) &&
      (!s.quick || matchesQuick(l, s.quick, today)),
  );
}

/** Board/table order: longest in stage first. */
export const byTimeInStage = (a: Lead, b: Lead) => a.stage_entered_at.localeCompare(b.stage_entered_at);

/** Board column order: leads that just arrived ("Nuevo") on top, newest first; then longest in stage. */
export const byNewThenTime = (today: string = todayIso()) => (a: Lead, b: Lead) => {
  const na = isNewLead(a, today), nb = isNewLead(b, today);
  if (na !== nb) return na ? -1 : 1;
  return na ? b.submitted_at.localeCompare(a.submitted_at) : byTimeInStage(a, b);
};

export const isActiveStage = (s: LeadStage): s is ActiveLeadStage => s !== "discarded";
