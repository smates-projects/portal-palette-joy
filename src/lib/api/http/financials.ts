// FinancialsRepository over the real API (franchising module: manual.controller.ts, GET /businesses/{id}/financials).
// The API always names the business: without one the adapter uses the signed-in person's own.
import type { FinancialsRepository } from "../repositories";
import type { FinancialSeries } from "../types";
import type { HttpClient } from "./client";
import { ensureCurrentUser } from "./session";

export function createHttpFinancialsRepository(client: HttpClient): FinancialsRepository {
  return {
    /** Null when the business has no series yet, or the person has no business (without calling). */
    get: async (businessId) => {
      const id = businessId ?? (await ensureCurrentUser(client)).business_id;
      if (!id) return null;
      return client.get<FinancialSeries | null>(`/businesses/${encodeURIComponent(id)}/financials`);
    },
  };
}
