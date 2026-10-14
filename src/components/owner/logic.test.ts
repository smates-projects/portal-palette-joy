import { describe, expect, it } from "vitest";
import type { FinancialSeries, FranchiseSummary, ManualSection, TaskWithComputed } from "@/lib/api/types";
import { buildAttentionList, buildManualSections, nextManualVersion, readLastMonth } from "./logic";

const task = (code: string, status: string) => ({ id: code, code, status }) as TaskWithComputed;
const section = (title: string) => ({ id: title, title, pct: 40, status: "drafting" }) as ManualSection;

describe("manual sections from catalog tasks", () => {
  it("counts approved tasks as included and the rest as pending", () => {
    const [ventas] = buildManualSections([section("Ventas")], [task("B5-06", "accepted"), task("B5-01", "in_progress"), task("B2-01", "accepted")]);
    expect(ventas!.tasks.map((t) => t.code)).toEqual(["B5-01", "B5-06"]);
    expect(ventas!.included).toBe(1);
    expect(ventas!.ready).toBe(false);
  });

  it("is ready only when every task of the section is approved", () => {
    const [ops] = buildManualSections([section("Operación")], [task("B2-03", "accepted")]);
    expect(ops!.ready).toBe(true);
  });

  it("has no tasks and is never ready for an unknown or empty section", () => {
    const [custom, empty] = buildManualSections([section("Otra"), section("Personas")], []);
    expect(custom!.tasks).toEqual([]);
    expect(custom!.ready).toBe(false);
    expect(empty!.ready).toBe(false);
  });
});

describe("nextManualVersion", () => {
  it("bumps the minor number", () => expect(nextManualVersion("v1.3")).toBe("v1.4"));
  it("starts at v1.0 when there is none", () => {
    expect(nextManualVersion(null)).toBe("v1.0");
    expect(nextManualVersion("draft")).toBe("v1.0");
  });
});

describe("readLastMonth", () => {
  const series = (revenue: number[], margin: number[], cash: number[]): FinancialSeries => ({
    business_id: "b",
    months: revenue.map((_, i) => `2026-0${i + 1}`),
    revenue,
    margin_pct: margin,
    cash,
    changes: [],
  });

  it("compares the last month with the previous one", () => {
    const r = readLastMonth(series([10000, 11000], [8, 9.5], [5000, 4000]))!;
    expect(r.revenue).toMatchObject({ pct: 10, trend: "up" });
    expect(r.margin).toMatchObject({ points: 1.5, trend: "up" });
    expect(r.cash.trend).toBe("down");
    expect(r.lastMonth).toBe("2026-02");
  });

  it("calls tiny changes flat", () => expect(readLastMonth(series([10000, 10050], [8, 8.2], [1, 1]))!.revenue.trend).toBe("flat"));
  it("returns null with fewer than two months", () => {
    expect(readLastMonth(series([10000], [8], [1]))).toBeNull();
    expect(readLastMonth(null)).toBeNull();
  });
});

describe("buildAttentionList", () => {
  const unit = (name: string, extra: Partial<FranchiseSummary>) =>
    ({ id: name, name, status: "operating", compliance_pct: 95, open_tickets: 0, last_report: null, ...extra }) as FranchiseSummary;

  it("lists only franchises with a reason, most urgent first", () => {
    const list = buildAttentionList(
      [
        unit("Calm", {}),
        unit("Low", { compliance_pct: 60 }),
        unit("Late", { last_report: { status: "due", due_date: "2026-10-10" } as FranchiseSummary["last_report"] }),
        unit("Tickets", { open_tickets: 2 }),
      ],
      "2026-10-14",
    );
    expect(list.map((i) => i.franchise.name)).toEqual(["Late", "Tickets", "Low"]);
    expect(list[0]!.reasons).toEqual(["report_late"]);
  });

  it("does not flag a report that is due but not yet late, nor opening units for standards", () => {
    const list = buildAttentionList(
      [
        unit("OnTime", { last_report: { status: "due", due_date: "2026-11-05" } as FranchiseSummary["last_report"] }),
        unit("Opening", { status: "opening", compliance_pct: 10 }),
      ],
      "2026-10-14",
    );
    expect(list).toEqual([]);
  });
});
