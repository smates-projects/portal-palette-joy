// BusinessesRepository over the real API (organizations module: businesses.controller.ts; franchisability lives in
// the program module: tasks.controller.ts).
import type { BusinessesRepository } from "../repositories";
import type { Business, BusinessEvent, BusinessStatus, Franchisability } from "../types";
import { listAllByCursor, type HttpClient } from "./client";

/**
 * The API's "Actividad" feed merges four kinds: consultant_changed and status_changed (the business itself),
 * task_event (the history of its tasks) and activity (the audit trail of everything else), with a nullable actor
 * (system changes) and the task or subject fields of each kind.
 */
interface BusinessEventResponse {
  id: string;
  business_id: string;
  kind: "consultant_changed" | "status_changed" | "task_event" | "activity";
  actor_user_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  from_status: BusinessStatus | null;
  to_status: BusinessStatus | null;
  created_at: string;
  task_id?: string | null;
  task_code?: string | null;
  task_event_kind?: string | null;
  activity_kind?: string | null;
  subject_type?: string | null;
  subject_id?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Page size of GET /businesses/{id}/events (the API's maximum): the screen reads the whole feed. */
const EVENTS_PAGE_LIMIT = 200;

/**
 * The front's BusinessEvent only knows consultant changes made by a person, so the rest of the merged feed is left
 * out rather than forced into that shape:
 * - status_changed (an API admin switch) has no consultant to show;
 * - task_event: the front shows a task's history in the task itself (TasksRepository.get);
 * - activity: audit entries with free-form payloads the screen has no copy for;
 * - consultant_changed without an actor (a system assignment) or without a new consultant: BusinessEvent requires both.
 */
const toFrontEvents = (events: BusinessEventResponse[]): BusinessEvent[] =>
  events.flatMap((event) =>
    event.kind === "consultant_changed" && event.to_user_id && event.actor_user_id
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

    getFranchisability: (businessId) =>
      client.get<Franchisability>(`${businessPath(businessId)}/franchisability`),

    /** Every page of the feed (meta.next_cursor), newest first, in the front's shape. */
    listEvents: async (businessId) =>
      toFrontEvents(
        await listAllByCursor<BusinessEventResponse>(client, `${businessPath(businessId)}/events`, {
          limit: EVENTS_PAGE_LIMIT,
        }),
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

    /**
     * POST /businesses/{id}/transfer { office_id, consultant_user_id? } (If-Match like the consultant change): "Derivar
     * a oficina". The consultant is optional: without one the API picks who follows it in the target office.
     */
    transfer: async (businessId, input) => {
      const resource = businessPath(businessId);
      if (!client.etags.has(resource)) await client.get<Business>(resource);
      return client.post<Business>(
        `${resource}/transfer`,
        { office_id: input.office_id, ...(input.consultant_user_id ? { consultant_user_id: input.consultant_user_id } : {}) },
        { resource },
      );
    },
  };
}
