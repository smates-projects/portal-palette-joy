import type { BishopInvestment, IsoMonth } from "@/lib/api/types";
import { localeTag } from "@/lib/format";

export interface RecoveryRow {
  month: IsoMonth;
  projected: number;
  /** Null for future months. */
  actual: number | null;
}

/**
 * Adds the recovery series of every investment into one cumulative series per month.
 * A month is "actual" only when every investment that has that month already reported it.
 */
export function buildRecoveryRows(investments: BishopInvestment[]): RecoveryRow[] {
  const byMonth = new Map<IsoMonth, RecoveryRow>();
  for (const investment of investments) {
    for (const point of investment.recovery) {
      const row = byMonth.get(point.month) ?? { month: point.month, projected: 0, actual: 0 };
      row.projected += point.projected;
      row.actual = row.actual === null || point.actual === null ? null : row.actual + point.actual;
      byMonth.set(point.month, row);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Gap between what was projected and what was recovered in the last month with real data (negative = behind). */
export function recoveryGap(rows: RecoveryRow[]): number | null {
  const last = rows.filter((r) => r.actual !== null).at(-1);
  return last ? (last.actual as number) - last.projected : null;
}

/** "oct 2026" / "Oct 2026" for a YYYY-MM string; empty string when the value is missing or malformed (chart tooltips). */
export function formatMonth(month: IsoMonth, lng: string): string {
  const [year, m] = String(month ?? "").split("-").map(Number) as [number, number];
  const date = new Date(year, m - 1, 1);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeTag(lng), { month: "short", year: "numeric" }).format(date);
}

/** Opportunities waiting for a decision come first, then the ones with interest, then the ones passed. */
export function sortByDecision<T extends { decision: "none" | "interested" | "passed" }>(items: T[]): T[] {
  const rank = { none: 0, interested: 1, passed: 2 } as const;
  return [...items].sort((a, b) => rank[a.decision] - rank[b.decision]);
}
