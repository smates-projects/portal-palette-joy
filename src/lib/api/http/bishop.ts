// BishopRepository over the real API (bishop module: bishop.controller.ts). The Bishop's own opportunities,
// agreements and portfolio. The API never sends the owner's contact (email, phone); the mapping below copies only
// the front's fields, so nothing beyond them (contact included) can reach the screens, and nothing is made up:
// business and owner names stay null until this Bishop accepted.
// Accepting answers 409 `taken` (another Bishop was first), 409 `framework_required` (framework agreement not
// signed) or 409 `not_available` (still in review): they arrive as ApiError codes, as the mock's errors.
import type { BishopRepository } from "../repositories";
import type {
  BishopAgreement,
  BishopInvestment,
  BishopOpportunity,
  BishopPortfolio,
  OpportunityDetail,
  Uuid,
} from "../types";
import { getOrNull, type HttpClient } from "./client";

/** The API's investment adds the state of the funds and the program day, which the front does not show. */
interface BishopInvestmentResponse extends BishopInvestment {
  funds_status?: string | undefined;
  program_day?: number | undefined;
}

interface BishopPortfolioResponse extends Omit<BishopPortfolio, "investments"> {
  investments: BishopInvestmentResponse[];
}

const toOpportunity = (opportunity: BishopOpportunity): BishopOpportunity => ({
  id: opportunity.id,
  lead_id: opportunity.lead_id,
  phase: opportunity.phase,
  industry: opportunity.industry,
  city: opportunity.city,
  state: opportunity.state,
  business_name: opportunity.business_name,
  owner_name: opportunity.owner_name,
  investment: opportunity.investment,
  share_year1_pct: opportunity.share_year1_pct,
  share_stable_pct: opportunity.share_stable_pct,
  score: opportunity.score,
  band: opportunity.band,
  review: opportunity.review,
  decision: opportunity.decision,
  decided_at: opportunity.decided_at,
  // "Strategic Mates te presentó este negocio": absent until the API sends it.
  ...(opportunity.presented_at !== undefined ? { presented_at: opportunity.presented_at } : {}),
  // The validated split ("Definitivo") once SM closed the validation.
  ...(opportunity.split_final !== undefined ? { split_final: opportunity.split_final } : {}),
});

const toDetail = (detail: OpportunityDetail): OpportunityDetail => ({
  ...toOpportunity(detail),
  declared: detail.declared,
  result: detail.result,
  know_how_example: detail.know_how_example,
  verified: detail.verified,
  checklist: detail.checklist,
  projection: detail.projection,
  // Each file with its download link (url), as the API sends it.
  files: detail.files,
  tripartite: detail.tripartite,
  ...(detail.binding !== undefined ? { binding: detail.binding } : {}),
  // SM's share and the projection's period and totals: the API computes them.
  ...(detail.sm_share_pct !== undefined ? { sm_share_pct: detail.sm_share_pct } : {}),
  ...(detail.projection_years !== undefined ? { projection_years: detail.projection_years } : {}),
  ...(detail.projection_total_bishop !== undefined ? { projection_total_bishop: detail.projection_total_bishop } : {}),
  ...(detail.projection_total_sm !== undefined ? { projection_total_sm: detail.projection_total_sm } : {}),
});

const toInvestment = (investment: BishopInvestmentResponse): BishopInvestment => ({
  id: investment.id,
  bishop_user_id: investment.bishop_user_id,
  business_id: investment.business_id,
  business_name: investment.business_name,
  invested: investment.invested,
  invested_at: investment.invested_at,
  recovered: investment.recovered,
  recovered_pct: investment.recovered_pct,
  current_share_pct: investment.current_share_pct,
  // "Definitivo" once SM closed the validation; absent until the API sends it (read as provisional).
  ...(investment.split_final !== undefined ? { split_final: investment.split_final } : {}),
  ...(investment.split !== undefined ? { split: investment.split } : {}),
  estimated_payback_month: investment.estimated_payback_month,
  franchises: investment.franchises,
  recovery: investment.recovery,
  // "no_reports_yet": nothing reported, so there is nothing recovered to draw.
  ...(investment.recovery_status !== undefined ? { recovery_status: investment.recovery_status } : {}),
  // The SM consultant of the business ("Agendar con..."): kept so the Bishop can schedule with him.
  ...(investment.consultant !== undefined ? { consultant: investment.consultant } : {}),
});

const opportunityPath = (id: Uuid) => `/opportunities/${encodeURIComponent(id)}`;

export function createHttpBishopRepository(client: HttpClient): BishopRepository {
  /** accept, pass and clear: no body, the opportunity as the Bishop sees it now. */
  const decide = async (id: Uuid, action: "accept" | "pass" | "clear") =>
    toOpportunity(await client.post<BishopOpportunity>(`${opportunityPath(id)}/${action}`));

  return {
    getPortfolio: async () => {
      const portfolio = await client.get<BishopPortfolioResponse>("/bishop/portfolio");
      return { investments: portfolio.investments.map(toInvestment), totals: portfolio.totals };
    },

    /** Empty until the Bishop signs his framework agreement. */
    listOpportunities: async () =>
      (await client.get<BishopOpportunity[]>("/opportunities")).map(toOpportunity),

    /** Out of reach (another Bishop's, or not an opportunity) answers 404: null, as the mock. */
    getOpportunity: async (id) => {
      const detail = await getOrNull<OpportunityDetail>(client, opportunityPath(id));
      return detail ? toDetail(detail) : null;
    },

    acceptOpportunity: (id) => decide(id, "accept"),

    pass: (id) => decide(id, "pass"),

    clearDecision: (id) => decide(id, "clear"),

    /** Framework first, then tripartite contracts, then the rest (the API's order). */
    listAgreements: () => client.get<BishopAgreement[]>("/agreements"),
  };
}
