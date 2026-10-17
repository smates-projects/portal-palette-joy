// Accounts, partner firms, manual leads and the business brand in the mock. Like the rest of the mock layer it
// checks the current user before every write (the rules live in src/lib/accounts/permissions.ts and
// src/lib/brand/scope.ts) so screens and "backend" refuse the same things.
import { nowIso } from "@/config/app";
import { canInvite, canManage, canManageFirms, isActiveFirm, isActiveUser, officeOfUser, ownsBusiness, type AccountContext } from "@/lib/accounts/permissions";
import { isHex } from "@/lib/brand/contrast";
import { BRAND_TASK_CODE, brandBusinessIdFor, brandFor, canReadBrand, canResetBrand, canSetBrand } from "@/lib/brand/scope";
import type { BrandRepository, BusinessProfileRepository, LeadsRepository, OrganizationsRepository, UsersRepository } from "../repositories";
import type {
  AccountEvent,
  BrandEvent,
  BrandPalette,
  Business,
  BusinessBrand,
  CreateFirmInput,
  FirmEvent,
  Franchise,
  InviteUserInput,
  Lead,
  LeadEvent,
  LeadWithComputed,
  Organization,
  Task,
  TaskChange,
  TaskEvent,
  TaskVersion,
  TeamMember,
  User,
  Uuid,
} from "../types";

export interface AccountsDb {
  users: User[];
  orgs: Organization[];
  businesses: Business[];
  tasks: Task[];
  versions: TaskVersion[];
  leads: Lead[];
  franchises: Franchise[];
  teamMembers: TeamMember[];
  accountEvents: AccountEvent[];
  firmEvents: FirmEvent[];
  brands: BusinessBrand[];
  brandEvents: BrandEvent[];
}

export interface AccountsContext {
  db: AccountsDb;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(value: T) => Promise<T>;
  /** Stored notification for a person about a task. */
  notify: (userId: Uuid, kind: "brand_applied" | "task_updated", taskId: Uuid, change?: TaskChange | null) => void;
  /** Logs an SM change on a task and tells the people involved (same path as tasks.update). */
  recordTaskChange: (t: Task, kind: TaskEvent["kind"], change: TaskChange, alsoNotify?: Uuid[]) => void;
  personLabel: (userId: Uuid) => string;
  pushLeadEvent: (e: Omit<LeadEvent, "id" | "actor_user_id" | "created_at">) => LeadEvent;
  withBooking: (l: Lead) => LeadWithComputed;
  /** The lead a write acts on: SM team, own office. */
  findLead: (id: Uuid) => Lead;
}

const validEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const OPEN = (t: Task) => t.status !== "accepted" && t.status !== "cancelled";

export function createAccounts(ctx: AccountsContext) {
  const { db, me, newId, delay } = ctx;
  const account: AccountContext = { orgs: db.orgs, businesses: db.businesses, users: db.users };
  const emailTaken = (email: string) => db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  const logAccount = (user_id: Uuid, kind: AccountEvent["kind"], body: string | null = null, actor: Uuid | null = me().id) =>
    db.accountEvents.push({ id: newId(), user_id, kind, actor_user_id: actor, created_at: nowIso(), body });
  const logFirm = (organization_id: Uuid, kind: FirmEvent["kind"], other: Uuid | null = null, body: string | null = null, moved_tasks: number | null = null) =>
    db.firmEvents.push({ id: newId(), organization_id, kind, actor_user_id: me().id, created_at: nowIso(), other_organization_id: other, body, moved_tasks });
  const findUser = (id: Uuid) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new Error("not_found");
    return u;
  };
  const memberOf = (userId: Uuid) => db.teamMembers.find((m) => m.user_id === userId);

  // ---------- Scope ----------
  /** Everyone the current user may see, deactivated people included. Nobody sees people of another office. */
  const visibleUsers = (): User[] => {
    const u = me();
    if (u.role === "bishop") return [u];
    if (u.role === "sm_global") return db.users;
    if (u.role === "franchisee") return db.users.filter((x) => x.id === u.id || (x.role === "franchisee" && x.organization_id === u.organization_id));
    const mine = officeOfUser(u, account);
    return db.users.filter((x) => x.role === "sm_global" || (x.role !== "bishop" && x.role !== "franchisee" && officeOfUser(x, account) === mine));
  };
  const firmsInScope = (): Organization[] => {
    const u = me();
    if (u.role === "sm_global") return db.orgs.filter((o) => o.kind === "partner_firm");
    if (u.role === "sm_team") return db.orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === u.organization_id);
    if (u.role === "partner_firm") return db.orgs.filter((o) => o.id === u.organization_id);
    throw new Error("forbidden");
  };

  // ---------- People ----------
  const createInvited = (input: InviteUserInput): User => {
    if (!input.full_name.trim()) throw new Error("name_required");
    if (!validEmail(input.email)) throw new Error("invalid_email");
    if (emailTaken(input.email)) throw new Error("email_taken");
    const user: User = {
      id: newId(), full_name: input.full_name.trim(), email: input.email.trim(), role: input.role,
      organization_id: input.organization_id, business_id: input.business_id, title: input.title?.trim() || null,
      google_calendar_email: null, booking_url: null, is_admin: input.is_admin, status: "invited", invited_at: nowIso(),
    };
    db.users.push(user);
    logAccount(user.id, "invited");
    if (input.is_admin) logAccount(user.id, "admin_granted");
    return user;
  };
  /** The organization or business a role needs must exist and match the role. */
  const checkPlacement = (input: InviteUserInput) => {
    const org = input.organization_id ? db.orgs.find((o) => o.id === input.organization_id) : undefined;
    switch (input.role) {
      case "sm_global": if (org?.kind !== "sm_global") throw new Error("invalid_organization"); break;
      case "sm_team": if (org?.kind !== "sm") throw new Error("invalid_organization"); break;
      case "partner_firm": if (org?.kind !== "partner_firm") throw new Error("invalid_organization"); break;
      case "franchisee": if (org?.kind !== "franchise") throw new Error("invalid_organization"); break;
      case "business_owner": if (!db.businesses.some((b) => b.id === input.business_id)) throw new Error("invalid_business"); break;
      case "bishop": break;
    }
  };

  const users: Pick<UsersRepository, "list" | "invite" | "simulateAcceptance" | "deactivate" | "reactivate" | "setAdmin" | "listAccountEvents"> = {
    list: async (opts) => delay(visibleUsers().filter((x) => opts?.include_inactive || isActiveUser(x))),
    invite: async (input) => {
      const actor = me();
      const target = { role: input.role, organization_id: input.organization_id, business_id: input.business_id, is_admin: input.is_admin };
      const p = canInvite(actor, target, account);
      if (!p.ok) throw new Error(p.reason === "forbidden" ? "forbidden" : `forbidden_${p.reason}`);
      checkPlacement(input);
      return delay(createInvited(input));
    },
    simulateAcceptance: async (userId) => {
      const target = findUser(userId);
      const p = canManage(me(), target, account);
      if (!p.ok) throw new Error("forbidden");
      if (target.status !== "invited") throw new Error("not_invited");
      target.status = "active";
      target.activated_at = nowIso();
      logAccount(target.id, "accepted", null, null);
      const m = memberOf(target.id);
      if (m) m.state = "active";
      return delay({ ...target });
    },
    deactivate: async (userId, reason) => {
      if (!reason.trim()) throw new Error("reason_required");
      const target = findUser(userId);
      const p = canManage(me(), target, account);
      if (!p.ok) throw new Error(p.reason === "self" ? "cannot_deactivate_self" : "forbidden");
      if (ownsBusiness(target, db.businesses)) throw new Error("owner_in_charge");
      if (target.status === "inactive") throw new Error("already_inactive");
      target.status = "inactive";
      target.deactivated_at = nowIso();
      target.deactivation_reason = reason.trim();
      logAccount(target.id, "deactivated", reason.trim());
      const m = memberOf(target.id);
      if (m) m.state = "inactive";
      return delay({ ...target });
    },
    reactivate: async (userId) => {
      const target = findUser(userId);
      const p = canManage(me(), target, account);
      if (!p.ok) throw new Error("forbidden");
      if (target.status !== "inactive") throw new Error("not_inactive");
      target.status = "active";
      target.deactivated_at = null;
      target.deactivation_reason = null;
      logAccount(target.id, "reactivated");
      const m = memberOf(target.id);
      if (m) m.state = "active";
      return delay({ ...target });
    },
    setAdmin: async (userId, isAdmin) => {
      if (me().role !== "sm_global") throw new Error("forbidden");
      const target = findUser(userId);
      if (!!target.is_admin !== isAdmin) {
        target.is_admin = isAdmin;
        logAccount(target.id, isAdmin ? "admin_granted" : "admin_revoked");
      }
      return delay({ ...target });
    },
    listAccountEvents: async (userId) => {
      const ids = new Set(visibleUsers().map((u) => u.id));
      if (userId && !ids.has(userId)) throw new Error("not_found");
      // Events are appended in order; newest first without relying on timestamps (two can share a millisecond).
      return delay(db.accountEvents.filter((e) => ids.has(e.user_id) && (!userId || e.user_id === userId)).reverse());
    },
  };

  // ---------- Business team (owner) ----------
  const ownOwnerBusiness = (): Business => {
    const u = me();
    const b = u.role === "business_owner" ? db.businesses.find((x) => x.id === u.business_id) : undefined;
    if (!b || b.owner_user_id !== u.id) throw new Error("owner_only");
    return b;
  };
  const businessProfile: Pick<BusinessProfileRepository, "inviteMember" | "makeOwner"> = {
    inviteMember: async (input) => {
      const b = ownOwnerBusiness();
      if (!input.name.trim() || !input.role.trim()) throw new Error("name_required");
      if (!validEmail(input.email)) throw new Error("invalid_email");
      const p = canInvite(me(), { role: "business_owner", organization_id: null, business_id: b.id, is_admin: false }, account);
      if (!p.ok) throw new Error("forbidden");
      const user = createInvited({ full_name: input.name, email: input.email, role: "business_owner", organization_id: null, business_id: b.id, title: input.role, is_admin: false });
      const m: TeamMember = { id: newId(), owner_id: b.id, name: user.full_name, role: input.role.trim(), email: user.email, state: "invited", user_id: user.id };
      db.teamMembers.push(m);
      return delay(m);
    },
    makeOwner: async (memberId) => {
      const b = ownOwnerBusiness();
      const m = db.teamMembers.find((x) => x.id === memberId && x.owner_id === b.id);
      if (!m) throw new Error("not_found");
      const target = m.user_id ? db.users.find((u) => u.id === m.user_id) : undefined;
      if (!target || target.business_id !== b.id) throw new Error("no_account");
      if (target.status === "invited" || target.status === "inactive") throw new Error("not_active");
      if (target.id === b.owner_user_id) throw new Error("already_owner");
      b.owner_user_id = target.id;
      logAccount(target.id, "made_owner");
      return delay({ ...m });
    },
  };

  // ---------- Partner firms ----------
  const officeFor = (input: Pick<CreateFirmInput, "office_id">): Organization => {
    const u = me();
    const id = u.role === "sm_global" ? input.office_id : u.organization_id;
    const office = db.orgs.find((o) => o.id === id && o.kind === "sm");
    if (!office) throw new Error("invalid_office");
    const p = canManageFirms(u, office.id);
    if (!p.ok) throw new Error("forbidden");
    return office;
  };
  const findFirm = (id: Uuid) => {
    const firm = db.orgs.find((o) => o.id === id && o.kind === "partner_firm");
    if (!firm || !firm.parent_id) throw new Error("not_found");
    const p = canManageFirms(me(), firm.parent_id);
    if (!p.ok) throw new Error("forbidden");
    return firm;
  };
  const activeFirmFor = (officeId: Uuid, area: CreateFirmInput["area"]) =>
    db.orgs.find((o) => o.kind === "partner_firm" && o.parent_id === officeId && o.area === area && isActiveFirm(o));
  const buildFirm = (office: Organization, input: CreateFirmInput): Organization => {
    if (!input.name.trim()) throw new Error("name_required");
    if (!input.contact_name.trim()) throw new Error("contact_required");
    if (!validEmail(input.email)) throw new Error("invalid_email");
    if (!input.first_person.full_name.trim()) throw new Error("person_required");
    if (!validEmail(input.first_person.email)) throw new Error("invalid_person_email");
    if (emailTaken(input.first_person.email)) throw new Error("email_taken");
    const firm: Organization = {
      id: newId(), name: input.name.trim(), kind: "partner_firm", area: input.area, specialty: input.specialty?.trim() || null,
      city: input.city?.trim() || office.city, email: input.email.trim(), phone: input.phone?.trim() || null, parent_id: office.id,
      internal: input.internal, firm_status: "active", contact_name: input.contact_name.trim(), replaced_by_id: null, deactivated_at: null, deactivation_reason: null,
    };
    db.orgs.push(firm);
    logFirm(firm.id, "created");
    createInvited({ full_name: input.first_person.full_name, email: input.first_person.email, role: "partner_firm", organization_id: firm.id, business_id: null, title: input.first_person.title, is_admin: true });
    return firm;
  };

  const organizations: Pick<OrganizationsRepository, "createFirm" | "updateFirm" | "replaceFirm" | "deactivateFirm" | "listFirmEvents"> = {
    createFirm: async (input) => {
      const office = officeFor(input);
      if (activeFirmFor(office.id, input.area)) throw new Error("area_taken");
      return delay(buildFirm(office, input));
    },
    updateFirm: async (id, patch) => {
      const firm = findFirm(id);
      if (patch.name !== undefined && !patch.name.trim()) throw new Error("name_required");
      if (patch.email !== undefined && (!patch.email || !validEmail(patch.email))) throw new Error("invalid_email");
      const changed: string[] = [];
      if (patch.name !== undefined && patch.name.trim() !== firm.name) { firm.name = patch.name.trim(); changed.push("name"); }
      const optional = ["specialty", "contact_name", "email", "phone", "city"] as const;
      for (const f of optional) {
        if (patch[f] === undefined) continue;
        const next = patch[f]?.trim() || null;
        if (next !== (firm[f] ?? null)) { firm[f] = next; changed.push(f); }
      }
      if (changed.length) logFirm(firm.id, "edited", null, changed.join(", "));
      return delay({ ...firm });
    },
    replaceFirm: async (id, input, openTasks) => {
      const old = findFirm(id);
      if (!isActiveFirm(old)) throw new Error("already_inactive");
      const office = db.orgs.find((o) => o.id === old.parent_id)!;
      if (input.area !== old.area) throw new Error("area_mismatch");
      const next = buildFirm(office, { ...input, office_id: office.id });
      const person = db.users.find((u) => u.organization_id === next.id)!;
      let moved = 0;
      if (openTasks === "transfer") {
        const officeBiz = new Set(db.businesses.filter((b) => b.office_id === office.id).map((b) => b.id));
        for (const t of db.tasks.filter((x) => x.organization_id === old.id && officeBiz.has(x.business_id) && OPEN(x))) {
          const prev = t.assignee_user_id;
          const change: TaskChange = { field: "assignee", from: ctx.personLabel(prev), to: ctx.personLabel(person.id) };
          t.assignee_user_id = person.id;
          t.organization_id = next.id;
          t.updated_at = nowIso();
          ctx.recordTaskChange(t, "reassigned", change, [prev]);
          moved++;
        }
      }
      old.firm_status = "inactive";
      old.replaced_by_id = next.id;
      old.deactivated_at = nowIso();
      old.deactivation_reason = null;
      logFirm(old.id, "replaced", next.id, openTasks, moved);
      logFirm(next.id, "took_over", old.id, openTasks, moved);
      return delay({ ...next });
    },
    deactivateFirm: async (id, reason) => {
      if (!reason.trim()) throw new Error("reason_required");
      const firm = findFirm(id);
      if (!isActiveFirm(firm)) throw new Error("already_inactive");
      firm.firm_status = "inactive";
      firm.deactivated_at = nowIso();
      firm.deactivation_reason = reason.trim();
      logFirm(firm.id, "deactivated", null, reason.trim());
      return delay({ ...firm });
    },
    listFirmEvents: async (organizationId) => {
      const ids = new Set(firmsInScope().map((o) => o.id));
      if (organizationId && !ids.has(organizationId)) throw new Error("not_found");
      return delay(db.firmEvents.filter((e) => ids.has(e.organization_id) && (!organizationId || e.organization_id === organizationId)).reverse());
    },
  };

  // ---------- Manual leads ----------
  const leads: Pick<LeadsRepository, "createManual" | "sendAssessment"> = {
    createManual: async (input) => {
      const u = me();
      if (u.role !== "sm_team" || !u.organization_id) throw new Error("sm_only");
      if (!input.contact.name.trim() || !input.business.name.trim()) throw new Error("name_required");
      if (!validEmail(input.contact.email)) throw new Error("invalid_email");
      const now = nowIso();
      const lead: Lead = {
        id: newId(), office_id: u.organization_id, stage: "evaluated", discarded_from: null, discard_reason: null,
        stage_entered_at: now, submitted_at: now, last_contact_at: now, consultant_user_id: u.id, business_id: null,
        contact: { ...input.contact, name: input.contact.name.trim(), email: input.contact.email.trim() },
        business: { ...input.business, name: input.business.name.trim() },
        result: null, know_how_example: null, bishop_user_id: null, bishop_accepted_at: null, source: "manual", assessment_sent_at: null,
        summary_sent_at: null, meeting: null,
      };
      db.leads.push(lead);
      ctx.pushLeadEvent({ lead_id: lead.id, kind: "created_manual", from: null, to: "evaluated", body: null });
      if (input.origin_note?.trim()) ctx.pushLeadEvent({ lead_id: lead.id, kind: "note", from: null, to: null, body: input.origin_note.trim() });
      return delay(ctx.withBooking(lead));
    },
    sendAssessment: async (id) => {
      const l = ctx.findLead(id);
      if (l.source !== "manual" || l.result) throw new Error("not_manual");
      l.assessment_sent_at = nowIso();
      l.last_contact_at = nowIso();
      ctx.pushLeadEvent({ lead_id: l.id, kind: "assessment_sent", from: null, to: null, body: null });
      return delay(ctx.withBooking(l));
    },
  };

  // ---------- Brand ----------
  const validatePalette = (p: BrandPalette) => {
    if (!isHex(p.primary_color) || !isHex(p.accent_color)) throw new Error("invalid_color");
  };
  const businessForBrand = (businessId?: Uuid): Business => {
    const u = me();
    if (u.role === "partner_firm" || u.role === "bishop") throw new Error("forbidden");
    const id = u.role === "business_owner" || u.role === "franchisee" ? brandBusinessIdFor(u, db.franchises) : businessId;
    if (!id) throw new Error("business_required");
    const b = db.businesses.find((x) => x.id === id);
    if (!b) throw new Error("not_found");
    if (!canReadBrand(u, b, db.franchises)) throw new Error("forbidden");
    return b;
  };
  const upsertBrand = (b: Business, palette: BrandPalette, extra: Pick<BusinessBrand, "source" | "version" | "manual_file_name">): BusinessBrand => {
    const brand: BusinessBrand = {
      business_id: b.id, primary_color: palette.primary_color.toLowerCase(), accent_color: palette.accent_color.toLowerCase(),
      font_family: palette.font_family, logo_file_name: palette.logo_file_name, ...extra, applied_at: nowIso(), applied_by_user_id: me().id,
    };
    const i = db.brands.findIndex((x) => x.business_id === b.id);
    if (i >= 0) db.brands[i] = brand;
    else db.brands.push(brand);
    return brand;
  };
  const logBrand = (business_id: Uuid, kind: BrandEvent["kind"], palette: BrandPalette | null) =>
    db.brandEvents.push({ id: newId(), business_id, kind, actor_user_id: me().id, created_at: nowIso(), palette });

  const brand: BrandRepository = {
    get: async (businessId) => {
      const b = businessForBrand(businessId);
      return delay(db.brands.find((x) => x.business_id === b.id) ?? null);
    },
    getMine: async () => delay(brandFor(me(), db.brands, db.franchises)),
    set: async (businessId, palette) => {
      const u = me();
      const b = db.businesses.find((x) => x.id === businessId);
      if (!b || !canSetBrand(u, b)) throw new Error("forbidden");
      validatePalette(palette);
      const applied = upsertBrand(b, palette, { source: "manual_sm", version: null, manual_file_name: null });
      logBrand(b.id, "set_by_sm", palette);
      return delay(applied);
    },
    reset: async (businessId) => {
      const u = me();
      const b = db.businesses.find((x) => x.id === businessId);
      if (!b || !canResetBrand(u, b)) throw new Error("forbidden");
      const i = db.brands.findIndex((x) => x.business_id === b.id);
      if (i >= 0) {
        db.brands.splice(i, 1);
        logBrand(b.id, "reset", null);
      }
      return delay(undefined);
    },
    listEvents: async (businessId) => {
      const b = businessForBrand(businessId);
      return delay(db.brandEvents.filter((e) => e.business_id === b.id).reverse());
    },
  };

  /** Owner approved B5-13 with a brand attached: the business takes it and the owner hears "Tu portal ya tiene tu marca". */
  const applyBrandFromVersion = (task: Task, version: TaskVersion | undefined) => {
    if (task.code !== BRAND_TASK_CODE || !version?.brand) return;
    const b = db.businesses.find((x) => x.id === task.business_id);
    if (!b) return;
    const { manual_file_name, ...palette } = version.brand;
    upsertBrand(b, palette, { source: "b5_13", version: version.version, manual_file_name });
    logBrand(b.id, "applied_from_b5_13", palette);
    ctx.notify(b.owner_user_id, "brand_applied", task.id);
  };

  return { users, visibleUsers, businessProfile, organizations, leads, brand, applyBrandFromVersion };
}
