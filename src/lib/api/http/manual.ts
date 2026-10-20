// ManualRepository over the real API (franchising module: manual.controller.ts). Without a business the API answers
// the caller's own manual (the owner's, or a franchisee's franchisor); SM always names the business.
import type { ManualRepository } from "../repositories";
import type { ManualOverview, ManualSection, ManualVersion, Uuid } from "../types";
import type { HttpClient } from "./client";

const businessManualPath = (id: Uuid) => `/businesses/${encodeURIComponent(id)}/manual`;

export function createHttpManualRepository(client: HttpClient): ManualRepository {
  return {
    get: (businessId) =>
      client.get<ManualOverview>(businessId ? businessManualPath(businessId) : "/manual"),

    publish: (businessId, input) =>
      client.post<ManualVersion>(`${businessManualPath(businessId)}/publish`, {
        note: input.note,
        section_ids: input.section_ids,
      }),

    approveSection: (sectionId) =>
      client.post<ManualSection>(`/manual-sections/${encodeURIComponent(sectionId)}/approve`),
  };
}
