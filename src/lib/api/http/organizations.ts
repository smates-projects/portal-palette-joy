// OrganizationsRepository over the real API (organizations module: organizations.controller.ts).
import type { OrganizationsRepository } from "../repositories";
import type { CreateFirmInput, FirmEvent, Organization } from "../types";
import { getOrNull, type HttpClient } from "./client";

const firmPath = (id: string) => `/firms/${encodeURIComponent(id)}`;

/** CreateFirmInputSchema of the API, field by field (office_id only when given). */
const firmBody = (input: CreateFirmInput) => ({
  ...(input.office_id !== undefined ? { office_id: input.office_id } : {}),
  name: input.name,
  area: input.area,
  internal: input.internal,
  specialty: input.specialty,
  contact_name: input.contact_name,
  email: input.email,
  phone: input.phone,
  city: input.city,
  first_person: {
    full_name: input.first_person.full_name,
    email: input.first_person.email,
    title: input.first_person.title,
  },
});

export function createHttpOrganizationsRepository(client: HttpClient): OrganizationsRepository {
  return {
    list: () => client.get<Organization[]>("/organizations"),

    get: (id) => getOrNull<Organization>(client, `/organizations/${encodeURIComponent(id)}`),

    createFirm: (input) =>
      client.post<Organization>("/firms", firmBody(input), { idempotent: true }),

    updateFirm: (id, patch) => client.patch<Organization>(firmPath(id), patch),

    /**
     * POST /firms/{id}/replace answers the new firm. Partial gap: the API records the open-tasks policy on both
     * firm events but moves nothing yet ("transfer" is phase 4, when tasks exist), so moved_tasks is 0.
     */
    replaceFirm: (id, input, openTasks) =>
      client.post<Organization>(
        `${firmPath(id)}/replace`,
        { ...firmBody(input), open_tasks: openTasks },
        { idempotent: true },
      ),

    deactivateFirm: (id, reason) =>
      client.post<Organization>(`${firmPath(id)}/deactivate`, { reason }),

    listFirmEvents: (organizationId) =>
      client.get<FirmEvent[]>(
        organizationId ? `${firmPath(organizationId)}/events` : "/firm-events",
      ),
  };
}
