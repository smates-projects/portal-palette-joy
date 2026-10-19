// RoutingRepository over the real API (organizations module: routing.controller.ts).
import type { RoutingRepository } from "../repositories";
import type { RoutingRules, ZoneRule } from "../types";
import type { HttpClient } from "./client";

export function createHttpRoutingRepository(client: HttpClient): RoutingRepository {
  return {
    getRules: () => client.get<RoutingRules>("/routing"),

    /** Adds a zone, or updates it when the input carries its id (same endpoint, 201 either way). */
    setRule: (input) =>
      client.post<ZoneRule>(
        "/routing/rules",
        {
          ...(input.id !== undefined ? { id: input.id } : {}),
          state: input.state,
          city: input.city,
          office_id: input.office_id,
        },
        { idempotent: true },
      ),

    removeRule: async (id) => {
      await client.delete<void>(`/routing/rules/${encodeURIComponent(id)}`);
    },

    setDefaultOffice: (officeId) =>
      client.patch<RoutingRules>("/routing/default-office", { office_id: officeId }),
  };
}
