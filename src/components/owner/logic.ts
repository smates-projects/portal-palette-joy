import { TODAY } from "@/config/app";
import type { FranchiseSummary, FinancialSeries, ManualSection, TaskWithComputed } from "@/lib/api/types";

// Pure rules of the owner screens (manual, numbers, franchisor home). No React here so they are easy to test.

export interface ManualSectionView {
  section: ManualSection;
  /** Tasks of this business that produce what the section needs, sorted by code. */
  tasks: TaskWithComputed[];
  /** Tasks already approved: their result is part of the manual. */
  included: number;
  /** True when the section has tasks and all of them are approved. */
  ready: boolean;
}

/** Joins each manual section with the catalog tasks that feed it (its `catalog_codes`). Approved task = included in the manual. */
export function buildManualSections(sections: ManualSection[], tasks: TaskWithComputed[]): ManualSectionView[] {
  return sections.map((section) => {
    const own = tasks.filter((t) => section.catalog_codes.includes(t.code)).sort((a, b) => a.code.localeCompare(b.code));
    const included = own.filter((t) => t.status === "accepted").length;
    return { section, tasks: own, included, ready: own.length > 0 && included === own.length };
  });
}

/** Next manual version after "v1.3" is "v1.4". Without a version the first one is "v1.0". */
export function nextManualVersion(current: string | null): string {
  const match = /^v(\d+)\.(\d+)$/.exec(current ?? "");
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : "v1.0";
}

export type Trend = "up" | "down" | "flat";

export interface MonthReading {
  lastMonth: string;
  previousMonth: string;
  revenue: { last: number; previous: number; pct: number; trend: Trend };
  margin: { last: number; previous: number; points: number; trend: Trend };
  cash: { last: number; previous: number; trend: Trend };
}

const trendOf = (delta: number, tolerance: number): Trend => (Math.abs(delta) <= tolerance ? "flat" : delta > 0 ? "up" : "down");

/** Last month against the one before. Null if the series has fewer than two months. */
export function readLastMonth(series: FinancialSeries | null | undefined): MonthReading | null {
  if (!series || series.months.length < 2) return null;
  const i = series.months.length - 1;
  const at = (values: number[], index: number) => values[index] ?? 0;
  const revenueLast = at(series.revenue, i);
  const revenuePrev = at(series.revenue, i - 1);
  const pct = revenuePrev === 0 ? 0 : Math.round(((revenueLast - revenuePrev) / revenuePrev) * 100);
  const marginPoints = Math.round((at(series.margin_pct, i) - at(series.margin_pct, i - 1)) * 10) / 10;
  return {
    lastMonth: series.months[i]!,
    previousMonth: series.months[i - 1]!,
    revenue: { last: revenueLast, previous: revenuePrev, pct, trend: trendOf(pct, 1) },
    margin: { last: at(series.margin_pct, i), previous: at(series.margin_pct, i - 1), points: marginPoints, trend: trendOf(marginPoints, 0.5) },
    cash: { last: at(series.cash, i), previous: at(series.cash, i - 1), trend: trendOf(at(series.cash, i) - at(series.cash, i - 1), 0) },
  };
}

export type AttentionReason = "report_late" | "tickets" | "low_standards";

export interface AttentionItem {
  franchise: FranchiseSummary;
  /** Most urgent reason first. */
  reasons: AttentionReason[];
}

/** Standards below this percent need a look. */
export const LOW_STANDARDS_PCT = 80;

/** Franchises that need the franchisor, most urgent first: late report, then open tickets, then low standards. */
export function buildAttentionList(franchises: FranchiseSummary[], today: string = TODAY): AttentionItem[] {
  const weight: Record<AttentionReason, number> = { report_late: 4, tickets: 2, low_standards: 1 };
  return franchises
    .map((franchise) => {
      const reasons: AttentionReason[] = [];
      const report = franchise.last_report;
      if (franchise.status === "operating" && report && report.status === "due" && report.due_date < today) reasons.push("report_late");
      if (franchise.open_tickets > 0) reasons.push("tickets");
      if (franchise.status === "operating" && franchise.compliance_pct < LOW_STANDARDS_PCT) reasons.push("low_standards");
      return { franchise, reasons };
    })
    .filter((item) => item.reasons.length > 0)
    .sort(
      (a, b) =>
        b.reasons.reduce((sum, r) => sum + weight[r], 0) - a.reasons.reduce((sum, r) => sum + weight[r], 0) ||
        a.franchise.name.localeCompare(b.franchise.name),
    );
}
