// Outcome of the readiness assessment, with the same rules as ReadinessScoreService of sm-platform. The backend
// computes it and sends it by webhook; the mock uses these pure rules to simulate an assessment.
import type { EligibilityGap, EligibilityRules, Lead, LeadBand, LeadResult, PlatformRules } from "@/lib/api/types";

/** Demo seed of the eligibility rule (the API always sends its own in GET /rules). */
export const DEFAULT_ELIGIBILITY: Required<EligibilityRules> = { min_annual_revenue: 250_000, min_years_operating: 1, require_hispanic_owner: true };

export const eligibilityRules = (rules: Partial<PlatformRules> | null | undefined): Required<EligibilityRules> => ({
  min_annual_revenue: rules?.eligibility?.min_annual_revenue ?? DEFAULT_ELIGIBILITY.min_annual_revenue,
  min_years_operating: rules?.eligibility?.min_years_operating ?? DEFAULT_ELIGIBILITY.min_years_operating,
  require_hispanic_owner: rules?.eligibility?.require_hispanic_owner ?? DEFAULT_ELIGIBILITY.require_hispanic_owner,
});

/**
 * invalid_min_revenue when the amount is not a whole number of dollars at least 0; invalid_eligibility when the
 * years are not a whole number from 0 to 50 (as the API); null otherwise.
 */
export const eligibilityError = (rules: Partial<EligibilityRules> | null | undefined): "invalid_min_revenue" | "invalid_eligibility" | null =>
  rules?.min_annual_revenue !== undefined && (!Number.isInteger(rules.min_annual_revenue) || rules.min_annual_revenue < 0) ? "invalid_min_revenue"
    : rules?.min_years_operating !== undefined && (!Number.isInteger(rules.min_years_operating) || rules.min_years_operating < 0 || rules.min_years_operating > 50) ? "invalid_eligibility"
      : null;

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

/**
 * Locale key of the owner's closing answer, the quiet line the SM team reads on the funnel card and the lead detail
 * ("Quiere entender el proceso primero"). Null when the lead has none: older assessments and leads added by hand.
 */
export const opennessKey = (
  result: Pick<LeadResult, "openness"> | null | undefined,
): string | null => (result?.openness ? `pipeline.openness.${result.openness}` : null);

/** readiness, band and eligibility of a business with the shown score (the ready threshold is 0 today). */
export function readinessOutcome(
  business: Pick<Lead["business"], "years_range" | "revenue_range">,
  score: number,
): Pick<LeadResult, "readiness" | "band" | "eligible_program" | "eligibility_gaps"> {
  const gaps = eligibilityGaps(business);
  const eligible = gaps.length === 0;
  return { readiness: eligible ? "ready" : "on_track", band: eligible ? bandOf(score) : "track", eligible_program: eligible, eligibility_gaps: gaps };
}
