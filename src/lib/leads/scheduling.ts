// "Agendar reunión" on a lead: who the owner's account is, and whether the portal schedules it or the booking link does.
import type { User } from "@/lib/api/types";
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
 * How "Agendar reunión" / "Reagendar" books: with an owner account, the portal's scheduling dialog (both calendars,
 * the lead refreshes in place); without one, the consultant's booking link (the person books it). null: not a
 * booking action.
 */
export function scheduleRoute(
  action: LeadPrimaryAction,
  ownerHasAccount: boolean,
): "dialog" | "booking_link" | null {
  if (action !== "schedule" && action !== "rebook") return null;
  return ownerHasAccount ? "dialog" : "booking_link";
}
