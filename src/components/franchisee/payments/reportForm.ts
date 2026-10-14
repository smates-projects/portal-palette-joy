/** Largest monthly sales a single unit can report; anything above is almost surely a typing mistake. */
export const MAX_MONTHLY_SALES = 5_000_000;

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

/** Why the typed gross sales cannot be sent, or null when they can. */
export function validateSales(input: string): SalesError | null {
  if (input.trim() === "") return "required";
  const value = parseSales(input);
  if (value === null) return "invalid";
  if (value <= 0) return "not_positive";
  if (value > MAX_MONTHLY_SALES) return "too_large";
  return null;
}
