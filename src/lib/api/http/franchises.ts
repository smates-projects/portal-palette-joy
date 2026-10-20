// FranchisesRepository over the real API (franchising module: franchises.controller.ts). Scope (franchisor owner,
// SM office, SM Global, franchisee) is the API's; royalty and marketing fund of a report are computed there too.
import type { FranchisesRepository } from "../repositories";
import type {
  FranchiseDetail,
  FranchiseReport,
  FranchiseSummary,
  FranchisorSummary,
  SupportTicket,
  Uuid,
} from "../types";
import { getOrNull, type HttpClient } from "./client";

const franchisePath = (id: Uuid) => `/franchises/${encodeURIComponent(id)}`;

export function createHttpFranchisesRepository(client: HttpClient): FranchisesRepository {
  return {
    /** GET /franchises, narrowed to one franchisor when given. */
    list: (franchisorBusinessId) =>
      client.get<FranchiseSummary[]>("/franchises", {
        query: { franchisor_business_id: franchisorBusinessId },
      }),

    /** 404 (unknown or out of scope) is null. */
    get: (id) => getOrNull<FranchiseDetail>(client, franchisePath(id)),

    /** Without a business: the franchisor owner's own (SM names one). */
    getFranchisorSummary: (businessId) =>
      client.get<FranchisorSummary>("/franchisor/summary", { query: { business_id: businessId } }),

    /** One unit's reports, or every unit in scope (GET /franchise-reports). */
    listReports: (franchiseId) =>
      client.get<FranchiseReport[]>(
        franchiseId ? `${franchisePath(franchiseId)}/reports` : "/franchise-reports",
      ),

    submitReport: (franchiseId, input) =>
      client.post<FranchiseReport>(`${franchisePath(franchiseId)}/reports`, {
        month: input.month,
        gross_sales: input.gross_sales,
      }),

    listTickets: () => client.get<SupportTicket[]>("/tickets"),
  };
}
