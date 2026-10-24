import { describe, expect, it } from "vitest";
import type { Business, Organization, User } from "@/lib/api/types";
import { canInvite, canManage, canManageFirms, hasBookingLink, invitableRoles, officeOfUser } from "./permissions";

const user = (id: string, role: User["role"], organization_id: string | null, business_id: string | null, is_admin = false, status: User["status"] = "active"): User => ({
  id, full_name: id, email: `${id}@x.com`, role, organization_id, business_id, title: null, google_calendar_email: null, booking_url: null, is_admin, status,
});
const org = (id: string, kind: Organization["kind"], parent_id: string | null, extra: Partial<Organization> = {}): Organization => ({
  id, name: id, kind, area: null, specialty: null, city: null, email: null, phone: null, parent_id, ...extra,
});

const GLOBAL = org("global", "sm_global", null);
const MIAMI = org("miami", "sm", "global");
const ORLANDO = org("orlando", "sm", "global");
const PEREZ = org("perez", "partner_firm", "miami", { area: "B6" });
const EMPTY_FIRM = org("newfirm", "partner_firm", "miami", { area: "B5" });
const OLD_FIRM = org("oldfirm", "partner_firm", "miami", { area: "B3", firm_status: "inactive" });
const ORL_FIRM = org("orlfirm", "partner_firm", "orlando", { area: "B2" });
const VOSSLER: Business = { id: "vossler", name: "Vossler", industry: "", city: "", state: "", owner_user_id: "carla", status: "in_program", program_start_date: "2026-08-02", program_day: 74, office_id: "miami", consultant_id: null };
const PRIME: Business = { ...VOSSLER, id: "prime", name: "Prime", owner_user_id: "daniel" };

const marilyn = user("marilyn", "sm_global", "global", null, true);
const andrea = user("andrea", "sm_team", "miami", null, true);
const nicolas = user("nicolas", "sm_team", "miami", null);
const lucia = user("lucia", "partner_firm", "perez", null, true);
const julian = user("julian", "partner_firm", "perez", null);
const carla = user("carla", "business_owner", null, "vossler", true);
const ana = user("ana", "business_owner", null, "vossler");
const valentina = user("valentina", "sm_team", "orlando", null, true);
const ctx = { orgs: [GLOBAL, MIAMI, ORLANDO, PEREZ, EMPTY_FIRM, OLD_FIRM, ORL_FIRM], businesses: [VOSSLER, PRIME], users: [marilyn, andrea, nicolas, lucia, julian, carla, ana, valentina] };

describe("who creates whom", () => {
  it("SM Global creates anyone anywhere and may make them admin", () => {
    expect(canInvite(marilyn, { role: "sm_team", organization_id: "orlando", business_id: null, is_admin: true }, ctx).ok).toBe(true);
    expect(canInvite(marilyn, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: false }, ctx).ok).toBe(true);
    expect(canInvite(marilyn, { role: "business_owner", organization_id: null, business_id: "prime", is_admin: false }, ctx).ok).toBe(true);
    expect(canInvite(marilyn, { role: "sm_global", organization_id: "global", business_id: null, is_admin: true }, ctx).ok).toBe(true);
    expect(invitableRoles(marilyn, ctx)).toHaveLength(6);
  });
  it("the office admin creates SM people of its office without admin", () => {
    expect(canInvite(andrea, { role: "sm_team", organization_id: "miami", business_id: null, is_admin: false }, ctx).ok).toBe(true);
    expect(canInvite(andrea, { role: "sm_team", organization_id: "miami", business_id: null, is_admin: true }, ctx)).toEqual({ ok: false, reason: "admin_not_allowed" });
    expect(canInvite(andrea, { role: "sm_team", organization_id: "orlando", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "other_office" });
    expect(canInvite(andrea, { role: "business_owner", organization_id: null, business_id: "vossler", is_admin: false }, ctx)).toEqual({ ok: false, reason: "wrong_role" });
    expect(invitableRoles(andrea, ctx)).toEqual(["sm_team", "partner_firm"]);
  });
  it("the office admin creates only the FIRST person of a firm of its office, as its admin", () => {
    expect(canInvite(andrea, { role: "partner_firm", organization_id: "newfirm", business_id: null, is_admin: true }, ctx).ok).toBe(true);
    expect(canInvite(andrea, { role: "partner_firm", organization_id: "newfirm", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "admin_not_allowed" });
    expect(canInvite(andrea, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: true }, ctx)).toEqual({ ok: false, reason: "firm_has_people" });
    expect(canInvite(andrea, { role: "partner_firm", organization_id: "orlfirm", business_id: null, is_admin: true }, ctx)).toEqual({ ok: false, reason: "other_office" });
    expect(canInvite(andrea, { role: "partner_firm", organization_id: "oldfirm", business_id: null, is_admin: true }, ctx)).toEqual({ ok: false, reason: "inactive_org" });
  });
  it("an SM person without admin creates nobody", () => {
    expect(canInvite(nicolas, { role: "sm_team", organization_id: "miami", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "forbidden" });
    expect(invitableRoles(nicolas, ctx)).toEqual([]);
  });
  it("the firm admin invites people of its own firm, never admins; a non-admin firm person invites nobody", () => {
    expect(canInvite(lucia, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: false }, ctx).ok).toBe(true);
    expect(canInvite(lucia, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: true }, ctx)).toEqual({ ok: false, reason: "admin_not_allowed" });
    expect(canInvite(lucia, { role: "partner_firm", organization_id: "newfirm", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "other_organization" });
    expect(canInvite(lucia, { role: "sm_team", organization_id: "miami", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "wrong_role" });
    expect(canInvite(julian, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "forbidden" });
  });
  it("the owner in charge invites people of its business; a team member does not", () => {
    expect(canInvite(carla, { role: "business_owner", organization_id: null, business_id: "vossler", is_admin: false }, ctx).ok).toBe(true);
    expect(canInvite(carla, { role: "business_owner", organization_id: null, business_id: "prime", is_admin: false }, ctx)).toEqual({ ok: false, reason: "other_business" });
    expect(canInvite(carla, { role: "partner_firm", organization_id: "perez", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "wrong_role" });
    expect(canInvite(ana, { role: "business_owner", organization_id: null, business_id: "vossler", is_admin: false }, ctx)).toEqual({ ok: false, reason: "forbidden" });
  });
  it("a deactivated actor creates nobody", () => {
    const gone = { ...andrea, status: "inactive" as const };
    expect(canInvite(gone, { role: "sm_team", organization_id: "miami", business_id: null, is_admin: false }, ctx)).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("who deactivates, reactivates or accepts for whom", () => {
  it("never yourself", () => {
    expect(canManage(marilyn, marilyn, ctx)).toEqual({ ok: false, reason: "self" });
  });
  it("the office admin manages its team and the people of its firms, not another office", () => {
    expect(canManage(andrea, nicolas, ctx).ok).toBe(true);
    expect(canManage(andrea, julian, ctx).ok).toBe(true);
    expect(canManage(andrea, valentina, ctx)).toEqual({ ok: false, reason: "other_office" });
    expect(canManage(andrea, carla, ctx)).toEqual({ ok: false, reason: "wrong_role" });
  });
  it("the firm admin manages its own people; the owner its team", () => {
    expect(canManage(lucia, julian, ctx).ok).toBe(true);
    expect(canManage(julian, lucia, ctx)).toEqual({ ok: false, reason: "forbidden" });
    expect(canManage(carla, ana, ctx).ok).toBe(true);
    expect(canManage(ana, carla, ctx)).toEqual({ ok: false, reason: "forbidden" });
  });
  it("only the office admin or SM Global manage the firms of an office", () => {
    expect(canManageFirms(andrea, "miami").ok).toBe(true);
    expect(canManageFirms(andrea, "orlando")).toEqual({ ok: false, reason: "other_office" });
    expect(canManageFirms(nicolas, "miami")).toEqual({ ok: false, reason: "forbidden" });
    expect(canManageFirms(marilyn, "orlando").ok).toBe(true);
  });
  it("office of a person follows the role", () => {
    expect(officeOfUser(nicolas, ctx)).toBe("miami");
    expect(officeOfUser(lucia, ctx)).toBe("miami");
    expect(officeOfUser(carla, ctx)).toBe("miami");
    expect(officeOfUser(marilyn, ctx)).toBeNull();
  });
  it("a booking link belongs to who takes the meetings of the leads: the SM team and SM Global", () => {
    expect([marilyn, andrea, nicolas].every(hasBookingLink)).toBe(true);
    expect([lucia, carla, user("jefferson", "bishop", null, null)].some(hasBookingLink)).toBe(false);
  });
});
