import { describe, expect, it } from "vitest";
import { DEFAULT_MEETING_HOURS, computeFreeSlots, dayInZone, groupSlotsByDay, isSlotFree, zonedTimeToInstant } from "./slots";

const NY = "America/New_York";
const iso = (ms: number) => new Date(ms).toISOString();

describe("time zones", () => {
  it("turns New York wall clock into the instant, daylight saving included", () => {
    expect(iso(zonedTimeToInstant("2026-10-16", "09:00", NY))).toBe("2026-10-16T13:00:00.000Z");
    // Daylight saving ends on Nov 1, 2026: 9:00 is 14:00 UTC from then on.
    expect(iso(zonedTimeToInstant("2026-11-02", "09:00", NY))).toBe("2026-11-02T14:00:00.000Z");
  });

  it("reads the day of an instant in the zone", () => {
    expect(dayInZone("2026-10-17T02:00:00Z", NY)).toBe("2026-10-16");
    expect(dayInZone("2026-10-17T02:00:00Z", "UTC")).toBe("2026-10-17");
  });
});

describe("computeFreeSlots", () => {
  const day = (from: string, to: string, extra: Partial<Parameters<typeof computeFreeSlots>[0]> = {}) =>
    computeFreeSlots({ from, to, durationMinutes: 30, hours: DEFAULT_MEETING_HOURS, busy: [], ...extra });

  it("offers a 30-minute grid from 9:00 to 18:00 New York", () => {
    const slots = day("2026-10-16T00:00:00Z", "2026-10-17T00:00:00Z");
    expect(slots).toHaveLength(18);
    expect(slots[0]).toEqual({ starts_at: "2026-10-16T13:00:00.000Z", ends_at: "2026-10-16T13:30:00.000Z" });
    expect(slots.at(-1)?.ends_at).toBe("2026-10-16T22:00:00.000Z");
  });

  it("a longer meeting must still end by 18:00", () => {
    const slots = day("2026-10-16T00:00:00Z", "2026-10-17T00:00:00Z", { durationMinutes: 60 });
    expect(slots).toHaveLength(17);
    expect(slots.at(-1)?.starts_at).toBe("2026-10-16T21:00:00.000Z");
  });

  it("leaves out busy time and anything before now", () => {
    const busy = [{ start: Date.parse("2026-10-16T13:00:00Z"), end: Date.parse("2026-10-16T14:00:00Z") }];
    const slots = day("2026-10-16T00:00:00Z", "2026-10-17T00:00:00Z", { busy, now: Date.parse("2026-10-16T20:10:00Z") });
    expect(slots.map((s) => s.starts_at)).toEqual(["2026-10-16T20:30:00.000Z", "2026-10-16T21:00:00.000Z", "2026-10-16T21:30:00.000Z"]);
  });

  it("a slot touching a busy block is out, one right after it is in", () => {
    const busy = [{ start: Date.parse("2026-10-16T15:00:00Z"), end: Date.parse("2026-10-16T15:45:00Z") }];
    const starts = day("2026-10-16T00:00:00Z", "2026-10-17T00:00:00Z", { busy }).map((s) => s.starts_at);
    expect(starts).not.toContain("2026-10-16T15:30:00.000Z");
    expect(starts).toContain("2026-10-16T16:00:00.000Z");
  });

  it("follows the meeting hours and zone the rules set", () => {
    const slots = day("2026-10-16T00:00:00Z", "2026-10-17T12:00:00Z", { hours: { start: "10:00", end: "11:00", timezone: "America/Los_Angeles" } });
    expect(slots.map((s) => s.starts_at)).toEqual(["2026-10-16T17:00:00.000Z", "2026-10-16T17:30:00.000Z"]);
  });
});

describe("isSlotFree", () => {
  it("checks the meeting hours of the slot's own day and the busy blocks", () => {
    expect(isSlotFree("2026-10-16T15:00:00Z", 30, DEFAULT_MEETING_HOURS, [])).toBe(true);
    expect(isSlotFree("2026-10-16T12:30:00Z", 30, DEFAULT_MEETING_HOURS, [])).toBe(false);
    expect(isSlotFree("2026-10-16T21:30:00Z", 60, DEFAULT_MEETING_HOURS, [])).toBe(false);
    expect(isSlotFree("2026-10-16T15:00:00Z", 30, DEFAULT_MEETING_HOURS, [{ start: Date.parse("2026-10-16T15:15:00Z"), end: Date.parse("2026-10-16T16:00:00Z") }])).toBe(false);
  });
});

describe("groupSlotsByDay", () => {
  const slot = (starts_at: string) => ({ starts_at, ends_at: starts_at });

  it("groups by the viewer's day, days and times in order", () => {
    const groups = groupSlotsByDay(
      [slot("2026-10-17T14:00:00.000Z"), slot("2026-10-16T21:00:00.000Z"), slot("2026-10-16T13:00:00.000Z")],
      NY,
    );
    expect(groups.map((g) => g.day)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(groups[0]?.slots.map((s) => s.starts_at)).toEqual(["2026-10-16T13:00:00.000Z", "2026-10-16T21:00:00.000Z"]);
  });

  it("a late New York slot belongs to the next day for a viewer in UTC", () => {
    const groups = groupSlotsByDay([slot("2026-10-16T21:30:00.000Z"), slot("2026-10-17T00:30:00.000Z")], "UTC");
    expect(groups.map((g) => [g.day, g.slots.length])).toEqual([["2026-10-16", 1], ["2026-10-17", 1]]);
  });

  it("no slots, no days", () => {
    expect(groupSlotsByDay([], NY)).toEqual([]);
  });
});
