export type SalesError = "required" | "invalid" | "not_positive" | "too_large";

/**
 * Reads what the franchisee typed ("$12,500.50", "12500", "12 500") as a number.
 * Commas and spaces are thousands separators (es-US and en-US); the dot is the decimal mark.
 * Returns null when it is empty or not a plain number.
 */
export function parseSales(input: string): number | null {
  const cleaned = input.replace(/[\s$,]/g, "");
  if (cleaned === "" || !/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Why the typed gross sales cannot be sent, or null when they can. maxMonthlySales is the API's limit
 * (FranchiseeHome.max_monthly_sales); unknown = only the API checks it (invalid_over_max_sales).
 */
export function validateSales(input: string, maxMonthlySales?: number): SalesError | null {
  if (input.trim() === "") return "required";
  const value = parseSales(input);
  if (value === null) return "invalid";
  if (value <= 0) return "not_positive";
  if (maxMonthlySales !== undefined && value > maxMonthlySales) return "too_large";
  return null;
}
