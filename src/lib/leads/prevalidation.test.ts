import { describe, expect, it } from "vitest";
import type { AreaCode, Task } from "@/lib/api/types";
import { blocks } from "@/lib/api/mock/seed-leads";
import { DEFAULT_ASSESSMENT_AREA_MAP, checkPreValidation, existingSummary, markPreValidation, strongAreas, validAreaMap } from "./prevalidation";

type T = Pick<Task, "area" | "status" | "pre_validation" | "approval_source">;
const task = (area: AreaCode, patch: Partial<T> = {}): T => ({ area, status: "pending", pre_validation: null, approval_source: null, ...patch });

describe("Ya lo tenía: marks at the start of the program", () => {
  it("maps strong blocks to areas (Tu información y tus acuerdos → B4 and B6)", () => {
    // Order: time_team, work_quality, money, clients_sales, information, experience, direction.
    expect(strongAreas(blocks("mmmmsmm"))).toEqual(["B4", "B6"]);
    expect(strongAreas(blocks("ssmmmmm"))).toEqual(["B2"]);
    expect(strongAreas(blocks("mmmsmms"))).toEqual(["B1", "B5"]);
    expect(strongAreas(blocks("mmmmmmm"))).toEqual([]);
  });
  it("uses the map SM Global edits", () => {
    expect(strongAreas(blocks("mmsmmmm"), { ...DEFAULT_ASSESSMENT_AREA_MAP, money: ["B3", "B4"] })).toEqual(["B3", "B4"]);
  });
  it("marks only tasks not started of the strong areas", () => {
    const out = markPreValidation([task("B5"), task("B5", { status: "in_progress" }), task("B5", { status: "accepted" }), task("B2")], ["B5"]);
    expect(out.map((t) => t.pre_validation ?? null)).toEqual(["pending", null, null, null]);
  });
  it("decides only a task marked and not started; Ya lo tenía needs evidence", () => {
    const marked = task("B5", { pre_validation: "pending" });
    expect(checkPreValidation(marked, { decision: "existing", evidence_file_name: "manual.pdf", note: "" })).toBeNull();
    expect(checkPreValidation(marked, { decision: "existing", evidence_file_name: "  ", note: "" })).toBe("evidence_required");
    expect(checkPreValidation(marked, { decision: "needed" })).toBeNull();
    expect(checkPreValidation(task("B5"), { decision: "needed" })).toBe("not_marked");
    expect(checkPreValidation(task("B5", { pre_validation: "pending", status: "in_progress" }), { decision: "needed" })).toBe("not_marked");
  });
  it("undo works on a decided task nobody moved since", () => {
    expect(checkPreValidation(task("B5", { pre_validation: "existing", status: "accepted" }), { decision: "pending" })).toBeNull();
    expect(checkPreValidation(task("B5", { pre_validation: "needed" }), { decision: "pending" })).toBeNull();
    expect(checkPreValidation(task("B5", { pre_validation: "needed", status: "in_progress" }), { decision: "pending" })).toBe("not_resolved");
    expect(checkPreValidation(task("B5", { pre_validation: "pending" }), { decision: "pending" })).toBe("not_resolved");
  });
  it("'Ya tenías resueltas N tareas: arrancas con X%' counts only approvals as Ya existía, over active tasks", () => {
    const tasks = [
      task("B5", { status: "accepted", approval_source: "existing" }),
      task("B5", { status: "accepted", approval_source: "existing" }),
      task("B5", { status: "accepted", approval_source: "deliverable" }),
      task("B2"),
      task("B2", { status: "cancelled" }),
    ];
    expect(existingSummary(tasks)).toEqual({ count: 2, total: 4, pct: 50 });
    expect(existingSummary([])).toEqual({ count: 0, total: 0, pct: 0 });
  });
  it("accepts only complete maps with valid areas", () => {
    expect(validAreaMap(DEFAULT_ASSESSMENT_AREA_MAP)).toBe(true);
    expect(validAreaMap({ ...DEFAULT_ASSESSMENT_AREA_MAP, money: ["B3", "B3"] })).toBe(false);
    expect(validAreaMap({ ...DEFAULT_ASSESSMENT_AREA_MAP, money: ["B9" as AreaCode] })).toBe(false);
  });
});
