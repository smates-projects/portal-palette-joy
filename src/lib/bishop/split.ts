// Demo only: the mock's split and projection (the API computes them for every screen).
import { PROFIT_SPLIT } from "@/lib/api/mock/economics";
import type { IsoDate, IsoMonth, ProjectionYear, RecoveryPoint } from "@/lib/api/types";
import { addDaysIso } from "@/lib/api/program";

/** Share (in percent) of the franchisor result the Bishop receives on a given day: year 1 vs stabilized. */
export function bishopShareAt(agreementDate: IsoDate, today: IsoDate): number {
  const firstYearEnds = addDaysIso(agreementDate, 365);
  return Math.round((today < firstYearEnds ? PROFIT_SPLIT.bishop_year1 : PROFIT_SPLIT.bishop_stabilized) * 100);
}

/** Five-year projection of a franchisor: Bishop and SM get their share of each year's result. */
export function projectYears(rows: { year: number; franchises: number; revenue: number; result: number }[]): ProjectionYear[] {
  return rows.map((r) => ({
    ...r,
    bishop: Math.round(r.result * (r.year === 1 ? PROFIT_SPLIT.bishop_year1 : PROFIT_SPLIT.bishop_stabilized)),
    sm: r.year >= 2 ? Math.round(r.result * PROFIT_SPLIT.sm_from_year2) : 0,
  }));
}

const monthIndex = (m: IsoMonth) => {
  const [y, mm] = m.split("-").map(Number) as [number, number];
  return y * 12 + (mm - 1);
};
const fromIndex = (i: number): IsoMonth => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

/**
 * Month in which the Bishop gets his whole investment back if the trailing six months keep the same pace.
 * Null when nothing was recovered in that window. Already recovered: the last actual month.
 */
export function estimatePaybackMonth(series: RecoveryPoint[], invested: number): IsoMonth | null {
  const actual = series.filter((p): p is RecoveryPoint & { actual: number } => p.actual !== null);
  const last = actual.at(-1);
  if (!last) return null;
  if (last.actual >= invested) return last.month;
  const from = actual.find((p) => monthIndex(p.month) >= monthIndex(last.month) - 6) ?? actual[0]!;
  const months = monthIndex(last.month) - monthIndex(from.month);
  const pace = months > 0 ? (last.actual - from.actual) / months : 0;
  if (pace <= 0) return null;
  return fromIndex(monthIndex(last.month) + Math.ceil((invested - last.actual) / pace));
}
