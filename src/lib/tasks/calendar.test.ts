import { describe, expect, it } from "vitest";
import { buildCalendarItems, localDay, monthGrid, shiftAnchor, visibleRange, weekDays } from "./calendar";
import type { Meeting, PortalMeeting, TaskWithComputed } from "@/lib/api/types";

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

  it("the visible range runs from the first day's midnight to the day after the last one", () => {
    const range = visibleRange(["2026-10-12", "2026-10-18"]);
    expect(range.from).toBe(new Date("2026-10-12T00:00:00").toISOString());
    expect(range.to).toBe(new Date("2026-10-19T00:00:00").toISOString());
  });
});
