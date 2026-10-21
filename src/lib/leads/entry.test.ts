import { describe, expect, it } from "vitest";
import type { Lead, LeadMeeting, RoutingRules } from "@/lib/api/types";
import { entryPhase, entryTimeline, isNewLead, meetingHeld, resolveOffice, unbookedDays, validateZone } from "./entry";
import { primaryActionFor } from "./pipeline";

const meeting = (starts_at: string, notes_at: string | null = null): LeadMeeting => ({
  starts_at, duration_minutes: 30, meet_url: "https://meet.google.com/abc-defg-hij", consultant_user_id: "c", booked_at: "2026-10-13T15:00:00Z", notes_at,
});
type EntryLead = Pick<Lead, "stage" | "discarded_from" | "summary_sent_at" | "meeting" | "submitted_at" | "stage_entered_at">;
const lead = (patch: Partial<EntryLead>): EntryLead => ({
  stage: "evaluated", discarded_from: null, summary_sent_at: null, meeting: null,
  submitted_at: "2026-10-12T13:00:00Z", stage_entered_at: "2026-10-12T13:00:00Z", ...patch,
});
/** Booked on Oct 13: the summary email goes out with the booking. */
const booked = (starts_at: string, patch: Partial<EntryLead> = {}) =>
  lead({ stage: "meeting", meeting: meeting(starts_at), summary_sent_at: "2026-10-13T15:05:00Z", ...patch });
const NOW = "2026-10-14T16:00:00Z";

describe("entry phase inside the stage", () => {
  it("Evaluado without a meeting is phase 1 (the assessment sends no email)", () => {
    expect(entryPhase(lead({}), NOW)).toBe("assessment");
  });
  it("an evaluated lead without a meeting stays in assessment however many days pass", () => {
    expect(entryPhase(lead({ submitted_at: "2026-10-01T13:00:00Z" }), NOW)).toBe("assessment");
    expect(unbookedDays(lead({ submitted_at: "2026-10-01T13:00:00Z" }), "2026-10-14")).toBe(13);
  });
  it("Reunión: booked, then summary sent with the meeting, then held when it is over", () => {
    // Booked and the email not out yet (a window of minutes).
    expect(entryPhase(booked("2026-10-15T14:00:00Z", { summary_sent_at: null }), NOW)).toBe("meeting_scheduled");
    expect(entryPhase(booked("2026-10-15T14:00:00Z"), NOW)).toBe("summary_sent");
    // Over at start + 30 minutes.
    expect(entryPhase(booked("2026-10-14T15:30:00Z"), NOW)).toBe("meeting_held");
    expect(entryPhase(booked("2026-10-14T15:45:00Z"), NOW)).toBe("summary_sent");
    // Moved to Reunión by hand: no booking and no email, still "Reunión agendada".
    expect(entryPhase(lead({ stage: "meeting" }), NOW)).toBe("meeting_scheduled");
  });
  it("past Reunión every phase is done; a discarded lead keeps the phase it had", () => {
    expect(entryPhase(lead({ stage: "documents" }), NOW)).toBe("meeting_held");
    expect(entryPhase(lead({ stage: "discarded", discarded_from: "evaluated" }), NOW)).toBe("assessment");
    expect(entryPhase(booked("2026-10-15T14:00:00Z", { stage: "discarded", discarded_from: "meeting" }), NOW)).toBe("summary_sent");
  });
  it("the line of phases marks done, current and pending with their dates, the summary after the booking", () => {
    const steps = entryTimeline(booked("2026-10-15T14:00:00Z"), NOW);
    expect(steps.map((s) => s.phase)).toEqual(["assessment", "meeting_scheduled", "summary_sent", "meeting_held"]);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "pending"]);
    expect(steps.map((s) => s.at)).toEqual(["2026-10-12T13:00:00Z", "2026-10-13T15:00:00Z", "2026-10-13T15:05:00Z", null]);
    expect(entryTimeline(lead({}), NOW).map((s) => s.state)).toEqual(["current", "pending", "pending", "pending"]);
    expect(entryTimeline(lead({ stage: "accepted", meeting: meeting("2026-10-01T14:00:00Z", "2026-10-01T15:00:00Z") }), NOW).every((s) => s.state === "done")).toBe(true);
  });
  it("Reunión hecha is done as soon as the outcome is held; a rescheduled meeting is not held", () => {
    const held = booked("2026-10-14T15:30:00Z", { meeting: { ...meeting("2026-10-14T15:30:00Z", NOW), outcome: "held" } });
    expect(entryTimeline(held, NOW).map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    const waiting = booked("2026-10-14T15:30:00Z");
    expect(entryTimeline(waiting, NOW)[3].state).toBe("current");
    const moved = booked("2026-10-14T15:30:00Z", { meeting: { ...meeting("2026-10-14T15:30:00Z", NOW), outcome: "reschedule" } });
    expect(entryPhase(moved, NOW)).toBe("summary_sent");
  });
  it("one primary action at a time in Reunión: join, then the outcome; without a booking, the NDA and then the MOU", () => {
    expect(primaryActionFor({ stage: "meeting", meeting: meeting("2026-10-15T14:00:00Z") }, NOW)).toBe("join_meet");
    expect(primaryActionFor({ stage: "meeting", meeting: meeting("2026-10-14T10:00:00Z") }, NOW)).toBe("meeting_outcome");
    expect(primaryActionFor({ stage: "meeting", meeting: { ...meeting("2026-10-14T10:00:00Z"), outcome: "no_show" } }, NOW)).toBe("rebook");
    expect(primaryActionFor({ stage: "meeting", meeting: null }, NOW)).toBe("send_nda");
    expect(primaryActionFor({ stage: "meeting", meeting: null, intake: {} as never }, NOW)).toBe("send_mou");
  });
  it("meetingHeld uses the end of the meeting", () => {
    expect(meetingHeld(meeting("2026-10-14T15:30:00Z"), NOW)).toBe(true);
    expect(meetingHeld(meeting("2026-10-14T15:31:00Z"), NOW)).toBe(false);
  });
});

describe("Evaluado without booking", () => {
  it("shows 'Sin reservar hace N días' from the second day after the assessment (submitted_at)", () => {
    expect(unbookedDays(lead({ submitted_at: "2026-10-13T13:00:00Z" }), "2026-10-14")).toBeNull();
    expect(unbookedDays(lead({ submitted_at: "2026-10-12T13:00:00Z" }), "2026-10-14")).toBe(2);
    // No summary_sent_at is needed: the count runs from the assessment.
    expect(unbookedDays(lead({ submitted_at: "2026-10-10T13:00:00Z", summary_sent_at: null }), "2026-10-14")).toBe(4);
    expect(unbookedDays(lead({ stage: "meeting" }), "2026-10-20")).toBeNull();
    expect(unbookedDays({ ...lead({}), meeting: meeting("2026-10-15T14:00:00Z") }, "2026-10-20")).toBeNull();
    expect(unbookedDays({ ...lead({}), source: "manual" }, "2026-10-20")).toBeNull();
  });
  it("'Nuevo' only for a lead that arrived today and nobody touched", () => {
    const base = { stage: "evaluated" as const, submitted_at: "2026-10-14T09:00:00Z", last_contact_at: null };
    expect(isNewLead(base, "2026-10-14")).toBe(true);
    expect(isNewLead({ ...base, last_contact_at: "2026-10-14T10:00:00Z" }, "2026-10-14")).toBe(false);
    expect(isNewLead({ ...base, submitted_at: "2026-10-13T09:00:00Z" }, "2026-10-14")).toBe(false);
  });
});

describe("zone routing", () => {
  const rules: RoutingRules = {
    default_office_id: "miami",
    zones: [
      { id: "1", state: "FL", city: null, office_id: "orlando" },
      { id: "2", state: "FL", city: "Miami", office_id: "miami" },
      { id: "3", state: "TX", city: null, office_id: "houston" },
    ],
  };
  it("a city zone wins over its state; with no city, the state", () => {
    expect(resolveOffice(rules, { state: "FL", city: "Miami" })).toBe("miami");
    expect(resolveOffice(rules, { state: "fl", city: "Orlando" })).toBe("orlando");
    expect(resolveOffice(rules, { state: "TX", city: "San Antonio" })).toBe("houston");
  });
  it("no match goes to the default office; accents and case do not matter", () => {
    expect(resolveOffice(rules, { state: "GA", city: "Atlanta" })).toBe("miami");
    expect(resolveOffice({ ...rules, zones: [{ id: "4", state: "NY", city: "Bogotá", office_id: "x" }] }, { state: "ny", city: "BOGOTA" })).toBe("x");
    expect(resolveOffice({ zones: [], default_office_id: "miami" }, { state: "FL", city: "Tampa" })).toBe("miami");
  });
  it("validates two-letter states and repeated zones", () => {
    expect(validateZone(rules, { state: "Florida", city: null })).toBe("state");
    expect(validateZone(rules, { state: "fl", city: "miami" })).toBe("duplicate");
    expect(validateZone(rules, { id: "2", state: "FL", city: "Miami" })).toBeNull();
    expect(validateZone(rules, { state: "FL", city: "Tampa" })).toBeNull();
  });
});
