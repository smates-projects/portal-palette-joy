// "Agendar reunión" on a lead: who the owner's account is, and whether the portal schedules it or the booking link does.
import type { LeadStage, User } from "@/lib/api/types";
import type { SchedulingPerson } from "@/lib/calendar/scheduling";
import type { LeadPrimaryAction } from "./pipeline";

/**
 * The owner's portal account of a lead, if it has one (it exists from the booking or "Enviar NDA" on): the business
 * owner of the lead's business, or, before the business is linked, the owner with the lead's email.
 */
export function leadOwnerOf<U extends Pick<User, "id" | "role" | "business_id" | "email">>(
  lead: { business_id: string | null; contact: { email: string } },
  users: readonly U[] | undefined,
): U | undefined {
  const owners = (users ?? []).filter((u) => u.role === "business_owner");
  const email = lead.contact.email.trim().toLowerCase();
  return (
    (lead.business_id ? owners.find((u) => u.business_id === lead.business_id) : undefined) ??
    owners.find((u) => !!email && u.email.trim().toLowerCase() === email)
  );
}

/**
 * How "Agendar reunión" / "Reagendar" books: with the SM user's Google Calendar connected or an owner account, the
 * portal's scheduling dialog (the lead's email gets the Meet invitation); otherwise the consultant's booking link.
 * null: not a booking action.
 */
export function scheduleRoute(
  action: LeadPrimaryAction,
  ownerHasAccount: boolean,
  smCalendarConnected = false,
): "dialog" | "booking_link" | null {
  if (action !== "schedule" && action !== "rebook") return null;
  return smCalendarConnected || ownerHasAccount ? "dialog" : "booking_link";
}

/**
 * Who the scheduling dialog of a lead starts with, besides the organizer. On an accepted lead the meeting is the
 * expansion one: the Bishop who accepted it and the owner's account. Before that nobody: the prospect is invited by
 * the lead's email.
 */
export function leadMeetingPeople(
  lead: { stage: LeadStage },
  owner: Pick<User, "id" | "full_name"> | undefined,
  bishop: { user_id: string; name: string } | null | undefined,
): SchedulingPerson[] {
  if (lead.stage !== "accepted") return [];
  return [
    ...(bishop ? [{ user_id: bishop.user_id, name: bishop.name }] : []),
    ...(owner ? [{ user_id: owner.id, name: owner.full_name }] : []),
  ];
}
