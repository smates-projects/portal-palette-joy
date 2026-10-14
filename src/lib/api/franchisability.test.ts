import { describe, expect, it } from "vitest";
import { computeFranchisability } from "./franchisability";
import type { Business, Task } from "./types";

const biz = (over: Partial<Business> = {}) => ({ id: "b", ...over }) as Business;
const task = (code: string, status: string) => ({ business_id: "b", code, status }) as Task;

describe("franchisability", () => {
  it("default goal is 85% and default required list has the six tasks", () => {
    const f = computeFranchisability(biz(), []);
    expect(f.franchisability_goal).toBe(85);
    expect(f.required_task_codes).toEqual(["B1-01", "B2-03", "B3-01", "B3-07", "B6-01", "B6-06"]);
  });
  it("percentage ignores cancelled and third-party tasks", () => {
    const f = computeFranchisability(biz(), [task("A", "accepted"), task("B", "pending"), task("C", "cancelled"), task("D", "with_third_party")]);
    expect(f.franchisability_pct).toBe(50);
  });
  it("not ready if required tasks are missing even above the goal", () => {
    const f = computeFranchisability(biz(), [X], { goal: 85, required_task_codes: ["B3-07"] }, [task("A", "accepted"), task("B3-07", "pending")]);
    expect(f.franchisability_pct).toBe(50);
    expect(f.missing_required).toEqual(["B3-07"]);
    const g = computeFranchisability(biz({ franchisability_goal: 50, required_task_codes: ["B3-07"] }), [task("A", "accepted"), task("B3-07", "pending")]);
    expect(g.is_ready).toBe(false);
  });
  it("empty required list: reaching the goal is enough", () => {
    const f = computeFranchisability(biz({ franchisability_goal: 50, required_task_codes: [] }), [task("A", "accepted"), task("B", "pending")]);
    expect(f.is_ready).toBe(true);
  });
});
