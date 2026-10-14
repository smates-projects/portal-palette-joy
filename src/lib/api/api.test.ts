import { describe, expect, it } from "vitest";
import { canTransition, isBlocked, isOverdue, withComputed } from "./computed";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";

const all = seed.tasks.map((t) => withComputed(t, seed.tasks, "2026-10-14"));

describe("task rules", () => {
  it("firm can move pending -> in_progress -> submitted, and changes_requested -> submitted", () => {
    expect(canTransition("partner_firm", "pending", "in_progress")).toBe(true);
    expect(canTransition("partner_firm", "in_progress", "submitted")).toBe(true);
    expect(canTransition("partner_firm", "changes_requested", "submitted")).toBe(true);
  });
  it("only the owner (or SM) approves or requests changes", () => {
    expect(canTransition("partner_firm", "submitted", "accepted")).toBe(false);
    expect(canTransition("business_owner", "submitted", "accepted")).toBe(true);
    expect(canTransition("business_owner", "submitted", "changes_requested")).toBe(true);
    expect(canTransition("sm_team", "submitted", "accepted")).toBe(true);
  });
  it("blocked = depends on a task not accepted", () => {
    const b604 = seed.tasks.find((t) => t.code === "B6-04" && t.business_id === seed.BIZ_VOSSLER)!;
    expect(isBlocked(b604, seed.tasks)).toBe(true);
    const b602 = seed.tasks.find((t) => t.id === seed.TASK_B602_VOSSLER)!;
    expect(isBlocked(b602, seed.tasks)).toBe(false);
  });
  it("overdue = due date passed and not accepted", () => {
    const base = seed.tasks[0]!;
    expect(isOverdue({ ...base, status: "in_progress", due_date: "2026-10-13" }, "2026-10-14")).toBe(true);
    expect(isOverdue({ ...base, status: "accepted", due_date: "2026-10-13" }, "2026-10-14")).toBe(false);
    expect(isOverdue({ ...base, status: "in_progress", due_date: "2026-10-14" }, "2026-10-14")).toBe(false);
  });
});

describe("seed data", () => {
  it("has 30 tasks and the required minimums", () => {
    expect(all).toHaveLength(30);
    expect(all.filter((t) => t.is_blocked).length).toBeGreaterThanOrEqual(2);
    expect(all.filter((t) => t.is_overdue).length).toBeGreaterThanOrEqual(2);
    expect(all.filter((t) => t.status === "changes_requested").length).toBeGreaterThanOrEqual(2);
    expect(all.filter((t) => t.status === "submitted").length).toBeGreaterThanOrEqual(2);
  });
});

describe("mock authorization", () => {
  it("a firm only sees its own tasks and switching firm changes the view", async () => {
    const api = createMockApi();
    const perez = await api.tasks.list();
    expect(perez).toHaveLength(15);
    expect(perez.every((t) => t.organization_id === seed.ORG_PEREZ)).toBe(true);
    await api.session.setViewAs(seed.U_TOMAS);
    const xyz = await api.tasks.list();
    expect(xyz.every((t) => t.organization_id === seed.ORG_XYZ)).toBe(true);
  });
  it("owner and SM views are not available yet", async () => {
    const api = createMockApi();
    await expect(api.session.setViewAs(seed.U_CARLA)).rejects.toThrow();
  });
});

describe("task detail actions (partner firm)", () => {
  const b601Enyermy = seed.tasks.find((t) => t.code === "B6-01" && t.business_id === seed.BIZ_ENYERMY)!;
  const b602Enyermy = seed.tasks.find((t) => t.code === "B6-02" && t.business_id === seed.BIZ_ENYERMY)!;

  it("submitting a deliverable creates a new 'submitted' version and moves the task to submitted", async () => {
    const api = createMockApi();
    const v = await api.tasks.submitVersion(b601Enyermy.id, { note: "", file_names: ["a.pdf"] });
    expect(v.version).toBe(1);
    expect(v.status).toBe("submitted");
    const d = await api.tasks.get(b601Enyermy.id);
    expect(d?.task.status).toBe("submitted");
  });
  it("a deliverable needs at least one file", async () => {
    const api = createMockApi();
    await expect(api.tasks.submitVersion(b601Enyermy.id, { note: "x", file_names: [] })).rejects.toThrow();
  });
  it("a blocked task cannot be started", async () => {
    const api = createMockApi();
    await expect(api.tasks.start(b602Enyermy.id)).rejects.toThrow();
  });
  it("the firm cannot approve its own deliverable", async () => {
    const api = createMockApi();
    await expect(api.tasks.updateStatus(seed.TASK_B602_VOSSLER, "accepted")).rejects.toThrow();
  });
});
