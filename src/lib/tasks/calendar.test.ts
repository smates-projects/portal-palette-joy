import { describe, expect, it } from "vitest";
import { buildCalendarItems, monthGrid, shiftAnchor, weekDays } from "./calendar";
import type { Meeting, TaskWithComputed } from "@/lib/api/types";

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
});
