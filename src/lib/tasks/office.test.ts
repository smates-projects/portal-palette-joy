import { describe, expect, it } from "vitest";
import type { Business, Franchisability, Organization, TaskWithComputed, User } from "@/lib/api/types";
import { buildBusinessRows, buildTeamRows, businessAreaHealth, expectedFranchisePct, filterBusinessRows, firmForArea, franchiseHealth } from "./office";

const T = "2026-10-14";
const task = (p: Partial<TaskWithComputed>): TaskWithComputed =>
  ({ id: Math.random().toString(), code: "B1-01", area: "B1", status: "pending", due_date: "2026-12-01", business_id: "a", supervisor_user_id: "nico", organization_id: "sm", is_overdue: false, is_blocked: false, ...p }) as TaskWithComputed;
const biz = (id: string, name: string, industry = "Limpieza"): Business => ({ id, name, industry, city: "Miami", state: "FL", owner_user_id: "o", status: "in_program", program_start_date: T, program_day: 90, office_id: "sm", consultant_id: "nico" });
const f = (pct: number, missing: string[] = []): Franchisability => ({ business_id: "a", franchisability_pct: pct, franchisability_goal: 85, required_task_codes: [], missing_required: missing, is_ready: pct >= 85 && !missing.length });

describe("negocios", () => {
  it("orders red businesses first", () => {
    const tasks = [task({ business_id: "a" }), task({ business_id: "b", is_overdue: true, due_date: "2026-10-01" })];
    const rows = buildBusinessRows([biz("a", "Alfa"), biz("b", "Beta")], tasks, [], [], [], T);
    expect(rows.map((r) => r.business.name)).toEqual(["Beta", "Alfa"]);
    expect(rows[0]!.health).toBe("red");
  });
  it("consultant is the business's own consultant_id, not deduced from tasks", () => {
    const users = [{ id: "nico", full_name: "Nicolás" }, { id: "mari", full_name: "Marilyn" }] as User[];
    const rows = buildBusinessRows([{ ...biz("a", "Alfa"), consultant_id: "mari" }], [task({ supervisor_user_id: "nico" })], [], users, [], T);
    expect(rows[0]!.consultant?.id).toBe("mari");
  });
  it("an area with no tasks yet is green, not grey", () => {
    expect(businessAreaHealth([], [], T)).toBe("green");
  });
  it("filters by health and industry", () => {
    const rows = buildBusinessRows([biz("a", "Alfa", "Limpieza"), biz("b", "Beta", "Obra")], [task({ business_id: "a" }), task({ business_id: "b", is_overdue: true })], [], [], [], T);
    expect(filterBusinessRows(rows, { health: "red" }).map((r) => r.business.id)).toEqual(["b"]);
    expect(filterBusinessRows(rows, { industry: "Limpieza" }).map((r) => r.business.id)).toEqual(["a"]);
  });
});

describe("franchisability light (pace)", () => {
  it("expected = day / 180 x 85", () => {
    expect(expectedFranchisePct(90, 85)).toBe(43);
    expect(expectedFranchisePct(180, 85)).toBe(85);
  });
  it("green at or above expected", () => {
    expect(franchiseHealth(f(43), 90)).toBe("green");
    expect(franchiseHealth(f(50), 90)).toBe("green");
  });
  it("amber up to 10 points below, red beyond", () => {
    expect(franchiseHealth(f(33), 90)).toBe("amber");
    expect(franchiseHealth(f(32), 90)).toBe("red");
  });
});

describe("firms and team", () => {
  const orgs = [{ id: "sm", kind: "sm", area: null }, { id: "x", kind: "partner_firm", area: "B5" }] as Organization[];
  it("strategy goes to the office's own team; other areas to their firm", () => {
    expect(firmForArea("B1", orgs)?.id).toBe("sm");
    expect(firmForArea("B5", orgs)?.id).toBe("x");
  });
  it("team lists only SM people of the office", () => {
    const users = [
      { id: "nico", role: "sm_team", organization_id: "sm", full_name: "Nicolás", booking_url: null },
      { id: "o", role: "business_owner", organization_id: null, full_name: "Carla", booking_url: null },
    ] as User[];
    const rows = buildTeamRows(users, "sm", [task({})], [biz("a", "Alfa")]);
    expect(rows.map((r) => r.user.id)).toEqual(["nico"]);
    expect(rows[0]!.supervises.map((b) => b.id)).toEqual(["a"]);
    expect(rows[0]!.has_booking_url).toBe(false);
  });
});
