import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import { buildAttention, buildNetworkMatrix, buildSmSummary } from "@/lib/tasks/sm";
import { filterTasks, isStaleSubmission } from "@/lib/tasks/table";
import { withComputed } from "./computed";

const ctx = { businessName: () => "", statusLabel: (s: string) => s };

async function asNicolas() {
  const api = createMockApi();
  await api.session.setViewAs(seed.U_NICOLAS);
  return api;
}

describe("SM team", () => {
  it("sees every task of its office", async () => {
    const api = await asNicolas();
    expect(await api.tasks.list()).toHaveLength(seed.tasks.length);
  });
  it("Mis tareas opens on supervised tasks; sup=all shows the whole office", async () => {
    const api = await asNicolas();
    const all = await api.tasks.list();
    const mine = filterTasks(all, {}, { ...ctx, supervisorId: seed.U_NICOLAS });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => t.supervisor_user_id === seed.U_NICOLAS)).toBe(true);
    expect(filterTasks(all, { sup: "all" }, ctx)).toHaveLength(all.length);
  });
  it("changing the due date is logged and notifies the firm", async () => {
    const api = await asNicolas();
    await api.tasks.update([seed.TASK_B603_VOSSLER], { due_date: "2026-10-31" });
    const d = await api.tasks.get(seed.TASK_B603_VOSSLER);
    const ev = d!.events.at(-1)!;
    expect(ev.kind).toBe("due_changed");
    expect(ev.actor_user_id).toBe(seed.U_NICOLAS);
    expect(ev.change).toEqual({ field: "due_date", from: "2026-10-10", to: "2026-10-31" });
    await api.session.setViewAs(seed.U_LUCIA);
    const n = (await api.notifications.list()).find((x) => x.kind === "task_updated" && x.task_id === seed.TASK_B603_VOSSLER);
    expect(n?.change?.to).toBe("2026-10-31");
  });
  it("reassigning moves the task to the other firm", async () => {
    const api = await asNicolas();
    await api.tasks.update([seed.TASK_B603_VOSSLER], { organization_id: seed.ORG_XYZ, assignee_user_id: seed.U_TOMAS });
    await api.session.setViewAs(seed.U_LUCIA);
    expect((await api.tasks.list()).some((t) => t.id === seed.TASK_B603_VOSSLER)).toBe(false);
  });
  it("cancel requires a reason, keeps the task as cancelled and hides it from lists", async () => {
    const api = await asNicolas();
    await expect(api.tasks.cancel([seed.TASK_B603_VOSSLER], "  ")).rejects.toThrow("reason_required");
    await api.tasks.cancel([seed.TASK_B603_VOSSLER], "No aplica");
    expect((await api.tasks.list()).some((t) => t.id === seed.TASK_B603_VOSSLER)).toBe(false);
    const withCancelled = await api.tasks.list({ include_cancelled: true });
    expect(withCancelled.find((t) => t.id === seed.TASK_B603_VOSSLER)?.status).toBe("cancelled");
  });
  it("firms and owners cannot edit or cancel", async () => {
    const api = createMockApi();
    await expect(api.tasks.update([seed.TASK_B603_VOSSLER], { due_date: "2026-11-01" })).rejects.toThrow("sm_only");
    await api.session.setViewAs(seed.U_CARLA);
    await expect(api.tasks.cancel([seed.TASK_B603_VOSSLER], "x")).rejects.toThrow("sm_only");
  });
});

describe("SM rules", () => {
  const base = seed.tasks[0]!;
  it("a deliverable is stale after more than 3 days waiting", () => {
    const t = (d: string) => ({ ...withComputed({ ...base, status: "submitted" }, seed.tasks), last_submitted_at: `${d}T10:00:00Z` });
    expect(isStaleSubmission(t("2026-10-10"), "2026-10-14")).toBe(true);
    expect(isStaleSubmission(t("2026-10-11"), "2026-10-14")).toBe(false);
  });
  it("attention: overdue, stale and blocked by an overdue task", () => {
    const dep = withComputed({ ...base, id: "d", status: "in_progress", due_date: "2026-10-01", depends_on_task_ids: [] }, [], "2026-10-14");
    const blocked = withComputed({ ...base, id: "b", status: "pending", due_date: "2026-12-01", depends_on_task_ids: ["d"] }, [dep], "2026-10-14");
    const items = buildAttention([dep, blocked], [dep, blocked], "2026-10-14");
    expect(items.map((i) => i.reason)).toEqual(["overdue", "long_block"]);
    expect(buildSmSummary([dep, blocked], "2026-10-14")).toEqual({ due_today: 0, overdue: 1, stale: 0, blocked: 1 });
  });
  it("matrix: grey when the area has no tasks, red when one is overdue", () => {
    const t = withComputed({ ...base, area: "B6", status: "in_progress", due_date: "2026-10-01", business_id: "x" }, [], "2026-10-14");
    const [row] = buildNetworkMatrix([t], [], [{ ...seed.businesses[0]!, id: "x" }], "2026-10-14");
    expect(row!.cells.find((c) => c.area === "B6")!.health).toBe("red");
    expect(row!.cells.find((c) => c.area === "B1")!.health).toBe("grey");
  });
});
