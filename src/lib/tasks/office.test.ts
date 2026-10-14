import { describe, expect, it } from "vitest";
import type { Business, Franchisability, Organization, TaskWithComputed, User } from "@/lib/api/types";
import { buildBusinessRows, buildTeamRows, consultantOf, filterBusinessRows, firmForArea, franchiseHealth } from "./office";

const T = "2026-10-14";
const task = (p: Partial<TaskWithComputed>): TaskWithComputed =>
  ({ id: Math.random().toString(), code: "B1-01", area: "B1", status: "pending", due_date: "2026-12-01", business_id: "a", supervisor_user_id: "nico", organization_id: "sm", is_overdue: false, is_blocked: false, ...p }) as TaskWithComputed;
const biz = (id: string, name: string, industry = "Salón"): Business => ({ id, name, industry, city: "Miami", state: "FL", owner_user_id: "o", program_start_date: T, program_day: 90, office_id: "sm" });
const f = (pct: number, missing: string[] = []): Franchisability => ({ business_id: "a", franchisability_pct: pct, franchisability_goal: 85, required_task_codes: [], missing_required: missing, is_ready: pct >= 85 && !missing.length });

describe("negocios", () => {
  it("orders red businesses first", () => {
    const tasks = [task({ business_id: "a" }), task({ business_id: "b", is_overdue: true, due_date: "2026-10-01" })];
    const rows = buildBusinessRows([biz("a", "Alfa"), biz("b", "Beta")], tasks, [], [], [], T);
    expect(rows.map((r) => r.business.name)).toEqual(["Beta", "Alfa"]);
    expect(rows[0]!.health).toBe("red");
  });
  it("consultant is the person who supervises most tasks", () => {
    const tasks = [task({ supervisor_user_id: "mari" }), task({ supervisor_user_id: "nico" }), task({ supervisor_user_id: "nico" })];
    expect(consultantOf("a", tasks)).toBe("nico");
  });
  it("filters by health and industry", () => {
    const rows = buildBusinessRows([biz("a", "Alfa", "Salón"), biz("b", "Beta", "Obra")], [task({ business_id: "a" }), task({ business_id: "b", is_overdue: true })], [], [], [], T);
    expect(filterBusinessRows(rows, { health: "red" }).map((r) => r.business.id)).toEqual(["b"]);
    expect(filterBusinessRows(rows, { industry: "Salón" }).map((r) => r.business.id)).toEqual(["a"]);
  });
});

describe("franchisability light", () => {
  it("green only when goal 85% reached and no required task missing", () => {
    expect(franchiseHealth(f(90), 170)).toBe("green");
    expect(franchiseHealth(f(90, ["B6-01"]), 170)).not.toBe("green");
  });
  it("amber when keeping pace with program time, red when behind", () => {
    // Day 90 of 180 → expected 42.5% of the goal.
    expect(franchiseHealth(f(45), 90)).toBe("amber");
    expect(franchiseHealth(f(24), 90)).toBe("red");
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
