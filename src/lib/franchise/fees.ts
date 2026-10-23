import { FEES } from "@/lib/api/mock/economics";

const cents = (n: number) => Math.round(n * 100) / 100;

export interface ReportAmounts {
  royalty_amount: number;
  marketing_fund_amount: number;
  total_due: number;
}

/**
 * Demo only (the mock's reports and preview): royalty and marketing fund as percentages of gross sales, in USD
 * cents. Screens never bill in the browser: they show the API's report and POST /reports/preview.
 */
export function computeReportAmounts(grossSales: number, rates: { royalty_rate: number; marketing_fund_rate: number } = FEES): ReportAmounts {
  const royalty = cents(grossSales * rates.royalty_rate);
  const marketing = cents(grossSales * rates.marketing_fund_rate);
  return { royalty_amount: royalty, marketing_fund_amount: marketing, total_due: cents(royalty + marketing) };
}

/** Month after a YYYY-MM (2026-12 -> 2027-01). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Month before a YYYY-MM. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
