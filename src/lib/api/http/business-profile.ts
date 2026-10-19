// BusinessProfileRepository over the real API (organizations module: business-profile.controller.ts).
// The front's methods take an optional business id ("own business" for the owner); every API route names the
// business, so the owner's own one comes from the signed-in person (GET /me business_id).
import type { BusinessProfileRepository } from "../repositories";
import type { BusinessProfile, ProfileChangeRequest, TeamMember, Uuid } from "../types";
import { ApiError, getOrNull, type HttpClient } from "./client";
import { ensureCurrentUser } from "./session";

const businessPath = (id: string) => `/businesses/${encodeURIComponent(id)}`;

export function createHttpBusinessProfileRepository(client: HttpClient): BusinessProfileRepository {
  /** The given business, or the signed-in person's own; null when the person has no business. */
  const businessIdOrOwn = async (businessId?: Uuid): Promise<Uuid | null> =>
    businessId ?? (await ensureCurrentUser(client)).business_id;

  /** Writes that are "own business only": without one the API would answer 404, the mock answers forbidden. */
  const ownBusinessId = async (): Promise<Uuid> => {
    const id = await businessIdOrOwn();
    if (!id) throw new ApiError({ code: "forbidden", status: 403 });
    return id;
  };

  return {
    get: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id ? getOrNull<BusinessProfile>(client, `${businessPath(id)}/profile`) : null;
    },

    update: async (patch) =>
      client.patch<BusinessProfile>(`${businessPath(await ownBusinessId())}/profile`, patch),

    requestChange: async (input) =>
      client.post<ProfileChangeRequest>(
        `${businessPath(await ownBusinessId())}/profile/change-requests`,
        { field: input.field, new_value: input.new_value, reason: input.reason },
        { idempotent: true },
      ),

    listChangeRequests: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id
        ? client.get<ProfileChangeRequest[]>(`${businessPath(id)}/profile/change-requests`)
        : [];
    },

    resolveChangeRequest: (id, status, note) =>
      client.post<ProfileChangeRequest>(
        `/profile-change-requests/${encodeURIComponent(id)}/resolve`,
        { status, note },
      ),

    listTeam: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id ? client.get<TeamMember[]>(`${businessPath(id)}/team`) : [];
    },

    inviteMember: async (input) =>
      client.post<TeamMember>(
        `${businessPath(await ownBusinessId())}/team/invite`,
        { name: input.name, role: input.role, email: input.email },
        { idempotent: true },
      ),

    makeOwner: (memberId) =>
      client.post<TeamMember>(`/team-members/${encodeURIComponent(memberId)}/make-owner`),
  };
}
