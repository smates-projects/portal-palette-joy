import { AREAS } from "@/lib/tasks/owner";
import type { Lead, Organization, User } from "./types";
import type { OfficeChecklist, OfficeChecklistItem } from "./network-types";

/**
 * Opening checklist of an SM office, computed from its data (never stored):
 * the manager has an account in the office, a booking link is set (the office default or the manager's own),
 * every one of the six areas has a partner firm and the office already received its first lead.
 * The Laravel backend will compute it the same way.
 */
export function computeOfficeChecklist(office: Organization, users: User[], orgs: Organization[], leads: Lead[]): OfficeChecklist {
  const manager = users.find((u) => u.id === office.manager_user_id);
  const firms = orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === office.id);
  const missingAreas = AREAS.filter((area) => !firms.some((f) => f.area === area));
  const items: OfficeChecklistItem[] = [
    { key: "manager_access", done: !!manager && manager.role === "sm_team" && manager.organization_id === office.id && !!manager.email, missing_areas: [] },
    { key: "booking_link", done: !!office.default_booking_url?.trim() || !!manager?.booking_url?.trim(), missing_areas: [] },
    { key: "partner_firms", done: missingAreas.length === 0, missing_areas: missingAreas },
    { key: "first_lead", done: leads.some((l) => l.office_id === office.id), missing_areas: [] },
  ];
  return { items, complete: items.every((i) => i.done) };
}
