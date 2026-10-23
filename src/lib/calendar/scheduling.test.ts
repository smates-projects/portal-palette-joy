import { describe, expect, it } from "vitest";
import type { PortalMeeting } from "@/lib/api/types";
import {
  addPerson, availabilityWindow, canManageMeeting, canSearchSlots, isCalendarConnected, joinNames, meetingHoursOf, needsReconnect,
  planMeeting, responseLabelKey, scheduleOutcome, unavailableKind, validateMeetingHours,
} from "./scheduling";

describe("responseLabelKey (a guest's answer next to their name)", () => {
  it("needsAction on a confirmed meeting reads 'Invitación enviada'; on a proposal it stays 'Sin responder'", () => {
    expect(responseLabelKey("needsAction", "confirmed")).toBe("invited");
    expect(responseLabelKey("needsAction", "proposed")).toBe("needsAction");
    expect(responseLabelKey("accepted", "confirmed")).toBe("accepted");
    expect(responseLabelKey("declined", "confirmed")).toBe("declined");
  });
});

const meeting = (overrides: Partial<PortalMeeting> = {}): PortalMeeting => ({
  id: "m1", kind: "task", task_id: "t1", business_id: "b1", lead_id: null, topic: "Revisar", starts_at: "2026-10-20T15:00:00Z",
  ends_at: "2026-10-20T15:30:00Z", meet_url: null, organizer: { user_id: "org", name: "Lucía Pérez" },
  participants: [
    { user_id: "org", name: "Lucía Pérez", response: "accepted" },
    { user_id: "a", name: "Carla Méndez", response: "needsAction" },
    { user_id: "b", name: "Mariana Ruiz", response: "accepted" },
  ],
  status: "proposed", google_synced: false, version: 1, ...overrides,
});

describe("planMeeting (the fallback decision)", () => {
  it("organizer and every guest connected: confirmed in Google", () => {
    expect(planMeeting({ user_id: "org", connected: true }, [{ user_id: "org", connected: true }, { user_id: "a", connected: true }]))
      .toEqual({ status: "confirmed", google_synced: true, pending_user_ids: [] });
  });

  it("organizer connected, one guest not: the invitation goes out and that guest confirms", () => {
    expect(planMeeting({ user_id: "org", connected: true }, [{ user_id: "a", connected: true }, { user_id: "b", connected: false }]))
      .toEqual({ status: "proposed", google_synced: true, pending_user_ids: ["b"] });
  });

  it("organizer not connected: a proposal every guest confirms, nothing in Google", () => {
    expect(planMeeting({ user_id: "org", connected: false }, [{ user_id: "org", connected: false }, { user_id: "a", connected: true }]))
      .toEqual({ status: "proposed", google_synced: false, pending_user_ids: ["a"] });
  });
});

describe("scheduleOutcome", () => {
  it("a proposal names the guests without an answer", () => {
    expect(scheduleOutcome(meeting())).toEqual({ invitation_sent: false, pending_names: ["Carla Méndez"] });
  });

  it("a confirmed meeting in Google: invitation sent, nobody pending", () => {
    expect(scheduleOutcome(meeting({ status: "confirmed", google_synced: true, meet_url: "https://meet.google.com/abc" })))
      .toEqual({ invitation_sent: true, pending_names: [] });
  });
});

describe("helpers", () => {
  it("joins names with the locale's connector", () => {
    expect(joinNames([], "y")).toBe("");
    expect(joinNames(["Ana"], "y")).toBe("Ana");
    expect(joinNames(["Ana", "Luis", "Carla"], "y")).toBe("Ana, Luis y Carla");
  });

  it("reads why a participant could not be read", () => {
    expect(unavailableKind("calendar_not_connected")).toBe("not_connected");
    expect(unavailableKind("calendar_reconnect_required")).toBe("reconnect");
    expect(unavailableKind("google_error")).toBe("other");
  });

  it("adds each person once and never the organizer", () => {
    const one = addPerson([], { user_id: "a", name: "Ana" }, "me");
    expect(addPerson(one, { user_id: "a", name: "Ana" }, "me")).toBe(one);
    expect(addPerson(one, { user_id: "me", name: "Yo" }, "me")).toBe(one);
    expect(addPerson(one, { user_id: "b", name: "Bea" }, "me").map((p) => p.user_id)).toEqual(["a", "b"]);
  });

  it("asks for slots only with a guest, a topic and an allowed length, under the limit", () => {
    const people = [{ user_id: "a", name: "Ana" }];
    expect(canSearchSlots({ participants: people, topic: "Revisar", duration: 30 })).toBe(true);
    expect(canSearchSlots({ participants: [], topic: "Revisar", duration: 30 })).toBe(false);
    expect(canSearchSlots({ participants: people, topic: "  ", duration: 30 })).toBe(false);
    expect(canSearchSlots({ participants: people, topic: "Revisar", duration: 90 })).toBe(false);
    // The limit is the API's (limits.max_meeting_participants, organizer included).
    const eight = Array.from({ length: 8 }, (_, i) => ({ user_id: `p${i}`, name: `P${i}` }));
    expect(canSearchSlots({ participants: eight, topic: "Revisar", duration: 30 }, { durations: [30, 45, 60], maxParticipants: 8 })).toBe(false);
    expect(canSearchSlots({ participants: eight, topic: "Revisar", duration: 30 }, { durations: [30, 45, 60], maxParticipants: 10 })).toBe(true);
    expect(canSearchSlots({ participants: people, topic: "Revisar", duration: 90 }, { durations: [30, 90], maxParticipants: 10 })).toBe(true);
  });

  it("the slot picker looks 14 days ahead from now", () => {
    expect(availabilityWindow(Date.parse("2026-10-14T12:00:00Z"))).toEqual({ from: "2026-10-14T12:00:00.000Z", to: "2026-10-28T12:00:00.000Z" });
  });

  it("Mover and Cancelar: the organizer and SM; anyone else only says they cannot", () => {
    const m = meeting();
    expect(canManageMeeting(m, { id: "org", role: "partner_firm" })).toBe(true);
    expect(canManageMeeting(m, { id: "x", role: "sm_team" })).toBe(true);
    expect(canManageMeeting(m, { id: "x", role: "sm_global" })).toBe(true);
    expect(canManageMeeting(m, { id: "a", role: "business_owner" })).toBe(false);
    expect(canManageMeeting(m, null)).toBe(false);
  });

  it("connected: the flag when the API sends it, the Google email in older rows", () => {
    expect(isCalendarConnected({ calendar_connected: false, google_calendar_email: "x@gmail.com" })).toBe(false);
    expect(isCalendarConnected({ google_calendar_email: "x@gmail.com" })).toBe(true);
    expect(isCalendarConnected({ google_calendar_email: null })).toBe(false);
    expect(needsReconnect({ connected: false, email: "x@gmail.com", scope: null, status: "reconnect_required" })).toBe(true);
  });

  it("meeting hours: the default until SM Global sets them, and start before end", () => {
    expect(meetingHoursOf({})).toEqual({ start: "09:00", end: "18:00", timezone: "America/New_York" });
    expect(validateMeetingHours({ start: "09:00", end: "18:00", timezone: "America/Chicago" })).toBeNull();
    expect(validateMeetingHours({ start: "18:00", end: "09:00", timezone: "America/Chicago" })).toBe("invalid_meeting_hours");
    expect(validateMeetingHours({ start: "9", end: "18:00", timezone: "America/Chicago" })).toBe("invalid_meeting_hours");
  });
});
