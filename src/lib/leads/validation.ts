// Validation of an approved business: the definitive percentages of the new franchisor company. The ranges come from
// the MOU and the Acuerdo de Vinculación: small business 50-75 %, Bishop 15-40 %, SM Square 10 % fixed, 100 in all.
// The API answers invalid_split with the same checks.
import type { LeadValidation, ValidationInput } from "@/lib/api/types";

export const EQUITY_RANGES = {
  equity_owner: { min: 50, max: 75 },
  equity_bishop: { min: 15, max: 40 },
} as const;
/** SM Square's share: fixed, the field is read-only. */
export const SM_SQUARE_EQUITY = 10;

export type SplitField = "equity_owner" | "equity_bishop" | "equity_sm";
export type SplitErrors = Partial<Record<SplitField | "sum", "required" | "range" | "fixed" | "sum">>;

const isPct = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Field errors of the three percentages. With `complete` every field is required (closing); without it, empty
 * fields are allowed (saving a draft) but whatever is written must be in range, and the sum is checked once the
 * three are there.
 */
export function splitErrors(input: Pick<ValidationInput, SplitField>, complete = false): SplitErrors {
  const errors: SplitErrors = {};
  for (const field of ["equity_owner", "equity_bishop"] as const) {
    const value = input[field];
    if (value === null || value === undefined) { if (complete) errors[field] = "required"; continue; }
    const { min, max } = EQUITY_RANGES[field];
    if (!isPct(value) || value < min || value > max) errors[field] = "range";
  }
  if (isPct(input.equity_sm) ? input.equity_sm !== SM_SQUARE_EQUITY : complete) errors.equity_sm = "fixed";
  const all = [input.equity_owner, input.equity_bishop, input.equity_sm];
  if (all.every(isPct) && Object.keys(errors).length === 0 && all.reduce((a, b) => a + b, 0) !== 100) errors.sum = "sum";
  return errors;
}

/** invalid_split when the percentages break a range or do not add up to 100; null otherwise. */
export const splitError = (input: Pick<ValidationInput, SplitField>, complete = false): "invalid_split" | null =>
  Object.keys(splitErrors(input, complete)).length > 0 ? "invalid_split" : null;

/** What closing still needs: the three percentages right, the SM Square center and its holder. */
export function closeBlock(v: Pick<ValidationInput, SplitField | "sm_square_center" | "sm_square_holder_user_id">): "invalid_split" | "center_required" | "holder_required" | null {
  if (splitError(v, true)) return "invalid_split";
  if (!v.sm_square_center?.trim()) return "center_required";
  if (!v.sm_square_holder_user_id) return "holder_required";
  return null;
}

/** The form starts from what was saved, or empty with SM Square's fixed 10 %. */
export const validationInputOf = (v: LeadValidation | null | undefined): ValidationInput => ({
  equity_owner: v?.equity_owner ?? null,
  equity_bishop: v?.equity_bishop ?? null,
  equity_sm: v?.equity_sm ?? SM_SQUARE_EQUITY,
  investment_amount: v?.investment_amount ?? null,
  notes: v?.notes ?? null,
  sm_square_center: v?.sm_square_center ?? null,
  sm_square_holder_user_id: v?.sm_square_holder_user_id ?? null,
});

/** "60" → 60, "" → null, anything else → NaN (shown as out of range). */
export const parsePct = (text: string): number | null => (text.trim() === "" ? null : Number(text.replace(",", ".")));

/** The definitive split, once the validation is closed. */
export const isSplitFinal = (v: Pick<LeadValidation, "status"> | null | undefined) => v?.status === "closed";
