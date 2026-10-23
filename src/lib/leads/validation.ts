// Validation of an approved business: the definitive percentages of the new franchisor company, inside the equity
// ranges of the rules (PlatformRules.equity_ranges, also sent as lead.validation.equity_ranges), 100 in all. The API
// answers invalid_split with the same checks.
import type { EquityRanges, LeadValidation, ValidationInput } from "@/lib/api/types";

/** Demo seed of the ranges (the mock's rules): owner 50-75 %, Bishop 15-40 %, SM Square 10 % fixed. */
export const DEMO_EQUITY_RANGES: EquityRanges = {
  owner: { min: 50, max: 75 },
  bishop: { min: 15, max: 40 },
  sm: { min: 10, max: 10 },
};

export type SplitField = "equity_owner" | "equity_bishop" | "equity_sm";
export type SplitErrors = Partial<Record<SplitField | "sum", "required" | "range" | "fixed" | "sum">>;

const RANGE_OF: Record<SplitField, keyof EquityRanges> = { equity_owner: "owner", equity_bishop: "bishop", equity_sm: "sm" };

const isPct = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** The range of one field; SM's share is "fixed" when its range is a single value. */
export const rangeOf = (ranges: EquityRanges, field: SplitField) => ranges[RANGE_OF[field]];
export const isFixed = (ranges: EquityRanges, field: SplitField) => rangeOf(ranges, field).min === rangeOf(ranges, field).max;

/** invalid_equity_ranges: each range inside 0-100 with min <= max, and 100 reachable with the three. */
export function equityRangesError(ranges: EquityRanges): "invalid_equity_ranges" | null {
  const all = [ranges.owner, ranges.bishop, ranges.sm];
  if (all.some((r) => !Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 0 || r.max > 100 || r.min > r.max)) return "invalid_equity_ranges";
  const low = all.reduce((a, r) => a + r.min, 0);
  const high = all.reduce((a, r) => a + r.max, 0);
  return low <= 100 && high >= 100 ? null : "invalid_equity_ranges";
}

/**
 * Field errors of the three percentages. With `complete` every field is required (closing); without it, empty
 * fields are allowed (saving a draft) but whatever is written must be in range, and the sum is checked once the
 * three are there.
 */
export function splitErrors(input: Pick<ValidationInput, SplitField>, ranges: EquityRanges, complete = false): SplitErrors {
  const errors: SplitErrors = {};
  for (const field of ["equity_owner", "equity_bishop", "equity_sm"] as const) {
    const value = input[field];
    if (value === null || value === undefined) { if (complete) errors[field] = isFixed(ranges, field) ? "fixed" : "required"; continue; }
    const { min, max } = rangeOf(ranges, field);
    if (!isPct(value) || value < min || value > max) errors[field] = isFixed(ranges, field) ? "fixed" : "range";
  }
  const all = [input.equity_owner, input.equity_bishop, input.equity_sm];
  if (all.every(isPct) && Object.keys(errors).length === 0 && all.reduce((a, b) => a + b, 0) !== 100) errors.sum = "sum";
  return errors;
}

/** invalid_split when the percentages break a range or do not add up to 100; null otherwise. */
export const splitError = (input: Pick<ValidationInput, SplitField>, ranges: EquityRanges, complete = false): "invalid_split" | null =>
  Object.keys(splitErrors(input, ranges, complete)).length > 0 ? "invalid_split" : null;

/** What closing still needs: the three percentages right, the SM Square center and its holder. */
export function closeBlock(v: Pick<ValidationInput, SplitField | "sm_square_center" | "sm_square_holder_user_id">, ranges: EquityRanges): "invalid_split" | "center_required" | "holder_required" | null {
  if (splitError(v, ranges, true)) return "invalid_split";
  if (!v.sm_square_center?.trim()) return "center_required";
  if (!v.sm_square_holder_user_id) return "holder_required";
  return null;
}

/** The form starts from what was saved, or empty with SM's share when its range is a single value. */
export const validationInputOf = (v: LeadValidation | null | undefined, ranges: EquityRanges | null | undefined): ValidationInput => ({
  equity_owner: v?.equity_owner ?? null,
  equity_bishop: v?.equity_bishop ?? null,
  equity_sm: v?.equity_sm ?? (ranges && isFixed(ranges, "equity_sm") ? ranges.sm.min : null),
  investment_amount: v?.investment_amount ?? null,
  notes: v?.notes ?? null,
  sm_square_center: v?.sm_square_center ?? null,
  sm_square_holder_user_id: v?.sm_square_holder_user_id ?? null,
});

/** "60" → 60, "" → null, anything else → NaN (shown as out of range). */
export const parsePct = (text: string): number | null => (text.trim() === "" ? null : Number(text.replace(",", ".")));

/** The definitive split, once the validation is closed. */
export const isSplitFinal = (v: Pick<LeadValidation, "status"> | null | undefined) => v?.status === "closed";
