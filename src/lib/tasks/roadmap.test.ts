import { describe, expect, it } from "vitest";
import type { Business, TaskWithComputed } from "@/lib/api/types";
import { barGeometry, buildRoadmapRows, programDay, zoomRange } from "./roadmap";

const biz = (id: string, start: string) => ({ id, name: id, program_start_date: start }) as Business;
const task = (code: string, business_id: string, area: string, start: string, due: string) =>
  ({ id: code, code, business_id, area, start_date: start, due_date: due }) as TaskWithComputed;

describe("roadmap", () => {
  it("milestones fall on program days 15, 150 and 180", () => {
    const b = biz("v", "2026-08-02");
    expect(programDay(b, 15)).toBe("2026-08-16");
    expect(programDay(b, 150)).toBe("2026-12-29");
    expect(programDay(b, 180)).toBe("2027-01-28");
  });
  it("week zoom shows 3 weeks from the Monday before this week", () => {
    expect(zoomRange("week", [], [], "2026-10-14")).toEqual({ start: "2026-10-05", end: "2026-10-25" });
  });
  it("month zoom shows 4 months starting last month", () => {
    expect(zoomRange("month", [], [], "2026-10-14")).toEqual({ start: "2026-09-01", end: "2026-12-31" });
  });
  it("program zoom covers from the earliest start to the end of the program", () => {
    expect(zoomRange("program", [biz("v", "2026-08-02")], [], "2026-10-14")).toEqual({ start: "2026-08-01", end: "2027-01-31" });
  });
  it("groups by business then area, tasks by start date", () => {
    const rows = buildRoadmapRows(
      [task("B6-02", "v", "B6", "2026-09-07", "2026-10-09"), task("B5-01", "v", "B5", "2026-08-17", "2026-09-11"), task("B6-01", "v", "B6", "2026-08-17", "2026-09-04")],
      [biz("v", "2026-08-02"), biz("empty", "2026-09-01")],
    );
    expect(rows.map((r) => (r.kind === "task" ? r.task.code : r.kind === "area" ? r.area : r.business.id))).toEqual(["v", "B5", "B5-01", "B6", "B6-01", "B6-02"]);
  });
  it("bar spans start through due inclusive", () => {
    expect(barGeometry({ start_date: "2026-10-05", due_date: "2026-10-07" }, "2026-10-01", 10)).toEqual({ left: 40, width: 30 });
  });
});
