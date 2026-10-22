import { describe, expect, it } from "vitest";
import { ALL_OFFICES } from "@/lib/office-scope";
import type { MeetingOutcome } from "@/lib/api/entry-types";
import { entryMeetingsOf, globalCalendarView, leadsInView, portalMeetingFilter, registrableLeads, type CalendarLead } from "./global";

const meeting = (starts_at: string) => ({
  id: `m-${starts_at}`, kind: "initial" as const, starts_at, duration_minutes: 30, meet_url: "https://meet.google.com/x", consultant_user_id: "me",
  booked_at: "2026-10-01T12:00:00Z", notes_at: null, outcome: null as MeetingOutcome | null,
});
const lead = (id: string, extra: Partial<CalendarLead> = {}): CalendarLead => ({
  id, office_id: "miami", business_id: null, consultant_user_id: "me", stage: "meeting",
  business: { name: `Biz ${id}` }, contact: { name: `Owner ${id}`, city: "Miami", state: "FL", email: `${id}@x.com` },
  meeting: meeting("2026-10-15T14:00:00Z"), ...extra,
});

describe("SM Global calendar scope", () => {
  it("the whole network and Corporate are her own calendar; any other office is that office", () => {
    expect(globalCalendarView(ALL_OFFICES, "corp")).toEqual({ kind: "own" });
    expect(globalCalendarView("corp", "corp")).toEqual({ kind: "own" });
    expect(globalCalendarView("miami", "corp")).toEqual({ kind: "office", officeId: "miami" });
  });

  it("own: the leads she follows; office: every lead of the office; discarded never", () => {
    const leads = [lead("a"), lead("b", { consultant_user_id: "nico" }), lead("c", { office_id: "tampa" }), lead("d", { stage: "discarded" })];
    expect(leadsInView(leads, { kind: "own" }, "me").map((l) => l.id)).toEqual(["a", "c"]);
    expect(leadsInView(leads, { kind: "office", officeId: "miami" }, "me").map((l) => l.id)).toEqual(["a", "b"]);
    expect(leadsInView(leads, { kind: "own" }, undefined)).toEqual([]);
  });

  it("entry meetings: the initial one in Reunión, the expansion one until held, soonest first", () => {
    const items = entryMeetingsOf([
      lead("late", { meeting: meeting("2026-10-20T14:00:00Z") }),
      lead("early"),
      lead("evaluated", { stage: "evaluated", meeting: null }),
      lead("accepted", { stage: "accepted", expansion_meeting: meeting("2026-10-17T14:00:00Z") }),
      lead("held", { stage: "accepted", expansion_meeting: meeting("2026-10-18T14:00:00Z"), expansion_meeting_held_at: "2026-10-18T15:00:00Z" }),
    ]);
    expect(items.map((i) => i.lead_id)).toEqual(["early", "accepted", "late"]);
    expect(items[0]).toMatchObject({ business_name: "Biz early", owner_name: "Owner early", city: "Miami", state: "FL" });
  });

  it("portal meetings: all of hers in her own calendar; in an office only those about its leads or businesses", () => {
    expect(portalMeetingFilter({ kind: "own" }, [], [])({ lead_id: null, business_id: "x" })).toBe(true);
    const office = portalMeetingFilter({ kind: "office", officeId: "miami" }, [lead("a", { business_id: "biz-a" })], ["biz-b"]);
    expect(office({ lead_id: "a", business_id: null })).toBe(true);
    expect(office({ lead_id: null, business_id: "biz-a" })).toBe(true);
    expect(office({ lead_id: null, business_id: "biz-b" })).toBe(true);
    expect(office({ lead_id: "z", business_id: "biz-z" })).toBe(false);
  });

  it("Registrar reunión: evaluated leads and those whose meeting has to be rebooked", () => {
    const rebook = lead("rebook", { meeting: { ...meeting("2026-10-10T14:00:00Z"), outcome: "no_show" as const } });
    const picked = registrableLeads([lead("evaluated", { stage: "evaluated", meeting: null }), lead("booked", { meeting: meeting("2026-10-20T14:00:00Z") }), rebook]);
    expect(picked.map((l) => l.id)).toEqual(["evaluated", "rebook"]);
  });
});
