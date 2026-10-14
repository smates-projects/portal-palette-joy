import { TODAY } from "@/config/app";
import type { AreaCode, Business, Franchisability, Organization, TaskVersion, TaskWithComputed, User } from "@/lib/api/types";
import { AREAS, areaHealth, type Health } from "./owner";

export const SEVERITY: Record<Health, number> = { grey: 0, green: 1, amber: 2, red: 3 };
const PROGRAM_LENGTH = 180;

const mostFrequent = (ids: string[]) => {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};

/** Consultant of a business = the SM person who supervises most of its tasks. */
export const consultantOf = (businessId: string, tasks: TaskWithComputed[]) =>
  mostFrequent(tasks.filter((t) => t.business_id === businessId).map((t) => t.supervisor_user_id));

/**
 * Franchisability light: green when ready (goal reached and no required task missing);
 * amber when approved share keeps pace with program time (day/180 of the goal); red when behind.
 */
export function franchiseHealth(f: Franchisability, programDay: number): Exclude<Health, "grey"> {
  if (f.is_ready) return "green";
  const expected = (Math.min(programDay, PROGRAM_LENGTH) / PROGRAM_LENGTH) * f.franchisability_goal;
  return f.franchisability_pct >= expected ? "amber" : "red";
}

export interface BusinessRow {
  business: Business;
  owner: User | null;
  consultant: User | null;
  areas: { area: AreaCode; health: Health }[];
  /** Worst of its areas. */
  health: Health;
  total: number;
  accepted: number;
  accepted_pct: number;
  franchise: Franchisability | null;
  franchise_health: Exclude<Health, "grey"> | null;
}

/** Negocios: one row per business, worst health first, then name. */
export function buildBusinessRows(
  businesses: Business[],
  tasks: TaskWithComputed[],
  versions: TaskVersion[],
  users: User[],
  franchise: Franchisability[],
  today = TODAY,
): BusinessRow[] {
  const user = (id: string | null) => (id ? users.find((u) => u.id === id) ?? null : null);
  return businesses
    .map((business) => {
      const mine = tasks.filter((t) => t.business_id === business.id);
      const areas = AREAS.map((area) => ({ area, health: areaHealth(mine.filter((t) => t.area === area), versions, today) }));
      const health = areas.reduce<Health>((w, c) => (SEVERITY[c.health] > SEVERITY[w] ? c.health : w), "grey");
      const accepted = mine.filter((t) => t.status === "accepted").length;
      const f = franchise.find((x) => x.business_id === business.id) ?? null;
      return {
        business,
        owner: user(business.owner_user_id),
        consultant: user(consultantOf(business.id, tasks)),
        areas,
        health,
        total: mine.length,
        accepted,
        accepted_pct: mine.length ? Math.round((accepted / mine.length) * 100) : 0,
        franchise: f,
        franchise_health: f ? franchiseHealth(f, business.program_day) : null,
      };
    })
    .sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health] || a.business.name.localeCompare(b.business.name));
}

export interface BusinessesSearch {
  biz?: string;
  consultant?: string;
  health?: Health;
  industry?: string;
}
const HEALTHS: Health[] = ["red", "amber", "green", "grey"];
export function validateBusinessesSearch(raw: Record<string, unknown>): BusinessesSearch {
  const s: BusinessesSearch = {};
  for (const k of ["biz", "consultant", "industry"] as const) if (typeof raw[k] === "string" && raw[k]) s[k] = raw[k] as string;
  if (HEALTHS.includes(raw["health"] as Health)) s.health = raw["health"] as Health;
  return s;
}
export const filterBusinessRows = (rows: BusinessRow[], s: BusinessesSearch) =>
  rows.filter(
    (r) =>
      (!s.consultant || r.consultant?.id === s.consultant) &&
      (!s.health || r.health === s.health) &&
      (!s.industry || r.business.industry === s.industry),
  );

/** Firm doing an area: the partner firm of that area, else the SM office's own team (strategy). */
export const firmForArea = (area: AreaCode, orgs: Organization[]) =>
  orgs.find((o) => o.kind === "partner_firm" && o.area === area) ?? orgs.find((o) => o.kind === "sm") ?? null;

export interface AreaCard {
  area: AreaCode;
  health: Health;
  firm: Organization | null;
  open: number;
  overdue: number;
  accepted: number;
}

/** Ficha del negocio: the six areas with their firm and counts. */
export function buildAreaCards(businessId: string, tasks: TaskWithComputed[], versions: TaskVersion[], orgs: Organization[], today = TODAY): AreaCard[] {
  const mine = tasks.filter((t) => t.business_id === businessId);
  return AREAS.map((area) => {
    const inArea = mine.filter((t) => t.area === area);
    const orgId = mostFrequent(inArea.map((t) => t.organization_id));
    return {
      area,
      health: areaHealth(inArea, versions, today),
      firm: (orgId ? orgs.find((o) => o.id === orgId) : null) ?? firmForArea(area, orgs),
      open: inArea.filter((t) => t.status !== "accepted").length,
      overdue: inArea.filter((t) => t.is_overdue).length,
      accepted: inArea.filter((t) => t.status === "accepted").length,
    };
  });
}

export interface FirmCard {
  firm: Organization;
  internal: boolean;
  people: User[];
  businesses: Business[];
  open: number;
  overdue: number;
}

/** Firmas: partner firms plus the office's own team, by area order. */
export function buildFirmCards(orgs: Organization[], users: User[], tasks: TaskWithComputed[], businesses: Business[]): FirmCard[] {
  const areaIdx = (o: Organization) => (o.kind === "sm" ? 0 : o.area ? AREAS.indexOf(o.area) : 99);
  return orgs
    .filter((o) => o.kind === "partner_firm" || o.kind === "sm")
    .map((firm) => {
      const mine = tasks.filter((t) => t.organization_id === firm.id);
      const bizIds = new Set(mine.map((t) => t.business_id));
      return {
        firm,
        internal: firm.kind === "sm",
        people: users.filter((u) => u.organization_id === firm.id),
        businesses: businesses.filter((b) => bizIds.has(b.id)),
        open: mine.filter((t) => t.status !== "accepted").length,
        overdue: mine.filter((t) => t.is_overdue).length,
      };
    })
    .sort((a, b) => areaIdx(a.firm) - areaIdx(b.firm) || a.firm.name.localeCompare(b.firm.name));
}

export interface TeamRow {
  user: User;
  supervises: Business[];
  has_booking_url: boolean;
}

/** Equipo SM: people of the office, with the businesses they consult. */
export function buildTeamRows(users: User[], officeId: string, tasks: TaskWithComputed[], businesses: Business[]): TeamRow[] {
  return users
    .filter((u) => u.role === "sm_team" && u.organization_id === officeId)
    .map((user) => ({
      user,
      supervises: businesses.filter((b) => consultantOf(b.id, tasks) === user.id),
      has_booking_url: !!user.booking_url,
    }))
    .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));
}
