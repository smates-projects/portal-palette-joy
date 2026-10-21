// Automatic entry of a lead: the four entry phases live INSIDE the stages Evaluado and Reunión (sub-state), never as
// stages of their own. Pure rules shared by the mock and the screens; the Laravel backend applies the same ones.
import { todayIso, nowIso } from "@/lib/clock";
import type { Lead, LeadMeeting, RoutingRules } from "@/lib/api/types";

const daysSince = (iso: string, today: string) =>
  Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/**
 * 1 Assessment completado (Evaluado) · 2 Reunión agendada · 3 Resumen enviado · 4 Reunión hecha (Reunión).
 * The assessment sends no email: the person sees the result on screen and books with the consultant's calendar.
 * Only the booking sends the summary email, with the date, time and Meet link, so summary_sent_at never exists
 * without a meeting. 1 to 3 happen by themselves; after 4 the consultant writes a note and accepts or discards.
 */
export const ENTRY_PHASES = ["assessment", "meeting_scheduled", "summary_sent", "meeting_held"] as const;
export type EntryPhase = (typeof ENTRY_PHASES)[number];

/** Evaluated with no booking this many days after the assessment: "Sin reservar hace N días" (SM calls). */
export const UNBOOKED_DAYS = 2;

/** The meeting is over once its start plus its duration has passed. */
export const meetingHeld = (m: Pick<LeadMeeting, "starts_at" | "duration_minutes">, now: string = nowIso()) =>
  Date.parse(m.starts_at) + m.duration_minutes * 60_000 <= Date.parse(now);

/**
 * Phase 4 is reached when the consultant answered "Se hizo", or when the time passed and nobody answered yet. A
 * meeting answered as no-show or to reschedule did not happen: the lead waits for the next booking.
 */
const reachedHeld = (m: LeadMeeting, now: string) =>
  m.outcome === "held" || (!m.outcome && meetingHeld(m, now));

type EntryLead = Pick<Lead, "stage" | "discarded_from" | "summary_sent_at" | "meeting">;

/** Stage the entry phase is read from: a discarded lead keeps the phase it had when SM discarded it. */
const baseStage = (l: Pick<Lead, "stage" | "discarded_from">) => (l.stage === "discarded" ? l.discarded_from ?? "evaluated" : l.stage);

/**
 * Last entry phase reached, from the stage plus meeting and summary_sent_at. Past Reunión every phase is done.
 * Booked and not yet emailed ("meeting_scheduled" with a meeting) lasts minutes; moved to Reunión by hand
 * (no meeting) also stays there.
 */
export function entryPhase(lead: EntryLead, now: string = nowIso()): EntryPhase {
  const stage = baseStage(lead);
  if (stage !== "evaluated" && stage !== "meeting") return "meeting_held";
  if (!lead.meeting) return stage === "meeting" ? "meeting_scheduled" : "assessment";
  if (stage === "meeting" && reachedHeld(lead.meeting, now)) return "meeting_held";
  return lead.summary_sent_at ? "summary_sent" : "meeting_scheduled";
}

export type EntryStepState = "done" | "current" | "pending";
export interface EntryStep {
  phase: EntryPhase;
  state: EntryStepState;
  /** When it happened (null if not yet, or unknown for meetings SM moved by hand). */
  at: string | null;
}

/**
 * The line of four phases of the lead detail. The reached phase is "current" while the lead is still entering
 * (Evaluado or Reunión); from Documentación on, all four are done.
 */
export function entryTimeline(lead: EntryLead & Pick<Lead, "submitted_at" | "stage_entered_at">, now: string = nowIso()): EntryStep[] {
  const reached = ENTRY_PHASES.indexOf(entryPhase(lead, now));
  const entering = ["evaluated", "meeting"].includes(baseStage(lead));
  const m = lead.meeting;
  // "Se hizo" answered: the meeting phase is done right away, even while the lead still sits in Reunión.
  const heldAnswered = m?.outcome === "held";
  const dates: Record<EntryPhase, string | null> = {
    assessment: lead.submitted_at,
    // Moved to Reunión by hand (no booking): the day it entered the stage.
    meeting_scheduled: m?.booked_at ?? (baseStage(lead) === "meeting" ? lead.stage_entered_at : null),
    summary_sent: lead.summary_sent_at,
    meeting_held: m && reachedHeld(m, now) ? m.starts_at : null,
  };
  return ENTRY_PHASES.map((phase, i) => ({
    phase,
    state: i < reached || (i === reached && (!entering || (phase === "meeting_held" && heldAnswered))) ? "done" : i === reached ? "current" : "pending",
    at: i <= reached ? dates[phase] : null,
  }));
}

/** Days since the assessment of an evaluated lead without booking (null when it does not apply or is under 2 days). */
export function unbookedDays(lead: Pick<Lead, "stage" | "submitted_at" | "meeting"> & Partial<Pick<Lead, "source">>, today: string = todayIso()): number | null {
  // Added by hand: there was no on-screen result with a booking button, so there is nothing to wait for.
  if (lead.stage !== "evaluated" || lead.meeting || lead.source === "manual") return null;
  const d = daysSince(lead.submitted_at, today);
  return d >= UNBOOKED_DAYS ? d : null;
}

/** "Nuevo": arrived today, still in Evaluado and nobody from SM touched it. Shown first in its column. */
export const isNewLead = (lead: Pick<Lead, "stage" | "submitted_at" | "last_contact_at">, today: string = todayIso()) =>
  lead.stage === "evaluated" && !lead.last_contact_at && lead.submitted_at.slice(0, 10) === today;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Office for a new lead: a city zone wins over a state zone; with no match, the default office. Both city and
 * state compare without accents or case ("Doral, fl" = "Doral, FL").
 */
export function resolveOffice(rules: RoutingRules, place: { state: string; city: string }): string {
  const state = norm(place.state);
  const city = norm(place.city);
  const inState = rules.zones.filter((z) => norm(z.state) === state);
  return (
    inState.find((z) => z.city !== null && norm(z.city) === city)?.office_id ??
    inState.find((z) => z.city === null)?.office_id ??
    rules.default_office_id
  );
}

/** What the zone validation rejects: a state that is not a two-letter code, or a zone that already exists. */
export function validateZone(rules: RoutingRules, input: { id?: string | undefined; state: string; city: string | null }): "state" | "duplicate" | null {
  if (!/^[A-Za-z]{2}$/.test(input.state.trim())) return "state";
  const city = input.city?.trim() ? norm(input.city) : null;
  const dup = rules.zones.some((z) => z.id !== input.id && norm(z.state) === norm(input.state) && (z.city ? norm(z.city) : null) === city);
  return dup ? "duplicate" : null;
}

/** Three items at most, as the summary email shows them. */
export const emailItems = (items: string[]) => items.slice(0, 3);
