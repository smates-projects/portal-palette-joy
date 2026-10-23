import { describe, expect, it } from "vitest";
import { withComputed } from "@/lib/api/computed";
import * as seed from "@/lib/api/mock/seed";
import i18n from "@/lib/i18n";
import { filterTasks, matchesDue, overdueDays, overdueLabel, sortTasks } from "./table";

const all = seed.tasks.map((t) => withComputed(t, seed.tasks, "2026-10-14"));
const ctx = { businessName: (id: string) => seed.businesses.find((b) => b.id === id)!.name, statusLabel: (s: string) => s };

describe("overdue days", () => {
  const t = i18n.getFixedT("es");
  it("uses the API's overdue_days when sent, otherwise counts from due_date", () => {
    expect(overdueDays({ due_date: "2026-10-10", overdue_days: 5 }, "2026-10-14")).toBe(5);
    expect(overdueDays({ due_date: "2026-10-10" }, "2026-10-14")).toBe(4);
  });
  it("0 days or less reads 'Vence hoy', never 'Vencida hace 0 días'", () => {
    expect(overdueLabel(t, 0)).toBe("Vence hoy");
    expect(overdueLabel(t, -1)).toBe("Vence hoy");
    expect(overdueLabel(t, 1)).toBe("Vencida hace 1 día");
    expect(overdueLabel(t, 3)).toBe("Vencida hace 3 días");
  });
});

describe("Mis tareas table", () => {
  it("default order puts overdue tasks first, then by due date", () => {
    const sorted = sortTasks(all, {}, ctx);
    const firstNonOverdue = sorted.findIndex((t) => !t.is_overdue);
    expect(sorted.slice(0, firstNonOverdue).every((t) => t.is_overdue)).toBe(true);
    expect(sorted.slice(firstNonOverdue).some((t) => t.is_overdue)).toBe(false);
    const rest = sorted.slice(firstNonOverdue).map((t) => t.due_date);
    expect(rest).toEqual([...rest].sort());
  });

  it("'this week' runs from today (Wed 14 Oct) to Sunday 18 Oct", () => {
    const base = all.find((t) => t.status === "in_progress")!;
    expect(matchesDue({ ...base, due_date: "2026-10-18", is_overdue: false }, "week", "2026-10-14")).toBe(true);
    expect(matchesDue({ ...base, due_date: "2026-10-19", is_overdue: false }, "week", "2026-10-14")).toBe(false);
    expect(matchesDue({ ...base, due_date: "2026-10-31", is_overdue: false }, "month", "2026-10-14")).toBe(true);
    expect(matchesDue({ ...base, due_date: "2026-11-01", is_overdue: false }, "month", "2026-10-14")).toBe(false);
  });

  it("filters by business, area and search text", () => {
    const res = filterTasks(all, { business: seed.BIZ_VOSSLER, area: "B6", q: "societaria" }, ctx);
    expect(res.map((t) => t.code)).toEqual(["B6-02"]);
  });
});
