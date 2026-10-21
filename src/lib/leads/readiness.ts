// Outcome of the readiness assessment, with the same rules as ReadinessScoreService of sm-platform. The backend
// computes it and sends it by webhook; the mock uses these pure rules to simulate an assessment.
import type { EligibilityGap, EligibilityRules, Lead, LeadBand, LeadResult, PlatformRules } from "@/lib/api/types";

/** What applies while SM Global never set the eligibility rule in Reglas. */
export const DEFAULT_ELIGIBILITY: EligibilityRules = { min_annual_revenue: 250_000 };

export const eligibilityRules = (rules: Partial<PlatformRules> | null | undefined): EligibilityRules => ({
  min_annual_revenue: rules?.eligibility?.min_annual_revenue ?? DEFAULT_ELIGIBILITY.min_annual_revenue,
});

/** invalid_min_revenue when the amount is not a whole number of dollars at least 0, else null. */
export const eligibilityError = (rules: Partial<EligibilityRules> | null | undefined): "invalid_min_revenue" | null =>
  rules?.min_annual_revenue !== undefined && (!Number.isInteger(rules.min_annual_revenue) || rules.min_annual_revenue < 0) ? "invalid_min_revenue" : null;

/** Minimum shown score of each band for an eligible business (config result_bands: 70 / 55 / 0). */
export const BAND_MINIMUMS: readonly [LeadBand, number][] = [["high", 70], ["mid", 55], ["low", 0]];

/** Band of the shown score for an eligible business. */
export const bandOf = (score: number): LeadBand => BAND_MINIMUMS.find(([, min]) => score >= min)?.[0] ?? "low";

/**
 * Hard program rules: at least 1 year operating ("Menos de 1 año" fails) and declared sales. Picking a revenue range
 * means the business bills, so only a missing range is a revenue gap.
 */
export function eligibilityGaps(business: Pick<Lead["business"], "years_range" | "revenue_range">): EligibilityGap[] {
  const gaps: EligibilityGap[] = [];
  if (business.years_range === "years_lt1") gaps.push("years_operating");
  if (!business.revenue_range) gaps.push("revenue");
  return gaps;
}

/** readiness, band and eligibility of a business with the shown score (the ready threshold is 0 today). */
export function readinessOutcome(
  business: Pick<Lead["business"], "years_range" | "revenue_range">,
  score: number,
): Pick<LeadResult, "readiness" | "band" | "eligible_program" | "eligibility_gaps"> {
  const gaps = eligibilityGaps(business);
  const eligible = gaps.length === 0;
  return { readiness: eligible ? "ready" : "on_track", band: eligible ? bandOf(score) : "track", eligible_program: eligible, eligibility_gaps: gaps };
}
