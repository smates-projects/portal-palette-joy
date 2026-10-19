// BusinessesRepository over the real API (organizations module: businesses.controller.ts).
import type { BusinessesRepository } from "../repositories";
import type { Business, BusinessEvent, BusinessStatus } from "../types";
import { ApiError, type HttpClient } from "./client";

/** The API's event: the front's consultant_changed plus status_changed (new), with a nullable to_user_id. */
interface BusinessEventResponse {
  id: string;
  business_id: string;
  kind: "consultant_changed" | "status_changed";
  actor_user_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  from_status: BusinessStatus | null;
  to_status: BusinessStatus | null;
  created_at: string;
}

/** The front only shows consultant changes; status changes (an API admin switch) are left out. */
const toFrontEvents = (events: BusinessEventResponse[]): BusinessEvent[] =>
  events.flatMap((event) =>
    event.kind === "consultant_changed" && event.to_user_id
      ? [
          {
            id: event.id,
            business_id: event.business_id,
            kind: "consultant_changed" as const,
            actor_user_id: event.actor_user_id,
            from_user_id: event.from_user_id,
            to_user_id: event.to_user_id,
            created_at: event.created_at,
          },
        ]
      : [],
  );

const businessPath = (id: string) => `/businesses/${encodeURIComponent(id)}`;

export function createHttpBusinessesRepository(client: HttpClient): BusinessesRepository {
  return {
    list: () => client.get<Business[]>("/businesses"),

    /** Gap: franchisability is phase 4 (program module); the API has no endpoint yet. Rejects without calling. */
    getFranchisability: async () => {
      throw new ApiError({
        code: "not_implemented",
        status: 501,
        detail: "Franchisability is not available in the API yet.",
      });
    },

    listEvents: async (businessId) =>
      toFrontEvents(
        await client.get<BusinessEventResponse[]>(`${businessPath(businessId)}/events`),
      ),

    /**
     * PATCH /businesses/{id}/consultant requires If-Match with the ETag of GET /businesses/{id}. The list carries no
     * versions, so the business is read first when its ETag is not known; a stale one answers precondition_failed.
     */
    setConsultant: async (businessId, userId) => {
      const resource = businessPath(businessId);
      if (!client.etags.has(resource)) await client.get<Business>(resource);
      return client.patch<Business>(`${resource}/consultant`, { user_id: userId }, { resource });
    },
  };
}
