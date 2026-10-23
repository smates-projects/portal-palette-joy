// What "Mi perfil" shows for each role (QA M3 of 23 Oct 2026): a partner firm sees how owners and SM see its firm and
// its team; SM people their office and team; an owner their business and its team (GET /businesses/{id}/team); a
// Bishop and anyone without an organization only their own data.
import type { UserRole } from "@/lib/api/types";

export interface ProfileView {
  /** Locale key of the page heading. */
  heading: string;
  /** The card at the top: the organization (firm, office, franchise unit), the owner's business, or the person. */
  card: "organization" | "business" | "person";
  /** Whose people are listed under it. */
  team: "organization" | "business" | "none";
}

export function profileViewOf(role: UserRole | undefined): ProfileView {
  switch (role) {
    case "partner_firm":
      return { heading: "profile.heading", card: "organization", team: "organization" };
    case "sm_team":
    case "sm_global":
      return { heading: "profile.heading_sm", card: "organization", team: "organization" };
    case "business_owner":
      return { heading: "profile.heading_owner", card: "business", team: "business" };
    case "franchisee":
      return { heading: "profile.heading_person", card: "organization", team: "organization" };
    default:
      return { heading: "profile.heading_person", card: "person", team: "none" };
  }
}
