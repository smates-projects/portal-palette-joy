// BusinessFileRepository over the real API (pipeline module: business-entry.controller.ts). The owner reads his own
// snapshot without the score (the API blanks it); milestones are SM only.
import type { BusinessFileRepository } from "../repositories";
import type { AssessmentSnapshot, BusinessMilestone, Uuid } from "../types";
import { getOrNull, type HttpClient } from "./client";
import { ensureCurrentUser } from "./session";

const businessPath = (id: Uuid) => `/businesses/${encodeURIComponent(id)}`;

export function createHttpBusinessFileRepository(client: HttpClient): BusinessFileRepository {
  return {
    /** Null when the business entered before the assessment existed, or is not found. */
    getSnapshot: async (businessId) => {
      const id = businessId ?? (await ensureCurrentUser(client)).business_id;
      return id ? getOrNull<AssessmentSnapshot>(client, `${businessPath(id)}/snapshot`) : null;
    },

    /** A business out of reach (404) has no milestones to show: an empty list. */
    listMilestones: async (businessId) =>
      (await getOrNull<BusinessMilestone[]>(client, `${businessPath(businessId)}/milestones`)) ??
      [],
  };
}
