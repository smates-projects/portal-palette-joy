import { TODAY } from "@/config/app";
import {
  LEAD_STAGES,
  type ActiveLeadStage,
  type Lead,
  type LeadBand,
  type LeadIndustry,
  type LeadStage,
  type RevenueRange,
} from "@/lib/api/types";

/** Days in a stage after which the card turns red. */
export const STALE_STAGE_DAYS = 5;
/** An evaluated lead nobody contacted for more than this many days counts as "sin contactar". */
export const UNCONTACTED_DAYS = 2;

const day = (iso: string) => iso.slice(0, 10);
export const daysSince = (iso: string, today: string = TODAY) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day(iso)}T12:00:00Z`)) / 86_400_000);

export type LeadMove =
  | { ok: true; action: "move" | "restore" | "discard" | "sign" }
  | { ok: false; reason: "same" | "skip" | "locked" | "restore_only" };

/**
 * Valid moves: one step forward or one step back. Discard from any stage but En programa (needs a reason).
 * En programa is reached only by marking the contract as signed, and never left.
 * A discarded lead can only be reactivated to Evaluado.
 */
export function resolveLeadMove(from: LeadStage, to: LeadStage): LeadMove {
  if (from === to) return { ok: false, reason: "same" };
  if (from === "in_program") return { ok: false, reason: "locked" };
  if (from === "discarded") return to === "evaluated" ? { ok: true, action: "restore" } : { ok: false, reason: "restore_only" };
  if (to === "discarded") return { ok: true, action: "discard" };
  if (to === "in_program") return from === "contract" ? { ok: true, action: "sign" } : { ok: false, reason: "skip" };
  const diff = LEAD_STAGES.indexOf(to) - LEAD_STAGES.indexOf(from);
  return Math.abs(diff) === 1 ? { ok: true, action: "move" } : { ok: false, reason: "skip" };
}

export type LeadPrimaryAction = "schedule" | "accept" | "send_contract" | "sign" | "view_program" | "restore";

export const primaryActionFor = (stage: LeadStage): LeadPrimaryAction =>
  ({ evaluated: "schedule", meeting: "accept", accepted: "send_contract", contract: "sign", in_program: "view_program", discarded: "restore" } as const)[stage];

/** Stage each primary action moves to (null: no stage change from the action itself). */
export const actionTarget: Record<LeadPrimaryAction, LeadStage | null> = {
  schedule: "meeting", accept: "accepted", send_contract: "contract", sign: "in_program", view_program: null, restore: "evaluated",
};

const mondayOf = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
};
const sameMonth = (iso: string, today: string) => iso.slice(0, 7) === today.slice(0, 7);

export type LeadQuick = "week" | "uncontacted" | "signed_month";

export function matchesQuick(lead: Lead, quick: LeadQuick, today: string = TODAY) {
  if (quick === "week") return day(lead.submitted_at) >= mondayOf(today) && day(lead.submitted_at) <= today;
  if (quick === "uncontacted") return lead.stage === "evaluated" && !lead.last_contact_at && daysSince(lead.submitted_at, today) > UNCONTACTED_DAYS;
  return lead.stage === "in_program" && sameMonth(lead.stage_entered_at, today);
}

export interface PipelineCounters {
  week: number;
  uncontacted: number;
  contracts: number;
  signed_month: number;
  /** Assessments submitted this month and how many of all leads entered the program this month. */
  month_assessments: number;
  conversion_pct: number | null;
}

export function buildPipelineCounters(leads: Lead[], today: string = TODAY): PipelineCounters {
  const signed = leads.filter((l) => matchesQuick(l, "signed_month", today)).length;
  const monthAssessments = leads.filter((l) => sameMonth(l.submitted_at, today)).length;
  return {
    week: leads.filter((l) => matchesQuick(l, "week", today)).length,
    uncontacted: leads.filter((l) => matchesQuick(l, "uncontacted", today)).length,
    contracts: leads.filter((l) => l.stage === "contract").length,
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
}

const ALL_STAGES: LeadStage[] = [...LEAD_STAGES, "discarded"];
const BANDS: LeadBand[] = ["high", "mid", "low", "track"];
export const INDUSTRIES: LeadIndustry[] = ["construction", "remodeling", "cleaning", "restaurant", "salon"];
export const REVENUES: RevenueRange[] = ["lt_250k", "250k_500k", "500k_1m", "1m_3m", "gt_3m"];
const QUICKS: LeadQuick[] = ["week", "uncontacted", "signed_month"];
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
  return out;
}

export function filterLeads<T extends Lead>(leads: T[], s: LeadsSearch, today: string = TODAY): T[] {
  return leads.filter(
    (l) =>
      (!s.stage || l.stage === s.stage) &&
      (!s.consultant || l.consultant_user_id === s.consultant) &&
      (!s.band || l.result.band === s.band) &&
      (!s.industry || l.business.industry === s.industry) &&
      (!s.revenue || l.business.revenue_range === s.revenue) &&
      (!s.quick || matchesQuick(l, s.quick, today)),
  );
}

/** Board/table order: longest in stage first. */
export const byTimeInStage = (a: Lead, b: Lead) => a.stage_entered_at.localeCompare(b.stage_entered_at);

export const isActiveStage = (s: LeadStage): s is ActiveLeadStage => s !== "discarded";
