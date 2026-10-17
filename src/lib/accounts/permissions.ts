// Who may create, deactivate or reactivate whom. Used by the screens (to hide what is not allowed) and by the mock
// (to refuse it), so both agree. The Laravel backend will enforce the same table.
import type { Business, Organization, User, UserRole, Uuid } from "@/lib/api/types";

export interface AccountContext {
  orgs: Organization[];
  businesses: Business[];
  users: User[];
}

export interface InviteTarget {
  role: UserRole;
  organization_id: Uuid | null;
  business_id: Uuid | null;
  is_admin: boolean;
}

export type PermissionReason =
  | "forbidden"
  | "wrong_role"
  | "other_office"
  | "other_organization"
  | "other_business"
  | "admin_not_allowed"
  | "firm_has_people"
  | "self"
  | "inactive_org";

export type Permission = { ok: true } | { ok: false; reason: PermissionReason };

const deny = (reason: PermissionReason): Permission => ({ ok: false, reason });
const ok: Permission = { ok: true };

export const isActiveUser = (u: Pick<User, "status">) => (u.status ?? "active") !== "inactive";
export const isActiveFirm = (o: Pick<Organization, "kind" | "firm_status">) => o.kind !== "partner_firm" || (o.firm_status ?? "active") === "active";

/** The real owner of a business is the one in business.owner_user_id, not every business_owner account. */
export const ownsBusiness = (u: Pick<User, "id" | "role" | "business_id">, businesses: Business[]) =>
  u.role === "business_owner" && !!u.business_id && businesses.some((b) => b.id === u.business_id && b.owner_user_id === u.id);

/** Office of a person: SM team its organization; a firm its parent office; an owner the office of its business. */
export function officeOfUser(u: Pick<User, "role" | "organization_id" | "business_id">, ctx: Pick<AccountContext, "orgs" | "businesses">): Uuid | null {
  if (u.role === "sm_team") return u.organization_id;
  if (u.role === "partner_firm") return ctx.orgs.find((o) => o.id === u.organization_id)?.parent_id ?? null;
  if (u.role === "business_owner") return ctx.businesses.find((b) => b.id === u.business_id)?.office_id ?? null;
  return null;
}

export const isOfficeAdmin = (u: Pick<User, "role" | "is_admin">) => u.role === "sm_team" && !!u.is_admin;
export const isFirmAdmin = (u: Pick<User, "role" | "is_admin">) => u.role === "partner_firm" && !!u.is_admin;

/**
 * Who creates whom:
 * - sm_global: anyone, anywhere, admin or not.
 * - office admin (sm_team + is_admin): sm_team of its office without is_admin, and the FIRST person of a firm of
 *   its office (partner_firm with is_admin). Firms with people already are managed by their own admin.
 * - firm admin (partner_firm + is_admin): people of its own firm, never admins.
 * - business owner (business.owner_user_id): people of its own business, never admins.
 */
export function canInvite(actor: User, target: InviteTarget, ctx: AccountContext): Permission {
  if (!isActiveUser(actor)) return deny("forbidden");
  if (actor.role === "sm_global") {
    if (target.role === "partner_firm" && target.organization_id) {
      const firm = ctx.orgs.find((o) => o.id === target.organization_id);
      if (firm && !isActiveFirm(firm)) return deny("inactive_org");
    }
    return ok;
  }
  if (isOfficeAdmin(actor)) {
    if (target.role === "sm_team") {
      if (target.organization_id !== actor.organization_id) return deny("other_office");
      if (target.is_admin) return deny("admin_not_allowed");
      return ok;
    }
    if (target.role === "partner_firm") {
      const firm = ctx.orgs.find((o) => o.id === target.organization_id && o.kind === "partner_firm");
      if (!firm || firm.parent_id !== actor.organization_id) return deny("other_office");
      if (!isActiveFirm(firm)) return deny("inactive_org");
      if (ctx.users.some((u) => u.organization_id === firm.id && isActiveUser(u))) return deny("firm_has_people");
      if (!target.is_admin) return deny("admin_not_allowed");
      return ok;
    }
    return deny("wrong_role");
  }
  if (isFirmAdmin(actor)) {
    if (target.role !== "partner_firm") return deny("wrong_role");
    if (target.organization_id !== actor.organization_id) return deny("other_organization");
    if (target.is_admin) return deny("admin_not_allowed");
    return ok;
  }
  if (ownsBusiness(actor, ctx.businesses)) {
    if (target.role !== "business_owner") return deny("wrong_role");
    if (target.business_id !== actor.business_id) return deny("other_business");
    if (target.is_admin) return deny("admin_not_allowed");
    return ok;
  }
  return deny("forbidden");
}

/**
 * Who deactivates, reactivates or simulates the acceptance of whom: the same scope as canInvite, plus the office
 * admin over every person of the firms of its office. Never yourself.
 */
export function canManage(actor: User, target: User, ctx: AccountContext): Permission {
  if (actor.id === target.id) return deny("self");
  if (!isActiveUser(actor)) return deny("forbidden");
  if (actor.role === "sm_global") return ok;
  if (isOfficeAdmin(actor)) {
    if (target.role === "sm_team") return target.organization_id === actor.organization_id ? ok : deny("other_office");
    if (target.role === "partner_firm") return officeOfUser(target, ctx) === actor.organization_id ? ok : deny("other_office");
    return deny("wrong_role");
  }
  if (isFirmAdmin(actor)) {
    if (target.role !== "partner_firm") return deny("wrong_role");
    return target.organization_id === actor.organization_id ? ok : deny("other_organization");
  }
  if (ownsBusiness(actor, ctx.businesses)) {
    if (target.role !== "business_owner") return deny("wrong_role");
    return target.business_id === actor.business_id ? ok : deny("other_business");
  }
  return deny("forbidden");
}

/** Partner firms of an office: only its admin or SM Global add, edit, replace or retire them. */
export function canManageFirms(actor: User, officeId: Uuid): Permission {
  if (!isActiveUser(actor)) return deny("forbidden");
  if (actor.role === "sm_global") return ok;
  if (isOfficeAdmin(actor)) return actor.organization_id === officeId ? ok : deny("other_office");
  return deny("forbidden");
}

/** Roles an actor may give to a new person, for the invite form. */
export function invitableRoles(actor: User, ctx: AccountContext): UserRole[] {
  if (actor.role === "sm_global") return ["sm_global", "sm_team", "partner_firm", "business_owner", "bishop", "franchisee"];
  if (isOfficeAdmin(actor)) return ["sm_team", "partner_firm"];
  if (isFirmAdmin(actor)) return ["partner_firm"];
  if (ownsBusiness(actor, ctx.businesses)) return ["business_owner"];
  return [];
}
