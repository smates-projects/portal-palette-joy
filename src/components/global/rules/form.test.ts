import { describe, expect, it } from "vitest";
import type { PlatformRules } from "@/lib/api/network-types";
import { formFromRules, rulesPatch, toggleCode, undoPatch, validateRules } from "./form";

const rules: PlatformRules = { franchisability_goal: 85, required_task_codes: ["B1-01", "B6-01"], area_amber_days: 7, franchisability_amber_tolerance: 10, document_review_days: 15, intake_documents: [] };

describe("validateRules", () => {
  it("accepts the stored rules", () => {
    expect(validateRules(formFromRules(rules))).toEqual({});
  });
  it("rejects a goal outside 1 to 100 and non whole numbers", () => {
    expect(validateRules({ ...formFromRules(rules), franchisability_goal: "0" }).franchisability_goal).toBe("invalid_goal");
    expect(validateRules({ ...formFromRules(rules), franchisability_goal: "101" }).franchisability_goal).toBe("invalid_goal");
    expect(validateRules({ ...formFromRules(rules), franchisability_goal: "" }).franchisability_goal).toBe("invalid_goal");
    expect(validateRules({ ...formFromRules(rules), franchisability_goal: "85.5" }).franchisability_goal).toBe("invalid_goal");
  });
  it("needs at least one day for amber and a tolerance from 0 to 100", () => {
    expect(validateRules({ ...formFromRules(rules), area_amber_days: "0" }).area_amber_days).toBe("invalid_days");
    expect(validateRules({ ...formFromRules(rules), franchisability_amber_tolerance: "-1" }).franchisability_amber_tolerance).toBe("invalid_tolerance");
    expect(validateRules({ ...formFromRules(rules), franchisability_amber_tolerance: "0" })).toEqual({});
  });
});

describe("rulesPatch", () => {
  it("is empty when nothing changed, even if the required list has another order", () => {
    expect(rulesPatch(rules, formFromRules(rules))).toEqual({});
    expect(rulesPatch(rules, { ...formFromRules(rules), required_task_codes: ["B6-01", "B1-01"] })).toEqual({});
  });
  it("sends only the fields that changed, and an empty required list is valid", () => {
    const form = { ...formFromRules(rules), franchisability_goal: "80", required_task_codes: [] };
    expect(rulesPatch(rules, form)).toEqual({ franchisability_goal: 80, required_task_codes: [] });
  });
  it("keeps the stored values to undo a save", () => {
    expect(undoPatch(rules, { franchisability_goal: 80, area_amber_days: 5 })).toEqual({ franchisability_goal: 85, area_amber_days: 7 });
  });
});

describe("toggleCode", () => {
  it("adds a code that is not picked and removes one that is", () => {
    expect(toggleCode(["B1-01"], "B2-03")).toEqual(["B1-01", "B2-03"]);
    expect(toggleCode(["B1-01", "B2-03"], "B1-01")).toEqual(["B2-03"]);
  });
});
