import { describe, expect, it } from "vitest";
import type { TaskWithComputed } from "@/lib/api/types";
import { buildSummary, buildToday, nextDue } from "./home";

const T = "2026-10-14"; // Wednesday
const mk = (code: string, status: string, due: string, biz = "b1"): TaskWithComputed =>
  ({ id: code, code, status, due_date: due, business_id: biz, is_overdue: status !== "accepted" && due < T, is_blocked: false }) as TaskWithComputed;

const tasks = [
  mk("A", "in_progress", "2026-10-10", "v"),
  mk("B", "pending", "2026-10-08", "v"),
  mk("C", "in_progress", "2026-10-14", "p"),
  mk("D", "changes_requested", "2026-10-30", "p"),
  mk("E", "pending", "2026-10-16", "p"),
  mk("F", "submitted", "2026-10-15", "v"),
  mk("G", "pending", "2026-10-22", "p"),
];

describe("home summary", () => {
  it("counts each card and groups by business", () => {
    const s = Object.fromEntries(buildSummary(tasks, T).map((c) => [c.key, c]));
    expect(s['overdue']!.count).toBe(2);
    expect(s['overdue']!.byBusiness).toEqual([{ business_id: "v", count: 2 }]);
    expect(s['today']!.count).toBe(1);
    expect(s['changes']!.count).toBe(1);
    expect(s['waiting']!.count).toBe(1);
  });
});

describe("para hoy", () => {
  it("orders overdue, today, changes requested, this week and skips delivered", () => {
    expect(buildToday(tasks, T).map((r) => r.task.code)).toEqual(["B", "A", "C", "D", "E"]);
  });
  it("next due skips delivered tasks", () => {
    expect(nextDue(tasks, T)?.code).toBe("E");
  });
});

import { buildProgress } from "./home";
describe("progress", () => {
  it("compares approved share with elapsed program days", () => {
    const p = buildProgress(
      [mk("X", "accepted", "2026-09-01", "v"), mk("Y", "submitted", "2026-10-20", "v"), mk("Z", "pending", "2026-11-01", "v"), mk("W", "in_progress", "2026-11-01", "v")],
      () => 90,
    )[0]!;
    expect(p).toMatchObject({ total: 4, accepted: 1, submitted: 1, in_progress: 1, expected: 0.5, gap: -25 });
  });
});
