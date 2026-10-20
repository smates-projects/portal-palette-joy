// NetworkRepository over the real API (network module: network.controller.ts). The API answers the front's shapes
// (OfficeSummary, OfficeDetail, StructureTree...); who may read or write what (SM Global, the office's own team) is
// the API's answer, as forbidden. Opening an office is the one write with an Idempotency-Key: a retried request
// never opens two offices.
import type { NetworkRepository } from "../repositories";
import type {
  AreaBottleneck,
  NetworkFunnel,
  NetworkSummary,
  OfficeDetail,
  OfficeSummary,
  StructureTree,
  Uuid,
} from "../types";
import { getOrNull, type HttpClient } from "./client";

const officePath = (id: Uuid) => `/offices/${encodeURIComponent(id)}`;

export function createHttpNetworkRepository(client: HttpClient): NetworkRepository {
  return {
    getSummary: () => client.get<NetworkSummary>("/network/summary"),

    listOffices: () => client.get<OfficeSummary[]>("/network/offices"),

    /** 404 (unknown or out of scope) is null. */
    getOffice: (id) =>
      getOrNull<OfficeDetail>(client, `/network/offices/${encodeURIComponent(id)}`),

    getStructure: () => client.get<StructureTree>("/network/structure"),

    listBottlenecks: () => client.get<AreaBottleneck[]>("/network/bottlenecks"),

    getFunnel: () => client.get<NetworkFunnel>("/network/funnel"),

    createOffice: (input) =>
      client.post<OfficeSummary>(
        "/offices",
        {
          city: input.city,
          manager_name: input.manager_name,
          manager_email: input.manager_email,
          planned_opening_date: input.planned_opening_date,
        },
        { idempotent: true },
      ),

    pauseOffice: (officeId, reason) =>
      client.post<OfficeSummary>(`${officePath(officeId)}/pause`, { reason }),

    activateOffice: (officeId) => client.post<OfficeSummary>(`${officePath(officeId)}/activate`),
  };
}
