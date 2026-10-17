// Which business brand a person's portal shows. One rule for the shell, the mock and the Laravel backend:
// the owner and the team of a business see its brand; the franchisor's franchises inherit it; SM, firms and
// Bishops keep the Strategic Mates brand.
import type { Business, BusinessBrand, Franchise, User, Uuid } from "@/lib/api/types";

/** Business whose brand applies to this person, or null (Strategic Mates brand). */
export function brandBusinessIdFor(user: Pick<User, "role" | "business_id" | "organization_id">, franchises: Pick<Franchise, "id" | "franchisor_business_id">[]): Uuid | null {
  if (user.role === "business_owner") return user.business_id;
  if (user.role === "franchisee") return franchises.find((f) => f.id === user.organization_id)?.franchisor_business_id ?? null;
  return null;
}

export function brandFor(
  user: Pick<User, "role" | "business_id" | "organization_id">,
  brands: BusinessBrand[],
  franchises: Pick<Franchise, "id" | "franchisor_business_id">[],
): BusinessBrand | null {
  const id = brandBusinessIdFor(user, franchises);
  return id ? brands.find((b) => b.business_id === id) ?? null : null;
}

/** Who may read the brand of a business: owner and team, its franchises, SM team of its office and SM Global. */
export function canReadBrand(user: Pick<User, "role" | "business_id" | "organization_id">, business: Pick<Business, "id" | "office_id">, franchises: Pick<Franchise, "id" | "franchisor_business_id">[]) {
  if (user.role === "sm_global") return true;
  if (user.role === "sm_team") return user.organization_id === business.office_id;
  return brandBusinessIdFor(user, franchises) === business.id;
}

/** Who may load the brand by hand: SM team of the office or SM Global. Franchises never edit it. */
export const canSetBrand = (user: Pick<User, "role" | "organization_id">, business: Pick<Business, "office_id">) =>
  user.role === "sm_global" || (user.role === "sm_team" && user.organization_id === business.office_id);

/** "Volver a la marca de Strategic Mates": the owner of the business or SM. */
export const canResetBrand = (user: Pick<User, "id" | "role" | "organization_id">, business: Pick<Business, "office_id" | "owner_user_id">) =>
  canSetBrand(user, business) || (user.role === "business_owner" && business.owner_user_id === user.id);

/** Catalog task whose approved deliverable applies the brand. */
export const BRAND_TASK_CODE = "B5-13";
