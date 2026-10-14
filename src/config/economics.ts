/** Fees every franchise pays its franchisor each month, over gross sales. */
export const FEES = {
  royalty_rate: 0.05,
  marketing_fund_rate: 0.03,
  /** Share of each royalty that goes to SM, from the franchisor's agreement. */
  sm_share_of_royalty: 0.3,
} as const;

/**
 * PROVISIONAL: the profit split between Business Bishop, SM and the franchisor is not final.
 * Treated as a parameter on purpose: change it here, never in a component or in seed data.
 * Bishop gets `bishop_year1` of the franchisor result during the first 12 months of his agreement and
 * `bishop_stabilized` afterwards. SM gets `sm_from_year2` of the result from the second year on.
 */
export const PROFIT_SPLIT = {
  bishop_year1: 0.5,
  bishop_stabilized: 0.22,
  sm_from_year2: 0.1,
} as const;
