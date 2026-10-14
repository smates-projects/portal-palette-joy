import { describe, expect, it } from "vitest";
import type { TaskWithComputed } from "@/lib/api/types";
import { buildClientSummary } from "./clients";

const T = "2026-10-14";
const mk = (code: string, status: string, due: string, extra: Partial<TaskWithComputed> = {}): TaskWithComputed =>
  ({ id: code, code, status, due_date: due, business_id: "b", depends_on_task_ids: [], is_blocked: false,
     is_overdue: status !== "accepted" && due < T, ...extra }) as TaskWithComputed;

describe("client card", () => {
  it("counts open, overdue and approved, and picks the next due date", () => {
    const s = buildClientSummary("b", [mk("A", "accepted", "2026-09-01"), mk("B", "in_progress", "2026-10-10"), mk("C", "pending", "2026-10-20"), mk("D", "submitted", "2026-10-16")], T);
    expect(s).toMatchObject({ open: 3, overdue: 1, accepted: 1 });
    expect(s.next?.code).toBe("D");
    expect(s.stuck).toEqual({ kind: "waiting_owner", count: 1 });
  });
  it("a blocking dependency wins over waiting on the owner", () => {
    const s = buildClientSummary("b", [mk("X", "submitted", "2026-10-16"), mk("Y", "pending", "2026-11-01", { is_blocked: true, depends_on_task_ids: ["X"] })], T);
    expect(s.stuck).toEqual({ kind: "blocked", code: "Y", by: "X" });
  });
});
