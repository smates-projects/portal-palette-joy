import { TODAY } from "@/config/app";
import { nowIso } from "@/config/app";
import type { ApiClient } from "../repositories";
import { canTransition, withComputed } from "../computed";
import { dueNotifications, taskRef } from "../notifications";
import { computeFranchisability } from "../franchisability";
import { NOTIFICATION_KINDS, type AppNotification, type NotificationPreference } from "../types";
import type { Meeting, Organization, OwnerRequest, Task, TaskChange, TaskComment, TaskEvent, TaskVersion, User } from "../types";
import * as seed from "./seed";
import * as seedLeads from "./seed-leads";
import * as seedNetwork from "./seed-network";
import { createNetworkRepositories, type NetworkDb } from "./network";
import { createIntake, type IntakeRecord } from "./intake";
import { createOpportunities, type OpportunityView } from "./opportunities";
import { createFunds, type FundRecord, type StoredDistLine } from "./funds";
import { seedFunds } from "./seed-funds";
import { readyToStart, validDay1, programDayOn } from "@/lib/leads/funds";
import { tripartiteState } from "@/lib/leads/opportunity";
import { LEAD_NOTIFICATION_KINDS, type FundPayment, type NotificationKind } from "../types";
import catalogJson from "@/data/catalogo_metodo180.json";
import { DEFAULT_PLATFORM_RULES } from "../franchisability";
import { AREA_BY_KEY, generateProgramTasks, type CatalogEntry } from "../program";
import { resolveLeadMove } from "@/lib/leads/pipeline";
import { DEFAULT_ASSESSMENT_AREA_MAP } from "@/lib/leads/prevalidation";
import { createEntry } from "./entry";
import type { AreaCode, Business, BusinessEvent, CatalogAdminItem, Lead, LeadEvent, LeadWithComputed } from "../types";

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;

/** In-memory backend; filters by current user to simulate API authorization. */
export function createMockApi(): ApiClient {
  const db = {
    tasks: structuredClone([...seed.tasks, ...seedNetwork.tasks]) as Task[],
    versions: structuredClone([...seed.versions, ...seedNetwork.versions]) as TaskVersion[],
    comments: structuredClone(seed.comments) as TaskComment[],
    events: structuredClone([...seed.events, ...seedNetwork.events]) as TaskEvent[],
    ownerRequests: structuredClone(seed.ownerRequests) as OwnerRequest[],
    meetings: structuredClone(seed.meetings) as Meeting[],
    users: structuredClone([...seed.users, ...seedNetwork.users]) as User[],
    orgs: structuredClone([...seed.organizations, ...seedNetwork.organizations]) as Organization[],
    businesses: structuredClone([...seed.businesses, ...seedNetwork.businesses]) as Business[],
    leads: structuredClone([...seedLeads.leads, ...seedNetwork.leads]) as Lead[],
    leadEvents: structuredClone([...seedLeads.leadEvents, ...seedNetwork.leadEvents]) as LeadEvent[],
    businessEvents: [] as BusinessEvent[],
    intakes: [] as IntakeRecord[],
    // Network data (SM Global, franchises, manual, owner screens, Bishop). Read and written by ./network.
    rules: structuredClone({ ...DEFAULT_PLATFORM_RULES, assessment_area_map: DEFAULT_ASSESSMENT_AREA_MAP }),
    rulesHistory: [] as NetworkDb["rulesHistory"],
    catalog: (catalogJson as (CatalogEntry & { owner: string; support: string })[]).map(
      (e): CatalogAdminItem => ({
        code: e.code, area: e.area, area_code: AREA_BY_KEY[e.area] ?? "B1", name: e.name, owner: e.owner, support: e.support, applies: e.applies,
        priority: e.priority, acceptance: e.acceptance, start_day: e.start_day ?? null, due_day: e.due_day ?? null, archived: false, updated_at: "2026-01-15T12:00:00Z",
      }),
    ),
    catalogHistory: [] as NetworkDb["catalogHistory"],
    franchises: structuredClone(seedNetwork.franchises),
    franchiseReports: structuredClone(seedNetwork.franchiseReports),
    checklist: structuredClone(seedNetwork.checklist),
    tickets: structuredClone(seedNetwork.tickets),
    franchiseTasks: structuredClone(seedNetwork.franchiseTasks),
    manualSections: structuredClone(seedNetwork.manualSections),
    manualVersions: structuredClone(seedNetwork.manualVersions),
    manualEvents: structuredClone(seedNetwork.manualEvents),
    documents: structuredClone(seedNetwork.documents),
    contracts: structuredClone(seedNetwork.contracts),
    financials: structuredClone(seedNetwork.financials),
    profiles: structuredClone(seedNetwork.profiles),
    teamMembers: structuredClone(seedNetwork.teamMembers),
    investments: structuredClone([seedNetwork.bishopInvestment]),
    recovery: { [seedNetwork.bishopInvestment.id]: structuredClone(seedNetwork.recovery) },
    agreements: structuredClone(seedNetwork.agreements),
    frameworkContracts: structuredClone(seedNetwork.frameworkContracts),
    oppViews: [] as OpportunityView[],
    // Bishop funds and their distribution to the firms (./funds). Money: SM and that Bishop only.
    fundRecords: [] as FundRecord[],
    fundPayments: [] as FundPayment[],
    distLines: [] as StoredDistLine[],
  };
  const intake = createIntake(db, newId);
  intake.seed();
  const intakeOf = (l: Lead) => {
    const r = intake.record(l.id);
    if (!r) throw new Error("no_intake");
    return r;
  };
  // Approval date comes from the latest "approved" event.
  for (const t of db.tasks) {
    if (t.status !== "accepted") continue;
    const ev = db.events.filter((e) => e.task_id === t.id && e.kind === "approved").map((e) => e.created_at).sort().at(-1);
    t.accepted_at = ev ?? t.updated_at;
  }
  const notifs = structuredClone(seed.notifications);
  const dueRead = new Set<string>(); // "userId|notificationId"
  const prefs = new Map<string, NotificationPreference[]>();
  /** Lead notifications (bishop_accepted, funds_reported) exist only for the SM team. */
  const kindsFor = (userId: string) => {
    const role = db.users.find((u) => u.id === userId)?.role;
    return NOTIFICATION_KINDS.filter((k) => role === "sm_team" || !LEAD_NOTIFICATION_KINDS.includes(k));
  };
  const prefsOf = (userId: string) => {
    if (!prefs.has(userId)) prefs.set(userId, kindsFor(userId).map((kind) => ({ kind, in_app: true, email: false })));
    return prefs.get(userId)!;
  };
  const notify = (user_id: string, kind: AppNotification["kind"], task_id: string, change: TaskChange | null = null) =>
    notifs.push({ id: newId(), user_id, kind, task_id, actor_user_id: currentUserId, created_at: nowIso(), read: false, change });
  const leadNotifs: {
    id: string; user_id: string; kind: NotificationKind; lead_id: string; actor_user_id: string | null; created_at: string; read: boolean;
    /** Automatic entry: who did it (the owner, not a user), the lead's place and the meeting time. */
    actor_name?: string | undefined; place?: string | undefined; meeting_at?: string | undefined;
  }[] = [];
  /** Every SM person of the lead's office hears about it (the review and the funds are team work). */
  const notifyLead = (l: Lead, kind: NotificationKind) => {
    for (const u of db.users.filter((x) => x.role === "sm_team" && x.organization_id === l.office_id && x.id !== currentUserId))
      leadNotifs.push({ id: newId(), user_id: u.id, kind, lead_id: l.id, actor_user_id: currentUserId, created_at: nowIso(), read: false });
  };
  /** Automatic entry: only the lead's consultant hears about it, even when the demo runs as him. */
  const notifyConsultant = (l: Lead, kind: NotificationKind, extra: { place?: string; meeting_at?: string; actor_name?: string }) =>
    leadNotifs.push({ id: newId(), user_id: l.consultant_user_id, kind, lead_id: l.id, actor_user_id: null, created_at: nowIso(), read: false, ...extra });
  let currentUserId = seed.U_LUCIA;

  const me = (): User => db.users.find((u) => u.id === currentUserId)!;

  const visibleTasks = (): Task[] => {
    const u = me();
    // SM Global reads the whole network; a Bishop and a franchisee have no program tasks.
    if (u.role === "sm_global") return db.tasks;
    if (u.role === "bishop" || u.role === "franchisee") return [];
    // SM team: every program of its own office, never other offices.
    if (u.role === "sm_team") {
      const mine = new Set(db.businesses.filter((b) => b.office_id === u.organization_id).map((b) => b.id));
      return db.tasks.filter((t) => mine.has(t.business_id));
    }
    if (u.role === "business_owner") return db.tasks.filter((t) => t.business_id === u.business_id);
    return db.tasks.filter((t) => t.organization_id === u.organization_id);
  };
  const findTask = (id: string) => {
    const t = visibleTasks().find((x) => x.id === id);
    if (!t) throw new Error("not_found");
    return t;
  };
  const transition = (t: Task, to: Task["status"]) => {
    if (!canTransition(me().role, t.status, to)) throw new Error("invalid_transition");
    if (to !== "pending" && withComputed(t, db.tasks).is_blocked) throw new Error("blocked");
    t.status = to;
    t.accepted_at = to === "accepted" ? nowIso() : null;
    t.updated_at = nowIso();
  };
  const pushEvent = (task_id: string, kind: TaskEvent["kind"], version: number | null = null, change: TaskChange | null = null) =>
    db.events.push({ id: newId(), task_id, kind, actor_user_id: currentUserId, version, comment_id: null, created_at: nowIso(), change });
  const lastSubmitted = (taskId: string) =>
    db.versions.filter((v) => v.task_id === taskId).map((v) => v.submitted_at).sort().at(-1) ?? null;
  const computed = (t: Task) => ({ ...withComputed(t, db.tasks), last_submitted_at: lastSubmitted(t.id) });
  const personLabel = (userId: string) => {
    const u = db.users.find((x) => x.id === userId);
    const o = db.orgs.find((x) => x.id === u?.organization_id);
    return u ? (o ? `${u.full_name} (${o.name})` : u.full_name) : "";
  };
  const smOnly = () => {
    if (me().role !== "sm_team") throw new Error("sm_only");
  };
  /** Log the change on the task and tell the firm (old and new assignee on a reassignment). */
  const recordChange = (t: Task, kind: TaskEvent["kind"], change: TaskChange, alsoNotify: string[] = []) => {
    pushEvent(t.id, kind, null, change);
    for (const uid of new Set([t.assignee_user_id, ...alsoNotify])) if (uid !== currentUserId) notify(uid, "task_updated", t.id, change);
  };

  // ---------- Leads ----------
  /** Leads the current user may change: SM team, own office only. */
  const visibleLeads = () => {
    const u = me();
    if (u.role !== "sm_team") throw new Error("sm_only");
    return db.leads.filter((l) => l.office_id === u.organization_id);
  };
  /** Leads the current user may read: SM team its own office, SM Global every office (read only). */
  const readableLeads = () => {
    const u = me();
    if (u.role === "sm_global") return db.leads;
    return visibleLeads();
  };
  /** The lead a write acts on. SM Global never gets here: writes are SM team only. */
  const findLead = (id: string) => {
    const l = visibleLeads().find((x) => x.id === id);
    if (!l) throw new Error("not_found");
    return l;
  };
  const withBooking = (l: Lead): LeadWithComputed => {
    const consultant = db.users.find((u) => u.id === l.consultant_user_id);
    const office = db.orgs.find((o) => o.id === l.office_id);
    return {
      ...l, booking_url: consultant?.booking_url || office?.default_booking_url || "", intake: intake.summaryFor(l),
      tripartite: tripartiteState(opps.tripartiteOf(l)), funds: fundsMod.leadFunds(l),
    };
  };
  const pushLeadEvent = (e: Omit<LeadEvent, "id" | "actor_user_id" | "created_at">) => {
    const full: LeadEvent = { id: newId(), actor_user_id: currentUserId, created_at: nowIso(), ...e };
    db.leadEvents.push(full);
    return full;
  };
  const setStage = (l: Lead, to: Lead["stage"]) => {
    l.stage = to;
    l.stage_entered_at = nowIso();
    l.last_contact_at = nowIso();
  };
  const opps = createOpportunities({
    db, intake, me, newId, delay, findLead, readableLeads, withBooking: (l) => withBooking(l), pushLeadEvent, notifyLead,
    agreedAmount: (l) => fundsMod.recordOf(l)?.total ?? null,
  });
  opps.seed({ jefferson: seedNetwork.U_JEFFERSON, laura: seedNetwork.U_LAURA });
  const fundsMod = createFunds({ db, me, newId, delay, tripartiteOf: opps.tripartiteOf, pushLeadEvent, notifyLead });
  seedFunds({ db, funds: fundsMod, seedSignedTripartite: opps.seedSignedTripartite });
  const entry = createEntry({ db, me, newId, delay, findLead, visibleLeads, withBooking: (l) => withBooking(l), findTask, computed, notifyConsultant });
  entry.seed(seed.ORG_SM);

  /**
   * accepted → in_program: business from onboarding to in_program with day 1 = day1, and its tasks from the live
   * catalog (SM Global edits it; changes reach new programs only, never tasks already generated).
   */
  const launchProgram = (l: Lead, day1: string, eventKind: "program_started" | "contract_signed") => {
    let b = l.business_id ? db.businesses.find((x) => x.id === l.business_id) : undefined;
    if (!b) {
      // Leads accepted before the entry flow existed have no business yet.
      const ownerId = newId();
      b = { id: newId(), name: l.business.name, industry: l.business.activity, city: l.contact.city, state: l.contact.state, owner_user_id: ownerId, status: "onboarding", program_start_date: day1, program_day: 0, office_id: l.office_id, consultant_id: l.consultant_user_id };
      db.users.push({ id: ownerId, full_name: l.contact.name, email: l.contact.email, role: "business_owner", organization_id: null, business_id: b.id, title: null, google_calendar_email: null, booking_url: null });
      db.businesses.push(b);
    }
    Object.assign(b, { status: "in_program", program_start_date: day1, program_day: programDayOn(day1) });
    const created = generateProgramTasks(db.catalog.filter((c) => !c.archived), {
      business_id: b.id, industry: l.business.industry, start_date: day1, supervisor_user_id: l.consultant_user_id,
      firmFor: firmFor(l.office_id, l.consultant_user_id), newId, now: nowIso(),
    });
    db.tasks.push(...created);
    setStage(l, "in_program");
    l.business_id = b.id;
    // The business keeps a copy of the assessment, and the tasks of its strong areas start as "A validar".
    entry.takeSnapshot(l, b.id, nowIso());
    entry.markBusiness(l, b.id);
    pushLeadEvent({ lead_id: l.id, kind: eventKind, from: "accepted", to: "in_program", body: null, signed_on: day1 });
    return { lead: l, business_id: b.id, task_count: created.length };
  };

  /** Assignee firm per area: the office's own firm for that area; with none (SM Miami B1), the office's own team (the consultant). */
  const firmFor = (officeId: string, consultantId: string) => (area: AreaCode) => {
    const firm = db.orgs.find((o) => o.kind === "partner_firm" && o.area === area && o.parent_id === officeId);
    const person = firm && db.users.find((u) => u.organization_id === firm.id);
    return firm && person ? { organization_id: firm.id, assignee_user_id: person.id } : { organization_id: officeId, assignee_user_id: consultantId };
  };

  /** Entry documents and DocuSeal signing on top of the network documents repository. */
  const withIntakeDocuments = <T extends { documents: Pick<ApiClient["documents"], "listDocuments" | "listContracts" | "uploadDocument"> }>(net: T): Omit<T, "documents"> & { documents: ApiClient["documents"] } => {
    const contractInScope = (contractId: string) => {
      const u = me();
      const fw = db.frameworkContracts.find((x) => x.id === contractId);
      if (fw) {
        if (u.role === "bishop" && fw.signers.some((s) => s.party === "bishop" && s.user_id === u.id)) return { c: fw, party: "bishop" as const };
        throw new Error("not_found");
      }
      const c = db.contracts.find((x) => x.id === contractId && x.area === "intake");
      const b = c && db.businesses.find((x) => x.id === c.business_id);
      if (!c || !b) throw new Error("not_found");
      // Tripartite: the Bishop signs from his portal.
      if (u.role === "bishop" && c.signers.some((s) => s.party === "bishop" && s.user_id === u.id)) return { c, party: "bishop" as const };
      if (u.role === "business_owner" && u.business_id === b.id) return { c, party: "owner" as const };
      if ((u.role === "sm_team" && u.organization_id === b.office_id) || u.role === "sm_global") return { c, party: "sm" as const };
      throw new Error("forbidden");
    };
    return {
      ...net,
      documents: {
        ...net.documents,
        uploadDocument: async (documentId, fileName) => {
          const u = me();
          const d = db.documents.find((x) => x.id === documentId);
          if (d?.area !== "intake") return net.documents.uploadDocument(documentId, fileName);
          if (u.role !== "business_owner" || u.business_id !== d.business_id) throw new Error("not_found");
          if (!fileName.trim()) throw new Error("file_required");
          return delay(intake.upload(d.business_id, d, fileName.trim()));
        },
        getIntake: async (businessId) => {
          const u = me();
          const id = u.role === "business_owner" ? u.business_id : businessId;
          const b = id ? db.businesses.find((x) => x.id === id) : undefined;
          if (!b) return delay(null);
          const allowed = u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === b.office_id) || (u.role === "business_owner" && u.business_id === b.id);
          if (!allowed) throw new Error("forbidden");
          return delay(intake.summaryForBusiness(b.id));
        },
        openContract: async (contractId) => {
          const { c, party } = contractInScope(contractId);
          const s = c.signers.find((x) => x.party === party);
          if (s && s.status === "sent") intake.setSignerStatus(c, party, "opened");
          return delay(c);
        },
        signContract: async (contractId) => {
          const { c, party } = contractInScope(contractId);
          intake.setSignerStatus(c, party, "signed");
          // Tripartite signed by the three: the Bishop funds open with today's program amount.
          if (c.kind === "tripartite" && c.state === "signed") {
            const l = db.leads.find((x) => x.business_id === c.business_id);
            if (l) fundsMod.recordOf(l);
          }
          return delay(c);
        },
        declineContract: async (contractId, reason) => {
          if (!reason.trim()) throw new Error("reason_required");
          const { c, party } = contractInScope(contractId);
          return delay(intake.setSignerStatus(c, party, "declined", reason));
        },
      },
    };
  };

  const net = createNetworkRepositories({ db, me, newId, delay });
  /** Rules are readable by everyone, but the program amount is money: only SM and Bishops get it. */
  const seesMoney = () => ["sm_team", "sm_global", "bishop"].includes(me().role);
  const rules: ApiClient["rules"] = {
    ...net.rules,
    get: async () => {
      const r = await net.rules.get();
      if (seesMoney()) return r;
      const { program_amount: _hidden, ...rest } = r;
      return rest;
    },
  };
  return {
    funds: fundsMod.funds,
    distribution: fundsMod.distribution,
    routing: entry.routing,
    businessFile: entry.businessFile,
    notifications: {
      list: () => {
        const u = me();
        const visible = visibleTasks();
        const tasksById = new Map(db.tasks.map((t) => [t.id, t]));
        const name = (id: string | null) => (id ? db.users.find((x) => x.id === id)?.full_name ?? null : null);
        const stored: AppNotification[] = notifs
          .filter((n) => n.user_id === u.id && tasksById.has(n.task_id))
          .map((n) => ({
            id: n.id, user_id: n.user_id, kind: n.kind, ...taskRef(tasksById.get(n.task_id)!, db.businesses),
            actor_user_id: n.actor_user_id, actor_name: name(n.actor_user_id), created_at: n.created_at, read_at: n.read ? n.created_at : null,
            change: n.change ?? null,
          }));
        // Due-date reminders only for tasks the user works on (firm assignee).
        // Owners get no due reminders: their part is approving, answering and confirming.
        const mine = u.role === "partner_firm" ? visible.filter((t) => t.organization_id === u.organization_id) : [];
        const due = dueNotifications(u.id, mine.map((t) => withComputed(t, db.tasks)), db.businesses).map((n) => ({
          ...n, read_at: dueRead.has(`${u.id}|${n.id}`) ? n.created_at : null,
        }));
        // About a lead of the Embudo: only while the user is SM team of that office.
        const aboutLeads: AppNotification[] = u.role !== "sm_team" ? [] : leadNotifs
          .filter((n) => n.user_id === u.id)
          .flatMap((n) => {
            const l = db.leads.find((x) => x.id === n.lead_id && x.office_id === u.organization_id);
            if (!l) return [];
            return [{
              id: n.id, user_id: n.user_id, kind: n.kind, task_id: "", task_code: "", task_name: "", business_id: l.business_id ?? "", business_name: l.business.name,
              actor_user_id: n.actor_user_id, actor_name: n.actor_name ?? name(n.actor_user_id), created_at: n.created_at, read_at: n.read ? n.created_at : null, change: null, lead_id: l.id,
              lead_place: n.place ?? null, meeting_at: n.meeting_at ?? null,
            }];
          });
        const enabled = new Set(prefsOf(u.id).filter((p) => p.in_app).map((p) => p.kind));
        return delay([...stored, ...due, ...aboutLeads].filter((n) => enabled.has(n.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      markRead: async (id) => {
        const n = notifs.find((x) => x.id === id && x.user_id === currentUserId) ?? leadNotifs.find((x) => x.id === id && x.user_id === currentUserId);
        if (n) n.read = true;
        else dueRead.add(`${currentUserId}|${id}`);
        return delay(undefined);
      },
      markAllRead: async () => {
        notifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        leadNotifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        const due = me().role !== "partner_firm" ? [] : dueNotifications(currentUserId, visibleTasks().map((t) => withComputed(t, db.tasks)), db.businesses);
        due.forEach((n) => dueRead.add(`${currentUserId}|${n.id}`));
        return delay(undefined);
      },
      getPreferences: () => delay(prefsOf(currentUserId)),
      setPreference: async (kind, channel, enabled) => {
        const p = prefsOf(currentUserId).find((x) => x.kind === kind)!;
        p[channel] = enabled;
        return delay(prefsOf(currentUserId));
      },
    },
    session: {
      getCurrentUser: () => delay(me()),
      getViewAsOptions: () =>
        delay([
          ...[seed.U_LUCIA, seed.U_TOMAS].map((id) => {
            const user = db.users.find((u) => u.id === id)!;
            return { user, organization: db.orgs.find((o) => o.id === user.organization_id) ?? null, business: null, enabled: true };
          }),
          { user: db.users.find((u) => u.id === seed.U_CARLA)!, organization: null, business: db.businesses.find((b) => b.id === seed.BIZ_VOSSLER) ?? null, enabled: true },
          { user: db.users.find((u) => u.id === seed.U_NICOLAS)!, organization: db.orgs.find((o) => o.id === seed.ORG_SM) ?? null, business: null, enabled: true },
          { user: db.users.find((u) => u.id === seed.U_ANDREA)!, organization: db.orgs.find((o) => o.id === seed.ORG_SM) ?? null, business: null, enabled: true },
          // A business owner still entering (Sazón Criollo, documents in review).
          ...db.businesses.filter((b) => b.status === "onboarding" && b.name === "Sazón Criollo").map((b) => ({ user: db.users.find((u) => u.id === b.owner_user_id)!, organization: null, business: b, enabled: true })),
          // New roles: SM Global, the franchisor (a business owner whose business is a franchisor), Business Bishop and a franchisee.
          { user: db.users.find((u) => u.id === seed.U_MARYLIN)!, organization: db.orgs.find((o) => o.id === seed.ORG_GLOBAL) ?? null, business: null, enabled: true },
          { user: db.users.find((u) => u.id === seed.U_RODRIGO_BIMBO)!, organization: null, business: db.businesses.find((b) => b.id === seed.BIZ_BIMBO) ?? null, enabled: true },
          ...[seedNetwork.U_JEFFERSON, seedNetwork.U_LAURA, seedNetwork.U_DIEGO].map((id) => ({ user: db.users.find((u) => u.id === id)!, organization: null, business: null, enabled: true })),
          { user: db.users.find((u) => u.id === seedNetwork.U_LUISA)!, organization: db.orgs.find((o) => o.id === seedNetwork.FRANCHISE_ORLANDO_SUR) ?? null, business: null, enabled: true },
        ]),
      setViewAs: async (userId) => {
        const target = db.users.find((u) => u.id === userId);
        if (!target) throw new Error("not_available");
        currentUserId = userId;
        return delay(target);
      },
    },
    organizations: {
      list: async () => {
        const u = me();
        if (u.role === "sm_global") return delay(db.orgs);
        // An office sees itself and its own firms, never other offices.
        if (u.role === "sm_team") return delay(db.orgs.filter((o) => o.id === u.organization_id || o.parent_id === u.organization_id));
        // A franchisee sees its own unit; a Bishop sees no organization.
        if (u.role === "franchisee") return delay(db.orgs.filter((o) => o.id === u.organization_id));
        if (u.role === "bishop") return delay([]);
        // Owners see the firms working on their program; firms see only their own.
        if (u.role === "business_owner") {
          const ids = new Set(visibleTasks().map((t) => t.organization_id));
          return delay(db.orgs.filter((o) => ids.has(o.id)));
        }
        return delay(db.orgs.filter((o) => o.id === u.organization_id));
      },
      get: (id) => delay(db.orgs.find((o) => o.id === id) ?? null),
    },
    businesses: {
      list: async () => {
        const u = me();
        // Businesses still entering (onboarding) live in the Embudo, not in program screens.
        const started = db.businesses.filter((b) => b.status !== "onboarding");
        if (u.role === "sm_global") return delay(started);
        // Offices own their businesses, including franchisors whose program already ended (no tasks left to derive them from).
        if (u.role === "sm_team") return delay(started.filter((b) => b.office_id === u.organization_id));
        if (u.role === "business_owner") return delay(db.businesses.filter((b) => b.id === u.business_id));
        const ids = new Set(visibleTasks().map((t) => t.business_id));
        return delay(db.businesses.filter((b) => ids.has(b.id)));
      },
      getFranchisability: async (businessId) => {
        const u = me();
        const b = db.businesses.find((x) => x.id === businessId);
        if (!b || u.role === "bishop" || u.role === "franchisee") throw new Error("not_found");
        if (u.role === "business_owner" && u.business_id !== b.id) throw new Error("not_found");
        if (u.role === "sm_team" && b.office_id !== u.organization_id) throw new Error("not_found");
        // Goal and required tasks come from the platform rules (SM Global edits them).
        return delay(computeFranchisability(b, db.tasks, { goal: db.rules.franchisability_goal, required_task_codes: db.rules.required_task_codes }));
      },
      listEvents: async (businessId) => {
        const u = me();
        const b = db.businesses.find((x) => x.id === businessId);
        if (u.role !== "sm_team" || !b || b.office_id !== u.organization_id) throw new Error("not_found");
        return delay(db.businessEvents.filter((e) => e.business_id === businessId).sort((a, c) => c.created_at.localeCompare(a.created_at)));
      },
      setConsultant: async (businessId, userId) => {
        const u = me();
        const b = db.businesses.find((x) => x.id === businessId);
        if (u.role !== "sm_team" || !b || b.office_id !== u.organization_id) throw new Error("sm_only");
        const target = db.users.find((x) => x.id === userId);
        if (!target || target.role !== "sm_team" || target.organization_id !== b.office_id) throw new Error("invalid_consultant");
        if (b.consultant_id !== userId) {
          db.businessEvents.push({ id: newId(), business_id: b.id, kind: "consultant_changed", actor_user_id: u.id, from_user_id: b.consultant_id, to_user_id: userId, created_at: nowIso() });
          b.consultant_id = userId;
        }
        return delay({ ...b });
      },
    },
    users: {
      // Nobody sees people of another office; a Bishop or franchisee only sees themselves.
      list: async () => {
        const u = me();
        if (u.role === "bishop" || u.role === "franchisee") return delay([u]);
        const officeOfUser = (x: User): string | null => {
          if (x.role === "sm_team") return x.organization_id;
          if (x.role === "partner_firm") return db.orgs.find((o) => o.id === x.organization_id)?.parent_id ?? null;
          if (x.role === "business_owner") return db.businesses.find((b) => b.id === x.business_id)?.office_id ?? null;
          return null;
        };
        if (u.role === "sm_global") return delay(db.users);
        const mine = officeOfUser(u);
        return delay(db.users.filter((x) => x.role === "sm_global" || (x.role !== "bishop" && x.role !== "franchisee" && officeOfUser(x) === mine)));
      },
      setGoogleCalendar: async (email) => {
        const u = me();
        u.google_calendar_email = email;
        return delay({ ...u });
      },
      setBookingUrl: async (url) => {
        const u = me();
        if (u.role !== "sm_team") throw new Error("sm_only");
        const clean = url?.trim() || null;
        if (clean && !/^https?:\/\/\S+\.\S+/.test(clean)) throw new Error("invalid_url");
        u.booking_url = clean;
        return delay({ ...u });
      },
      listCalendarEvents: () => {
        const u = me();
        return delay(u.google_calendar_email ? seed.calendarEvents.filter((e) => e.user_id === u.id) : []);
      },
    },
    ...withIntakeDocuments(net),
    // After the spread: replaces net.rules.
    rules,
    bishop: {
      ...net.bishop,
      ...opps.bishop,
      listAgreements: async () => {
        const base = await net.bishop.listAgreements();
        return [...opps.signableAgreements(me()), ...base];
      },
    },
    leads: {
      ...opps.leads,
      ...entry.leads,
      list: async (opts) => delay(readableLeads().filter((l) => !opts?.office_id || l.office_id === opts.office_id).map(withBooking)),
      get: async (id) => {
        const l = readableLeads().find((x) => x.id === id);
        if (!l) return delay(null);
        return delay({ lead: withBooking(l), events: db.leadEvents.filter((e) => e.lead_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)) });
      },
      move: async (id, to) => {
        const l = findLead(id);
        const m = resolveLeadMove(l.stage, to);
        if (!m.ok || (m.action !== "move" && m.action !== "restore")) throw new Error("invalid_transition");
        const from = l.stage;
        setStage(l, to);
        if (m.action === "restore") { l.discarded_from = null; l.discard_reason = null; }
        pushLeadEvent({ lead_id: id, kind: m.action === "restore" ? "restored" : "stage_changed", from, to, body: null });
        return delay(withBooking(l));
      },
      discard: async (id, reason) => {
        if (!reason.trim()) throw new Error("reason_required");
        const l = findLead(id);
        const m = resolveLeadMove(l.stage, "discarded");
        if (!m.ok || l.stage === "discarded") throw new Error("invalid_transition");
        const from = l.stage as Exclude<Lead["stage"], "discarded">;
        setStage(l, "discarded");
        l.discarded_from = from;
        l.discard_reason = reason.trim();
        pushLeadEvent({ lead_id: id, kind: "discarded", from, to: "discarded", body: reason.trim() });
        return delay(withBooking(l));
      },
      addNote: async (id, body) => {
        if (!body.trim()) throw new Error("note_required");
        const l = findLead(id);
        l.last_contact_at = nowIso();
        return delay(pushLeadEvent({ lead_id: id, kind: "note", from: null, to: null, body: body.trim() }));
      },
      sendNdaMou: async (id) => {
        const l = findLead(id);
        if (l.stage !== "meeting") throw new Error("invalid_transition");
        intake.open(l, { sentOn: TODAY });
        setStage(l, "documents");
        pushLeadEvent({ lead_id: id, kind: "nda_sent", from: "meeting", to: "documents", body: null });
        return delay(withBooking(l));
      },
      getIntake: async (id) => {
        const l = readableLeads().find((x) => x.id === id);
        const summary = l ? intake.summaryFor(l) : null;
        if (!l || !summary || !l.business_id) return delay(null);
        return delay({ summary, contracts: intake.contractsOf(l.business_id), documents: intake.docsOf(l.business_id) });
      },
      acceptDocument: async (id, documentId, fact) => {
        const r = intakeOf(findLead(id));
        const d = intake.acceptDocument(r, documentId, fact);
        pushLeadEvent({ lead_id: id, kind: "doc_accepted", from: null, to: null, body: d.name });
        return delay(d);
      },
      requestDocument: async (id, documentId, comment) => {
        const r = intakeOf(findLead(id));
        const d = intake.requestAgain(r, documentId, comment);
        pushLeadEvent({ lead_id: id, kind: "doc_requested", from: null, to: null, body: `${d.name}: ${comment.trim()}` });
        return delay(d);
      },
      resendContract: async (id, contractId) => {
        const r = intakeOf(findLead(id));
        return delay(intake.resend(r, contractId));
      },
      approveDocuments: async (id) => {
        const u = me();
        // SM Global admins approve too; every other write on a lead is SM team only.
        const l = u.role === "sm_global" ? db.leads.find((x) => x.id === id) : findLead(id);
        if (!l) throw new Error("not_found");
        if (l.stage !== "documents") throw new Error("invalid_transition");
        intake.approve(intakeOf(l), u, l);
        setStage(l, "accepted");
        pushLeadEvent({ lead_id: id, kind: "docs_approved", from: "documents", to: "accepted", body: null });
        return delay(withBooking(l));
      },
      confirmProgramStart: async (id, day1) => {
        const l = findLead(id);
        if (l.stage !== "accepted") throw new Error("invalid_transition");
        const r = fundsMod.recordOf(l);
        const ready = readyToStart({ tripartite: opps.tripartiteOf(l), funds: r ? { total: r.total, payments: fundsMod.paymentsOf(r.business_id) } : null });
        if (!ready.ok) throw new Error(ready.reason === "tripartite" ? "tripartite_unsigned" : "funds_incomplete");
        if (!validDay1(day1, ready.day1)) throw new Error("invalid_date");
        return delay(launchProgram(l, day1, "program_started"));
      },
      // Deprecated: the old "Marcar contrato firmado" step without the tripartite and funds checks (older tests only).
      startProgram: async (id, day1) => {
        const l = findLead(id);
        if (l.stage !== "accepted") throw new Error("invalid_transition");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day1) || day1 > TODAY) throw new Error("invalid_date");
        return delay(launchProgram(l, day1, "contract_signed"));
      },
      rejectDocuments: async (id, reason) => {
        if (!reason.trim()) throw new Error("reason_required");
        const l = findLead(id);
        if (l.stage !== "documents") throw new Error("invalid_transition");
        setStage(l, "discarded");
        l.discarded_from = "documents";
        l.discard_reason = reason.trim();
        pushLeadEvent({ lead_id: id, kind: "discarded", from: "documents", to: "discarded", body: reason.trim() });
        return delay(withBooking(l));
      },
    },
    tasks: {
      resolvePreValidation: entry.resolvePreValidation,
      list: (opts) =>
        delay(visibleTasks().filter((t) => opts?.include_cancelled || t.status !== "cancelled").map(computed)),
      update: async (ids, patch) => {
        smOnly();
        const changed = ids.map(findTask).map((t) => {
          if (t.status === "cancelled") throw new Error("cancelled");
          if (patch.assignee_user_id && patch.assignee_user_id !== t.assignee_user_id) {
            const target = db.users.find((u) => u.id === patch.assignee_user_id);
            const org = patch.organization_id ?? target?.organization_id;
            if (!target || !org || target.organization_id !== org) throw new Error("invalid_assignee");
            const prev = t.assignee_user_id;
            const change: TaskChange = { field: "assignee", from: personLabel(prev), to: personLabel(target.id) };
            t.assignee_user_id = target.id;
            t.organization_id = org;
            recordChange(t, "reassigned", change, [prev]);
          }
          if (patch.due_date && patch.due_date !== t.due_date) {
            const change: TaskChange = { field: "due_date", from: t.due_date, to: patch.due_date };
            t.due_date = patch.due_date;
            if (t.start_date > t.due_date) t.start_date = t.due_date;
            recordChange(t, "due_changed", change);
          }
          if (patch.step && patch.step !== t.step) {
            const change: TaskChange = { field: "step", from: t.step, to: patch.step };
            t.step = patch.step;
            recordChange(t, "step_changed", change);
          }
          t.updated_at = nowIso();
          return t;
        });
        return delay(changed.map(computed));
      },
      cancel: async (ids, reason) => {
        smOnly();
        if (!reason.trim()) throw new Error("reason_required");
        const changed = ids.map(findTask).map((t) => {
          if (t.status === "cancelled") return t;
          const change: TaskChange = { field: "cancelled", from: t.status, to: "cancelled", reason: reason.trim() };
          t.status = "cancelled";
          t.updated_at = nowIso();
          recordChange(t, "cancelled", change);
          return t;
        });
        return delay(changed.map(computed));
      },
      listVersions: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(db.versions.filter((v) => ids.has(v.task_id)));
      },
      listMeetings: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(db.meetings.filter((m) => ids.has(m.task_id) && m.status !== "cancelled"));
      },
      listUpcomingMeetings: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(
          db.meetings
            .filter((m) => ids.has(m.task_id) && m.status !== "cancelled" && m.starts_at.slice(0, 10) >= TODAY)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        );
      },
      get: async (id) => {
        const t = visibleTasks().find((x) => x.id === id);
        if (!t) return delay(null);
        return delay({
          task: computed(t),
          versions: db.versions.filter((v) => v.task_id === id),
          comments: db.comments.filter((c) => c.task_id === id),
          owner_requests: db.ownerRequests.filter((r) => r.task_id === id),
          meetings: db.meetings.filter((m) => m.task_id === id),
          events: db.events.filter((e) => e.task_id === id),
        });
      },
      updateStatus: async (id, status) => {
        const t = findTask(id);
        transition(t, status);
        return delay(withComputed(t, db.tasks));
      },
      start: async (id) => {
        const t = findTask(id);
        transition(t, "in_progress");
        pushEvent(id, "started");
        return delay(withComputed(t, db.tasks));
      },
      submitVersion: async (id, input) => {
        const t = findTask(id);
        if (input.file_names.length === 0) throw new Error("file_required");
        transition(t, "submitted");
        t.current_version += 1;
        const v: TaskVersion = {
          id: newId(), task_id: id, version: t.current_version, submitted_by_user_id: currentUserId, submitted_at: nowIso(),
          note: input.note, files: input.file_names.map((name) => ({ id: newId(), name, size_kb: 480 })),
          status: "submitted", review_comment_id: null,
        };
        db.versions.push(v);
        pushEvent(id, "submitted", v.version);
        const ownerId = db.businesses.find((b) => b.id === t.business_id)?.owner_user_id;
        if (ownerId) notify(ownerId, "submitted_for_approval", id);
        return delay(v);
      },
      addComment: async (id, input) => {
        findTask(id);
        const c: TaskComment = { id: newId(), task_id: id, author_user_id: currentUserId, body: input.body, created_at: nowIso(), kind: "comment", file_id: input.file_id };
        db.comments.push(c);
        return delay(c);
      },
      addOwnerRequest: async (id, input) => {
        findTask(id);
        const r: OwnerRequest = { id: newId(), task_id: id, requested_by_user_id: currentUserId, question: input.question, due_date: input.due_date, answer: null, status: "open", created_at: nowIso(), resolved_at: null };
        db.ownerRequests.push(r);
        return delay(r);
      },
      setOwnerRequestResolved: async (requestId, resolved) => {
        const r = db.ownerRequests.find((x) => x.id === requestId);
        if (!r) throw new Error("not_found");
        findTask(r.task_id);
        r.status = resolved ? "resolved" : "open";
        r.resolved_at = resolved ? nowIso() : null;
        return delay(r);
      },
      proposeMeeting: async (id, input) => {
        findTask(id);
        const m: Meeting = { id: newId(), task_id: id, proposed_by_user_id: currentUserId, topic: input.topic, starts_at: input.starts_at, duration_minutes: input.duration_minutes, status: "proposed" };
        db.meetings.push(m);
        const ownerId = db.businesses.find((b) => b.id === findTask(id).business_id)?.owner_user_id;
        if (ownerId && ownerId !== currentUserId) notify(ownerId, "meeting_proposed", id);
        return delay(m);
      },
      listOpenOwnerRequests: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(db.ownerRequests.filter((r) => ids.has(r.task_id) && r.status === "open"));
      },
      approve: async (id) => {
        const t = findTask(id);
        const wasBlocked = new Set(db.tasks.filter((x) => withComputed(x, db.tasks).is_blocked).map((x) => x.id));
        transition(t, "accepted");
        const v = db.versions.filter((x) => x.task_id === id).sort((a, b) => b.version - a.version)[0];
        if (v) v.status = "accepted";
        pushEvent(id, "approved", v?.version ?? null);
        // Tell the firm of each task this approval unblocks.
        for (const x of db.tasks) if (wasBlocked.has(x.id) && !withComputed(x, db.tasks).is_blocked) notify(x.assignee_user_id, "unblocked", x.id);
        return delay(withComputed(t, db.tasks));
      },
      requestChanges: async (id, note) => {
        if (!note.trim()) throw new Error("note_required");
        const t = findTask(id);
        transition(t, "changes_requested");
        const c: TaskComment = { id: newId(), task_id: id, author_user_id: currentUserId, body: note.trim(), created_at: nowIso(), kind: "changes_requested", file_id: null };
        db.comments.push(c);
        const v = db.versions.filter((x) => x.task_id === id).sort((a, b) => b.version - a.version)[0];
        if (v) { v.status = "changes_requested"; v.review_comment_id = c.id; }
        db.events.push({ id: newId(), task_id: id, kind: "changes_requested", actor_user_id: currentUserId, version: v?.version ?? null, comment_id: c.id, created_at: nowIso() });
        notify(t.assignee_user_id, "changes_requested", id);
        return delay(withComputed(t, db.tasks));
      },
      answerOwnerRequest: async (requestId, input) => {
        if (me().role !== "business_owner") throw new Error("owner_only");
        const r = db.ownerRequests.find((x) => x.id === requestId);
        if (!r) throw new Error("not_found");
        findTask(r.task_id);
        r.status = "resolved";
        r.resolved_at = nowIso();
        r.answer = input.note.trim() ? `${input.note.trim()} (${input.file_name})` : input.file_name;
        return delay(r);
      },
      confirmMeeting: async (meetingId) => {
        if (me().role !== "business_owner") throw new Error("owner_only");
        const m = db.meetings.find((x) => x.id === meetingId);
        if (!m || m.status !== "proposed") throw new Error("not_found");
        findTask(m.task_id);
        m.status = "confirmed";
        notify(m.proposed_by_user_id, "meeting_confirmed", m.task_id);
        return delay(m);
      },
    },
  };
}
