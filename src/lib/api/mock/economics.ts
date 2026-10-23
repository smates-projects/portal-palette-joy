// Demo only: the economics the mock computes with. Over the API every rate, split and limit comes from the API
// (FranchiseSummary.royalty_pct, OpportunityDetail.sm_share_pct, rules.limits...), never from these constants.

/** Fees every franchise pays its franchisor each month, over gross sales. */
export const FEES = {
  royalty_rate: 0.05,
  marketing_fund_rate: 0.03,
  /** Share of each royalty that goes to SM, from the franchisor's agreement. */
  sm_share_of_royalty: 0.3,
} as const;

/** The fee fields the mock adds to a franchise and to the franchisee home, as the API sends them. */
export const FEE_FIELDS = {
  royalty_rate: FEES.royalty_rate,
  marketing_fund_rate: FEES.marketing_fund_rate,
  royalty_pct: Math.round(FEES.royalty_rate * 100),
  marketing_fund_pct: Math.round(FEES.marketing_fund_rate * 100),
} as const;

/** Highest monthly gross sales a report accepts (the API's MAX_MONTHLY_SALES). */
export const MOCK_MAX_MONTHLY_SALES = 5_000_000;

/**
 * PROVISIONAL: the profit split between Business Bishop, SM and the franchisor is not final.
 * Bishop gets `bishop_year1` of the franchisor result during the first 12 months of his agreement and
 * `bishop_stabilized` afterwards. SM gets `sm_from_year2` of the result from the second year on.
 */
export const PROFIT_SPLIT = {
  bishop_year1: 0.5,
  bishop_stabilized: 0.22,
  sm_from_year2: 0.1,
} as const;
