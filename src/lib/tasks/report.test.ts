import { describe, expect, it } from "vitest";
import { buildFirmReport } from "./report";
import type { Business, TaskVersion, TaskWithComputed } from "@/lib/api/types";

const biz = { id: "b1", name: "Vossler" } as Business;
const task = (id: string, status: string, extra: Partial<TaskWithComputed> = {}) =>
  ({ id, code: id, status, business_id: "b1", depends_on_task_ids: [], is_blocked: false, is_overdue: false, accepted_at: null, ...extra }) as TaskWithComputed;
const version = (task_id: string, status: TaskVersion["status"], submitted_at: string) => ({ task_id, status, submitted_at }) as TaskVersion;

describe("firm report", () => {
  const tasks = [
    task("A", "accepted", { accepted_at: "2026-10-05T12:00:00Z" }),
    task("B", "accepted", { accepted_at: "2026-09-20T12:00:00Z" }),
    task("C", "submitted"),
    task("D", "pending", { is_blocked: true, depends_on_task_ids: ["C"] }),
  ];
  const versions = [
    version("A", "changes_requested", "2026-09-25T12:00:00Z"),
    version("A", "accepted", "2026-10-01T12:00:00Z"),
    version("B", "accepted", "2026-09-18T12:00:00Z"),
  ];
  const r = buildFirmReport(tasks, versions, [biz], "2026-10-14");

  it("progress is approved over total", () => expect(r.progress_pct).toBe(50));
  it("blocked tasks list the unapproved task that blocks them", () => expect(r.blocked[0]?.by.map((t) => t.code)).toEqual(["C"]));
  it("averages days from last delivery to approval", () => expect(r.avg_days_to_approval).toBe(3)); // 4 and 2
  it("averages change rounds over approved tasks", () => expect(r.avg_change_rounds).toBe(0.5));
});
