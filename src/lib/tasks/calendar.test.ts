import { describe, expect, it } from "vitest";
import { buildCalendarItems, dedupeMeetings, localDay, monthGrid, shiftAnchor, visibleRange, weekDays } from "./calendar";
import type { LeadMeetingItem, Meeting, PortalMeeting, TaskWithComputed } from "@/lib/api/types";

const task = (id: string, code: string, due: string) => ({ id, code, due_date: due }) as TaskWithComputed;
const meeting = (task_id: string, status: Meeting["status"]) =>
  ({ id: `m-${task_id}-${status}`, task_id, starts_at: "2026-10-16T15:00:00Z", status }) as Meeting;

describe("calendar grid", () => {
  it("month view starts on the Monday on or before the 1st and covers 6 weeks", () => {
    const g = monthGrid("2026-10-14");
    expect(g[0]).toBe("2026-09-28");
    expect(g).toHaveLength(42);
  });
  it("week view runs Monday to Sunday", () => {
    expect(weekDays("2026-10-14")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });
  it("moves by month to the 1st and by week 7 days", () => {
    expect(shiftAnchor("2026-10-14", "month", -1)).toBe("2026-09-01");
    expect(shiftAnchor("2026-10-14", "week", 1)).toBe("2026-10-21");
  });
});

describe("calendar items", () => {
  it("shows meetings only of visible tasks and never cancelled ones", () => {
    const map = buildCalendarItems([task("a", "B6-02", "2026-10-20")], [meeting("a", "proposed"), meeting("a", "cancelled"), meeting("hidden", "confirmed")], []);
    const all = [...map.values()].flat();
    expect(all.filter((i) => i.kind === "meeting")).toHaveLength(1);
    expect(map.get("2026-10-20")?.[0]?.kind).toBe("due");
  });

  it("adds the portal meetings of every kind, timed items before due dates", () => {
    // Local noon: the same calendar day in any time zone the tests run in.
    const portal = { id: "p1", kind: "business", starts_at: new Date("2026-10-20T12:00:00").toISOString(), status: "proposed" } as PortalMeeting;
    const map = buildCalendarItems([task("a", "B6-02", "2026-10-20")], [], [], [], [portal]);
    expect(localDay(portal.starts_at)).toBe("2026-10-20");
    expect(map.get("2026-10-20")?.map((i) => i.kind)).toEqual(["portal", "due"]);
  });

  it("the same meeting from the portal, the task and the guest's Google Calendar shows once", () => {
    const at = new Date("2026-10-21T12:00:00").toISOString();
    const portal = { id: "p1", kind: "task", task_id: "a", topic: "B6-01 · Data Room", starts_at: at, status: "confirmed", google_event_id: "g1", ical_uid: "g1@google.com" } as PortalMeeting;
    const sameTask = { id: "p1", task_id: "a", starts_at: at, status: "confirmed" } as Meeting;
    // Same task and instant written without milliseconds.
    const sameTaskOtherId = { id: "legacy", task_id: "a", starts_at: at.replace(".000Z", "Z"), status: "confirmed" } as Meeting;
    const events = [
      { id: "g1", user_id: "u", title: "Otro título", starts_at: at, duration_minutes: 45 },
      { id: "copy", user_id: "u", title: "x", starts_at: at, duration_minutes: 45, ical_uid: "g1@google.com" },
      { id: "untagged", user_id: "u", title: " b6-01 · data room ", starts_at: at, duration_minutes: 45 },
      { id: "dentist", user_id: "u", title: "Dentista", starts_at: at, duration_minutes: 30 },
    ];
    const lead = { lead_id: "l", business_name: "", owner_name: "", city: "", state: "", meeting: { id: "p1", starts_at: at } } as LeadMeetingItem;
    const map = buildCalendarItems([task("a", "B6-01", "2026-10-30")], [sameTask, sameTaskOtherId], events, [lead], [portal]);
    const day = map.get(localDay(at)) ?? [];
    expect(day.filter((i) => i.kind === "portal")).toHaveLength(1);
    expect(day.filter((i) => i.kind === "meeting" || i.kind === "lead")).toHaveLength(0);
    expect(day.flatMap((i) => (i.kind === "google" ? [i.event.id] : []))).toEqual(["dentist"]);
  });

  it("without portal meetings nothing is dropped", () => {
    const { meetings, events } = dedupeMeetings([meeting("a", "confirmed")], [{ id: "g", user_id: "u", title: "t", starts_at: "2026-10-16T15:00:00Z", duration_minutes: 30 }], [], []);
    expect(meetings).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("the visible range runs from the first day's midnight to the day after the last one", () => {
    const range = visibleRange(["2026-10-12", "2026-10-18"]);
    expect(range.from).toBe(new Date("2026-10-12T00:00:00").toISOString());
    expect(range.to).toBe(new Date("2026-10-19T00:00:00").toISOString());
  });
});
