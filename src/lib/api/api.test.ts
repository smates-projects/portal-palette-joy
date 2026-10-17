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
  it("has 139 tasks (91 in the three running programs + 48 approved ones of Bimbo Remodelaciones) and the required minimums", () => {
    expect(all).toHaveLength(139);
    // Bimbo is a remodeling business: it carries the site work tasks too.
    expect(all.filter((t) => t.business_id === seed.BIZ_BIMBO).map((t) => t.code)).toEqual(expect.arrayContaining(["B2-07", "B2-08", "B3-02"]));
    expect(all.filter((t) => t.business_id === seed.BIZ_BIMBO).every((t) => t.status === "accepted")).toBe(true);
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
    // Pérez does B6 for the three running programs (5 each) and did it for Bimbo Remodelaciones too.
    expect(perez).toHaveLength(seed.tasks.filter((t) => t.organization_id === seed.ORG_PEREZ).length);
    expect(perez.filter((t) => t.business_id !== seed.BIZ_BIMBO)).toHaveLength(15);
    expect(perez.every((t) => t.organization_id === seed.ORG_PEREZ)).toBe(true);
    await api.session.setViewAs(seed.U_TOMAS);
    const xyz = await api.tasks.list();
    expect(xyz.every((t) => t.organization_id === seed.ORG_XYZ)).toBe(true);
  });
  it("Nicolás García is offered as the SM team user", async () => {
    const api = createMockApi();
    const opts = await api.session.getViewAsOptions();
    expect(opts.find((o) => o.user.role === "sm_team" && o.enabled)?.user.id).toBe(seed.U_NICOLAS);
  });
  it("the owner sees every task of her program and nothing from other businesses", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    const mine = await api.tasks.list();
    expect(mine).toHaveLength(seed.tasks.filter((t) => t.business_id === seed.BIZ_VOSSLER).length);
    expect(mine).toHaveLength(41);
    expect(mine.every((t) => t.business_id === seed.BIZ_VOSSLER)).toBe(true);
  });
  it("Vossler gets only the catalog B3/B4 tasks that apply, with names taken verbatim from the catalog", () => {
    const codes = seed.tasks.filter((t) => t.business_id === seed.BIZ_VOSSLER && /^B[34]/.test(t.code)).map((t) => t.code);
    expect(codes).not.toContain("B3-15");
    expect(codes).not.toContain("B3-16");
    expect(codes).toContain("B4-03");
    const b301 = seed.tasks.find((t) => t.code === "B3-01")!;
    expect(b301.name).toBe("Paquete financiero histórico depurado / Financial Data Room");
  });
  it("the running programs carry every 'minimo' B1 and B2 task that applies, B1 with SM and B2 with OpsLab", () => {
    const b1b2 = ["B1-01", "B1-02", "B1-03", "B1-04", "B1-05", "B2-01", "B2-02", "B2-03", "B2-04", "B2-05", "B2-06", "B2-09", "B2-16", "B2-17"];
    const construction = ["B2-07", "B2-08"];
    const codesOf = (biz: string) => seed.tasks.filter((t) => t.business_id === biz && /^B[12]-/.test(t.code)).map((t) => t.code).sort();
    expect(codesOf(seed.BIZ_VOSSLER)).toEqual([...b1b2, ...construction].sort());
    expect(codesOf(seed.BIZ_PRIME)).toEqual([...b1b2, ...construction].sort());
    // A cleaning business: change orders and QA/QC apply only to the site work branches.
    expect(codesOf(seed.BIZ_ENYERMY)).toEqual(b1b2.sort());
    const running = seed.tasks.filter((t) => t.business_id !== seed.BIZ_BIMBO);
    expect(running.filter((t) => t.area === "B1").every((t) => t.organization_id === seed.ORG_SM)).toBe(true);
    expect(running.filter((t) => t.area === "B2").every((t) => t.organization_id === seed.ORG_OPSLAB)).toBe(true);
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

describe("owner actions", () => {
  const vossler = (code: string) => seed.tasks.find((t) => t.code === code && t.business_id === seed.BIZ_VOSSLER)!;
  it("approving a delivered task marks it approved", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    const t = await api.tasks.approve(vossler("B3-02").id);
    expect(t.status).toBe("accepted");
  });
  it("requesting changes needs a note", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    await expect(api.tasks.requestChanges(vossler("B4-04").id, "  ")).rejects.toThrow();
    const t = await api.tasks.requestChanges(vossler("B4-04").id, "Falta la orden de garantía.");
    expect(t.status).toBe("changes_requested");
  });
  it("the owner cannot start or deliver a task", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    await expect(api.tasks.start(vossler("B4-06").id)).rejects.toThrow();
  });
  it("a firm cannot approve", async () => {
    const api = createMockApi();
    await expect(api.tasks.approve(vossler("B6-02").id)).rejects.toThrow();
  });
});
