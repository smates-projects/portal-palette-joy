import { todayIso, nowIso } from "@/lib/clock";
import type { ApiClient, BrandProposalUpload, TaskListOptions } from "../repositories";
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
import { createOpportunities, type OpportunityView, type Presentation } from "./opportunities";
import { outcomeBlock } from "@/lib/leads/entry-flow";
import { createFunds, type FundRecord, type StoredDistLine } from "./funds";
import { seedFunds } from "./seed-funds";
import { createAccounts } from "./accounts";
import { isActiveFirm, isActiveUser } from "@/lib/accounts/permissions";
import type { AccountEvent, BrandEvent, BrandProposal, BusinessBrand, FirmEvent } from "../types";
import { readyToStart, validDay1, programDayOn } from "@/lib/leads/funds";
import { tripartiteState } from "@/lib/leads/opportunity";
import { API_ONLY_NOTIFICATION_KINDS, BISHOP_NOTIFICATION_KINDS, LEAD_NOTIFICATION_KINDS, OWNER_NOTIFICATION_KINDS, type FundPayment, type NotificationKind } from "../types";
import catalogJson from "@/data/catalogo_metodo180.json";
import { DEFAULT_PLATFORM_RULES } from "../franchisability";
import { AREA_BY_KEY, generateProgramTasks, type CatalogEntry } from "../program";
import { resolveLeadMove } from "@/lib/leads/pipeline";
import { DEFAULT_ASSESSMENT_AREA_MAP } from "@/lib/leads/prevalidation";
import { createEntry } from "./entry";
import { createSession, type MockSessionControls } from "./session";
import { createCalendar } from "./calendar";
import { createContractRules } from "./contract-rules";
import { seedAdvisors, seedSigningPeople, seedTechosBinding } from "./seed-entry-contracts";
import { smSignBlock } from "@/lib/leads/contract-rules";
import { closeBlock, splitError } from "@/lib/leads/validation";
import { isDocsAdmin } from "@/lib/leads/onboarding";
import { ENTRY_PARTY_NOTIFICATION_KINDS, type Contract, type EntryContractRule, type EntryContractRuleChange } from "../types";

export { DEMO_PASSWORD } from "./session";
import type { AreaCode, Business, BusinessEvent, CatalogAdminItem, Lead, LeadEvent, LeadWithComputed } from "../types";
import { AUTO_DISCARD_MOU_NOT_SIGNED } from "@/lib/leads/entry-flow";
import { withSigningView } from "@/lib/contracts/parties";

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
// Deterministic ids: the seed runs at module scope during SSR, where Cloudflare Workers disallow randomness.
let idCounter = 0;
const newId = () => {
  idCounter += 1;
  return `00000000-0000-4000-8000-${idCounter.toString(16).padStart(12, "0")}`;
};

/** Lowercase without accents, for the "q" search of the task list (as the API's Spanish full text). */
const searchable = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The same filters GET /tasks applies (TaskListOptions). */
function matchesTaskFilters(t: Task, opts: TaskListOptions | undefined): boolean {
  if (!opts?.include_cancelled && t.status === "cancelled") return false;
  if (opts?.business_id && t.business_id !== opts.business_id) return false;
  if (opts?.area?.length && !opts.area.includes(t.area)) return false;
  if (opts?.status?.length && !opts.status.includes(t.status)) return false;
  if (opts?.assignee_user_id && t.assignee_user_id !== opts.assignee_user_id) return false;
  if (opts?.due_from && t.due_date < opts.due_from) return false;
  if (opts?.due_to && t.due_date > opts.due_to) return false;
  const q = opts?.q?.trim();
  if (q && q.length >= 2 && !searchable(`${t.name} ${t.acceptance_criteria}`).includes(searchable(q))) return false;
  return true;
}

/** The mock keeps the names only: the picked Files (for the HTTP adapter) stay out of the stored version. */
const brandProposalOf = ({ manual_file: _manual, logo_file: _logo, ...proposal }: BrandProposalUpload): BrandProposal => proposal;

/** In-memory backend; filters by current user to simulate API authorization. */
/** The mock client plus the controls mixed mode needs on its session (see ../http/mixed-mode.ts). */
export type MockApi = ApiClient & { session: MockSessionControls };

export function createMockApi(): MockApi {
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
    profileChangeRequests: [],
    teamMembers: structuredClone(seedNetwork.teamMembers),
    investments: structuredClone([seedNetwork.bishopInvestment]),
    recovery: { [seedNetwork.bishopInvestment.id]: structuredClone(seedNetwork.recovery) },
    agreements: structuredClone(seedNetwork.agreements),
    frameworkContracts: structuredClone(seedNetwork.frameworkContracts),
    oppViews: [] as OpportunityView[],
    presentations: [] as Presentation[],
    // Bishop funds and their distribution to the firms (./funds). Money: SM and that Bishop only.
    fundRecords: [] as FundRecord[],
    fundPayments: [] as FundPayment[],
    distLines: [] as StoredDistLine[],
    // Accounts, partner firms and the business brand (./accounts). Nothing here is ever deleted.
    accountEvents: [] as AccountEvent[],
    firmEvents: [] as FirmEvent[],
    brands: structuredClone(seed.brands) as BusinessBrand[],
    brandEvents: structuredClone(seed.brandEvents) as BrandEvent[],
    // Entry contracts as rules (./contract-rules): what SM Global configures and its history.
    contractRules: [] as EntryContractRule[],
    contractRulesHistory: [] as EntryContractRuleChange[],
  };
  seedSigningPeople(db.users);
  seedAdvisors(db.leads, db.users);
  // The rules exist before any contract: the NDA and the MOU take their texts from them.
  const crules = createContractRules({ db, me: () => me(), newId, delay, notifyParties: (l, kind, c, extra) => notifyParties(l, kind, c, extra) });
  crules.seed();
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
  let seeding = true;
  const notifs = structuredClone(seed.notifications);
  const dueRead = new Set<string>(); // "userId|notificationId"
  const prefs = new Map<string, NotificationPreference[]>();
  /** Lead notifications (bishop_accepted, funds_reported...) exist only for the SM team; opportunity_presented only for Bishops. */
  const kindsFor = (userId: string) => {
    const role = db.users.find((u) => u.id === userId)?.role;
    return NOTIFICATION_KINDS.filter((k) =>
      !API_ONLY_NOTIFICATION_KINDS.includes(k) &&
      (!ENTRY_PARTY_NOTIFICATION_KINDS.includes(k) || ["sm_team", "sm_global", "business_owner", "bishop"].includes(role ?? "")) &&
      (role === "sm_team" || !LEAD_NOTIFICATION_KINDS.includes(k)) && (role === "bishop" || !BISHOP_NOTIFICATION_KINDS.includes(k)) &&
      (role === "business_owner" || !OWNER_NOTIFICATION_KINDS.includes(k)));
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
    /** meeting_outcome_pending: the meeting to answer. */
    meeting_id?: string | undefined;
  }[] = [];
  /** To the owner of a business in onboarding, about his own entry (mou_ready). */
  const ownerNotifs: { id: string; user_id: string; kind: NotificationKind; business_id: string; contract_id: string | null; created_at: string; read: boolean }[] = [];
  const notifyOwner = (businessId: string, kind: NotificationKind) => {
    const owner = db.users.find((u) => u.role === "business_owner" && u.business_id === businessId);
    const mou = db.contracts.find((c) => c.business_id === businessId && c.kind === "mou");
    if (owner) ownerNotifs.push({ id: newId(), user_id: owner.id, kind, business_id: businessId, contract_id: mou?.id ?? null, created_at: nowIso(), read: false });
  };
  /** To a Bishop: SM presented him a business (never its name: he sees it once he accepts). */
  const bishopNotifs: { id: string; user_id: string; kind: NotificationKind; lead_id: string; actor_user_id: string | null; created_at: string; read: boolean }[] = [];
  const notifyBishop = (l: Lead, bishopUserId: string) =>
    bishopNotifs.push({ id: newId(), user_id: bishopUserId, kind: "opportunity_presented", lead_id: l.id, actor_user_id: currentUserId, created_at: nowIso(), read: false });
  /**
   * The parties of one business entering (binding_ready, validation_closed): its owner, the Bishop who took it, the SM
   * team of the office and anyone else named (Corporate's signer of the binding agreement). Never the one who acted.
   */
  const partyNotifs: { id: string; user_id: string; kind: NotificationKind; lead_id: string; contract_id: string | null; contract_name: string | null; actor_user_id: string | null; created_at: string; read: boolean }[] = [];
  const notifyParties = (l: Lead, kind: NotificationKind, c: Contract | null, extra: string[] = []) => {
    const owner = db.users.find((u) => u.role === "business_owner" && u.business_id === l.business_id);
    const team = db.users.filter((u) => u.role === "sm_team" && u.organization_id === l.office_id).map((u) => u.id);
    // Sample data is created quietly: the bells start as the seed says.
    if (seeding) return;
    const actor = auth.isAuthenticated() ? currentUserId : null;
    for (const userId of new Set([owner?.id, l.bishop_user_id, ...team, ...extra].filter((x): x is string => !!x && x !== actor)))
      partyNotifs.push({ id: newId(), user_id: userId, kind, lead_id: l.id, contract_id: c?.id ?? null, contract_name: c?.name ?? null, actor_user_id: actor, created_at: nowIso(), read: false });
  };
  /** Every SM person of the lead's office hears about it (the review and the funds are team work). */
  const notifyLead = (l: Lead, kind: NotificationKind) => {
    for (const u of db.users.filter((x) => x.role === "sm_team" && x.organization_id === l.office_id && x.id !== currentUserId))
      leadNotifs.push({ id: newId(), user_id: u.id, kind, lead_id: l.id, actor_user_id: currentUserId, created_at: nowIso(), read: false });
  };
  /** Automatic entry: only the lead's consultant hears about it, even when the demo runs as him. */
  const notifyConsultant = (l: Lead, kind: NotificationKind, extra: { place?: string; meeting_at?: string; actor_name?: string; meeting_id?: string }) =>
    leadNotifs.push({ id: newId(), user_id: l.consultant_user_id, kind, lead_id: l.id, actor_user_id: null, created_at: nowIso(), read: false, ...extra });
  // Sample: meetings already asked "¿Se hizo?" without an answer (Rivera) are in the consultant's bell.
  for (const l of db.leads)
    for (const m of [l.meeting, l.expansion_meeting ?? null])
      if (m?.outcome_prompted_at && !m.outcome)
        leadNotifs.push({ id: newId(), user_id: l.consultant_user_id, kind: "meeting_outcome_pending", lead_id: l.id, actor_user_id: null, created_at: m.outcome_prompted_at, read: false, meeting_at: m.starts_at, meeting_id: m.id });
  let currentUserId = seed.U_LUCIA;
  // Login, logout, invitations, magic links and reset (./session). Starts signed in as currentUserId.
  const auth = createSession({ db, newId, delay, getUserId: () => currentUserId, setUserId: (id) => { currentUserId = id; } });

  /** The signed-in person. Without a session every repository answers "unauthenticated" (the API's 401). */
  const me = (): User => {
    if (!auth.isAuthenticated()) throw new Error("unauthenticated");
    return db.users.find((u) => u.id === currentUserId)!;
  };

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
  /** A business_owner account that is not the owner in charge (team member) sees the program but never approves. */
  const ownerInCharge = (t: Task) => {
    const u = me();
    if (u.role === "business_owner" && db.businesses.find((b) => b.id === t.business_id)?.owner_user_id !== u.id) throw new Error("owner_only");
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
    const bookingUrl = consultant?.booking_url?.trim() || null;
    const officeUrl = office?.default_booking_url?.trim() || null;
    return {
      ...l, booking_url: bookingUrl ?? officeUrl, booking_url_source: bookingUrl ? "consultant" : officeUrl ? "office" : null, intake: intake.summaryFor(l),
      tripartite: tripartiteState(opps.tripartiteOf(l)), funds: fundsMod.leadFunds(l),
    };
  };
  /** Lead events with the actor's name: the office cannot list SM Global's people, yet reads "Marilyn lo reactivó". */
  const leadEventsOf = (leadId: string): LeadEvent[] =>
    db.leadEvents
      .filter((e) => e.lead_id === leadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ ...e, actor_name: e.actor_user_id ? db.users.find((u) => u.id === e.actor_user_id)?.full_name ?? null : null }));
  /** "Derivar a oficina": SM Global, or the admin of the office the lead or business is in. */
  const canTransferFrom = (officeId: string) => {
    const u = me();
    return u.role === "sm_global" || (u.role === "sm_team" && !!u.is_admin && u.organization_id === officeId);
  };
  /** Who can follow a lead or business of an office: its SM team, or anyone of SM Global (any office). */
  const canFollow = (user: User, officeId: string) =>
    user.status !== "inactive" && (user.role === "sm_global" || (user.role === "sm_team" && user.organization_id === officeId));
  /** An SM office (or Corporate) a lead or business can be moved to. */
  const targetOffice = (officeId: string) => {
    const office = db.orgs.find((o) => o.id === officeId && (o.kind === "sm" || o.kind === "sm_global"));
    if (!office) throw new Error("invalid_office");
    return office;
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
  /**
   * "Enviar MOU" of a lead moved by hand, Reunión → Documentación: the MOU (four points to confirm) when the NDA
   * signature did not create it yet, and the entry documents, locked until it is signed.
   */
  const sendMouAndMove = (l: Lead) => {
    const r = intake.record(l.id);
    if (!r) throw new Error("invalid_state");
    intake.sendMou(r, l, { sentOn: todayIso() });
    setStage(l, "documents");
    pushLeadEvent({ lead_id: l.id, kind: "mou_sent", from: "meeting", to: "documents", body: null });
  };
  /** "Se hizo", Reunión → Documentación: only the documents list (locked until the owner signs the MOU). */
  const sendDocumentsAndMove = (l: Lead) => {
    const r = intake.record(l.id);
    if (!r) throw new Error("invalid_state");
    intake.sendDocuments(r, todayIso());
    setStage(l, "documents");
    pushLeadEvent({ lead_id: l.id, kind: "stage_changed", from: "meeting", to: "documents", body: null });
  };
  const opps = createOpportunities({
    db, intake, me, newId, delay, findLead, readableLeads, withBooking: (l) => withBooking(l), pushLeadEvent, notifyLead, notifyBishop,
    agreedAmount: (l) => fundsMod.recordOf(l)?.total ?? null,
  });
  opps.seed({ jefferson: seedNetwork.U_JEFFERSON, laura: seedNetwork.U_LAURA });
  const fundsMod = createFunds({ db, me, newId, delay, tripartiteOf: opps.tripartiteOf, pushLeadEvent, notifyLead });
  seedFunds({ db, funds: fundsMod, seedSignedTripartite: opps.seedSignedTripartite });
  const accounts = createAccounts({
    db, me, newId, delay, notify, recordTaskChange: recordChange, personLabel, pushLeadEvent, withBooking: (l) => withBooking(l), findLead,
  });
  // Calendar v2: connections, availability and portal meetings (./calendar), with its own notifications.
  const cal = createCalendar({ db, me, newId, delay, visibleUsers: accounts.visibleUsers, externalEvents: seed.calendarEvents });
  cal.seed();
  /** The booking (or "Enviar NDA"): owner account, business in onboarding and the NDA, Strategic Mates pre-signed. */
  const openNda = (l: Lead, actor: string | null) => {
    intake.open(l, { sentOn: todayIso() });
    db.leadEvents.push({ id: newId(), lead_id: l.id, kind: "nda_sent", actor_user_id: actor, created_at: nowIso(), from: null, to: null, body: null });
  };
  const entry = createEntry({ db, me, newId, delay, findLead, visibleLeads, withBooking: (l) => withBooking(l), findTask, computed, notifyConsultant, openNda: (l) => openNda(l, null) });
  entry.seed(seed.ORG_SM);
  seedTechosBinding(db, crules.sweep);
  seeding = false;

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
      db.users.push({ id: ownerId, full_name: l.contact.name, email: l.contact.email, role: "business_owner", organization_id: null, business_id: b.id, title: null, google_calendar_email: null, booking_url: null, has_password: false, password_setup_required: false });
      db.businesses.push(b);
    }
    Object.assign(b, { status: "in_program", program_start_date: day1, program_day: programDayOn(day1) });
    // The program started: an owner who still enters by email links is asked to create a password.
    const owner = db.users.find((u) => u.id === b!.owner_user_id);
    if (owner && owner.has_password === false) owner.password_setup_required = true;
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

  /**
   * Assignee firm per area: the office's ACTIVE firm for that area and an active person in it; with none ("Sin firma",
   * or SM Miami B1), the office's own team (the consultant) until a firm is assigned.
   */
  const firmFor = (officeId: string, consultantId: string) => (area: AreaCode) => {
    const firm = db.orgs.find((o) => o.kind === "partner_firm" && o.area === area && o.parent_id === officeId && isActiveFirm(o));
    const person = firm && db.users.find((u) => u.organization_id === firm.id && isActiveUser(u));
    return firm && person ? { organization_id: firm.id, assignee_user_id: person.id } : { organization_id: officeId, assignee_user_id: consultantId };
  };

  /** Entry documents and DocuSeal signing on top of the network documents repository. */
  const withIntakeDocuments = <T extends { documents: Pick<ApiClient["documents"], "listDocuments" | "listContracts" | "uploadDocument"> }>(net: T): Omit<T, "documents"> & { documents: ApiClient["documents"] } => {
    const contractInScope = (contractId: string) => {
      const u = me();
      const fw = db.frameworkContracts.find((x) => x.id === contractId);
      if (fw) {
        if (u.role === "bishop" && fw.signers.some((s) => s.party === "bishop" && s.user_id === u.id)) return { c: fw, party: "bishop" as const };
        // SM Global countersigns the framework agreements from Acuerdos.
        if (u.role === "sm_global") return { c: fw, party: "sm" as const };
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
        uploadDocument: async (documentId, file) => {
          const u = me();
          const fileName = file.name;
          const d = db.documents.find((x) => x.id === documentId);
          if (d?.area !== "intake") return net.documents.uploadDocument(documentId, file);
          if (u.role !== "business_owner" || u.business_id !== d.business_id) throw new Error("not_found");
          if (!fileName.trim()) throw new Error("file_required");
          return delay(intake.upload(d.business_id, d, fileName.trim()));
        },
        /** SM Global: every Bishop's framework agreement, with can_sign for Corporate's countersignature. */
        listFrameworkAgreements: async () => {
          const u = me();
          if (u.role !== "sm_global") throw new Error("forbidden");
          return delay(db.frameworkContracts.map((c) => withSigningView(c, u)));
        },
        markNotApplicable: async (documentId, reason) => {
          const u = me();
          const d = db.documents.find((x) => x.id === documentId);
          if (d?.area !== "intake" || u.role !== "business_owner" || u.business_id !== d.business_id) throw new Error("not_found");
          return delay(intake.markNotApplicable(d.business_id, d, reason));
        },
        getIntake: async (businessId) => {
          const u = me();
          const id = u.role === "business_owner" ? u.business_id : businessId;
          const b = id ? db.businesses.find((x) => x.id === id) : undefined;
          if (!b) return delay(null);
          const allowed = u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === b.office_id) || (u.role === "business_owner" && u.business_id === b.id);
          if (!allowed) throw new Error("forbidden");
          crules.sweep();
          return delay(intake.summaryForBusiness(b.id));
        },
        listContracts: async (businessId) => {
          crules.sweep();
          return net.documents.listContracts(businessId);
        },
        openContract: async (contractId) => {
          const { c, party } = contractInScope(contractId);
          const s = c.signers.find((x) => x.party === party);
          // Only the one who can sign it marks it opened (another SM person only reads it).
          if (s && s.status === "sent" && (party !== "sm" || !smSignBlock(s, me()))) intake.setSignerStatus(c, party, "opened");
          return delay(withSigningView(c, me()));
        },
        signContract: async (contractId, signature) => {
          const { c, party } = contractInScope(contractId);
          // Contracts created by a rule: Corporate's CEO signs the binding agreement, the SM Square holder the OA.
          if (party === "sm") {
            const block = smSignBlock(c.signers.find((x) => x.party === "sm"), me());
            if (block) throw new Error(block);
          }
          intake.setSignerStatus(c, party, "signed");
          const signer = c.signers.find((x) => x.party === party);
          if (signer) signer.signature = signature ?? null;
          // The owner signed the NDA: the MOU is ready right away (he can sign it before or during the meeting).
          if (party === "owner" && intake.mouOnNdaSigned(c)) notifyOwner(c.business_id, "mou_ready");
          // Tripartite signed by the three: the Bishop funds open with today's program amount.
          if (c.kind === "tripartite" && c.state === "signed") {
            const l = db.leads.find((x) => x.business_id === c.business_id);
            if (l) fundsMod.recordOf(l);
          }
          // A contract signed by all may be the trigger of the next one (the binding agreement opens the OA).
          if (c.state === "signed") crules.sweep();
          return delay(c);
        },
        declineContract: async (contractId, reason) => {
          if (!reason.trim()) throw new Error("reason_required");
          const { c, party } = contractInScope(contractId);
          return delay(intake.setSignerStatus(c, party, "declined", reason));
        },
        acknowledge: async (contractId, points) => {
          const { c, party } = contractInScope(contractId);
          if (party !== "owner") throw new Error("owner_only");
          return delay(intake.acknowledge(c, points));
        },
      },
    };
  };

  /** The Bishop's framework agreement, created when missing: the Bishop signs from Acuerdos, Corporate's CEO countersigns. */
  const frameworkFor = (bishop: User): Contract => {
    const existing = db.frameworkContracts.find((c) => c.signers.some((s) => s.party === "bishop" && s.user_id === bishop.id));
    if (existing) return existing;
    const on = todayIso();
    const ceo = db.users.find((u) => u.role === "sm_global" && u.is_admin) ?? db.users.find((u) => u.role === "sm_global");
    const created: Contract = {
      id: newId(), business_id: "", area: "intake", kind: "framework",
      name: "Acuerdo marco con Strategic Mates (confidencialidad y no circunvención)",
      state: "sent", sent_at: on, signed_at: null,
      signers: [
        { name: bishop.full_name, role: "bishop", party: "bishop", user_id: bishop.id, status: "sent", signed_at: null, decline_reason: null, history: [{ status: "sent", at: on }], signature: null },
        { name: ceo?.full_name ?? "Strategic Mates", role: "sm", party: "sm", user_id: ceo?.id ?? null, status: "sent", signed_at: null, decline_reason: null, history: [{ status: "sent", at: on }], signature: null, sm_entity: "corporate" },
      ],
    };
    db.frameworkContracts.push(created);
    return created;
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
        entry.promptOutcomes();
        crules.sweep();
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
              lead_place: n.place ?? null, meeting_at: n.meeting_at ?? null, meeting_id: n.meeting_id ?? null,
            }];
          });
        // To a Bishop: the business SM presented to him, by place only (the name comes once he accepts it).
        const presented: AppNotification[] = u.role !== "bishop" ? [] : bishopNotifs
          .filter((n) => n.user_id === u.id)
          .flatMap((n) => {
            const l = db.leads.find((x) => x.id === n.lead_id);
            if (!l) return [];
            return [{
              id: n.id, user_id: n.user_id, kind: n.kind, task_id: "", task_code: "", task_name: "", business_id: "", business_name: "",
              actor_user_id: n.actor_user_id, actor_name: name(n.actor_user_id), created_at: n.created_at, read_at: n.read ? n.created_at : null, change: null,
              lead_place: `${l.contact.city}, ${l.contact.state}`, opportunity_id: l.id,
            }];
          });
        // To the owner, about his own entry (the MOU is ready): no task, the business and the contract.
        const aboutEntry: AppNotification[] = u.role !== "business_owner" ? [] : ownerNotifs
          .filter((n) => n.user_id === u.id)
          .map((n) => ({
            id: n.id, user_id: n.user_id, kind: n.kind, task_id: "", task_code: "", task_name: "", business_id: n.business_id,
            business_name: db.businesses.find((b) => b.id === n.business_id)?.name ?? "", actor_user_id: null, actor_name: null,
            created_at: n.created_at, read_at: n.read ? n.created_at : null, change: null, contract_id: n.contract_id, contract_name: "MOU",
          }));
        // Binding agreement ready, validation closed: SM opens the lead, the owner "Tu ingreso", the Bishop his opportunity.
        const aboutParties: AppNotification[] = partyNotifs
          .filter((n) => n.user_id === u.id)
          .flatMap((n) => {
            const l = db.leads.find((x) => x.id === n.lead_id);
            if (!l) return [];
            const sm = u.role === "sm_team" || u.role === "sm_global";
            return [{
              id: n.id, user_id: n.user_id, kind: n.kind, task_id: "", task_code: "", task_name: "", business_id: l.business_id ?? "",
              // The Bishop sees the name once he took it (he did: he is a party).
              business_name: l.business.name, actor_user_id: n.actor_user_id, actor_name: name(n.actor_user_id), created_at: n.created_at,
              read_at: n.read ? n.created_at : null, change: null, contract_id: n.contract_id, contract_name: n.contract_name,
              ...(sm ? { lead_id: l.id } : {}), ...(u.role === "bishop" ? { opportunity_id: l.id } : {}),
            }];
          });
        const enabled = new Set(prefsOf(u.id).filter((p) => p.in_app).map((p) => p.kind));
        return delay([...stored, ...due, ...aboutLeads, ...presented, ...aboutEntry, ...aboutParties, ...cal.notificationsFor(u.id)].filter((n) => enabled.has(n.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      },
      markRead: async (id) => {
        const n = notifs.find((x) => x.id === id && x.user_id === currentUserId) ?? leadNotifs.find((x) => x.id === id && x.user_id === currentUserId)
          ?? bishopNotifs.find((x) => x.id === id && x.user_id === currentUserId) ?? ownerNotifs.find((x) => x.id === id && x.user_id === currentUserId)
          ?? partyNotifs.find((x) => x.id === id && x.user_id === currentUserId);
        if (n) n.read = true;
        else if (!cal.markRead(currentUserId, id)) dueRead.add(`${currentUserId}|${id}`);
        return delay(undefined);
      },
      markAllRead: async () => {
        notifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        leadNotifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        bishopNotifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        ownerNotifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        partyNotifs.filter((n) => n.user_id === currentUserId).forEach((n) => (n.read = true));
        cal.markAllRead(currentUserId);
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
      ...auth,
      resetUser: () => { currentUserId = seed.U_LUCIA; },
      getCurrentUser: async () => delay(me()),
      getViewAsOptions: () =>
        delay([
          ...[seed.U_LUCIA, seed.U_TOMAS].map((id) => {
            const user = db.users.find((u) => u.id === id)!;
            return { user, organization: db.orgs.find((o) => o.id === user.organization_id) ?? null, business: null, enabled: true };
          }),
          // Estudio Pérez: Lucía is its admin (Mi equipo), Julián is not.
          { user: db.users.find((u) => u.id === seed.U_JULIAN)!, organization: db.orgs.find((o) => o.id === seed.ORG_PEREZ) ?? null, business: null, enabled: true },
          { user: db.users.find((u) => u.id === seed.U_CARLA)!, organization: null, business: db.businesses.find((b) => b.id === seed.BIZ_VOSSLER) ?? null, enabled: true },
          // Vossler team member: sees the Vossler brand but never approves.
          { user: db.users.find((u) => u.id === seed.U_ANA_VOSSLER)!, organization: null, business: db.businesses.find((b) => b.id === seed.BIZ_VOSSLER) ?? null, enabled: true },
          { user: db.users.find((u) => u.id === seed.U_NICOLAS)!, organization: db.orgs.find((o) => o.id === seed.ORG_SM) ?? null, business: null, enabled: true },
          // SM Miami office admin: manages the team and the partner firms.
          { user: db.users.find((u) => u.id === seed.U_ANDREA)!, organization: db.orgs.find((o) => o.id === seed.ORG_SM) ?? null, business: null, enabled: true },
          // Business owners still entering: Castillo Instalaciones (contracts signed, documents in review) and
          // Morales Pisos y Cerámica (MOU waiting for her signature, documents half uploaded).
          ...db.businesses.filter((b) => b.status === "onboarding" && ["Castillo Instalaciones", "Morales Pisos y Cerámica"].includes(b.name)).map((b) => ({ user: db.users.find((u) => u.id === b.owner_user_id)!, organization: null, business: b, enabled: true })),
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
        // An office sees itself and its own firms, never the firms of other offices. The other SM offices (and
        // Corporate) are listed as plain names: "Derivar a oficina" needs them as targets.
        if (u.role === "sm_team")
          return delay(db.orgs.filter((o) => o.id === u.organization_id || o.parent_id === u.organization_id || o.kind === "sm" || o.kind === "sm_global"));
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
      ...accounts.organizations,
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
        // Anyone of SM Global can follow a business of any office.
        if (!target || !canFollow(target, b.office_id)) throw new Error("invalid_consultant");
        if (b.consultant_id !== userId) {
          db.businessEvents.push({ id: newId(), business_id: b.id, kind: "consultant_changed", actor_user_id: u.id, from_user_id: b.consultant_id, to_user_id: userId, created_at: nowIso() });
          b.consultant_id = userId;
        }
        return delay({ ...b });
      },
      transfer: async (businessId, input) => {
        const u = me();
        const b = db.businesses.find((x) => x.id === businessId);
        if (!b) throw new Error("not_found");
        if (!canTransferFrom(b.office_id)) throw new Error("admin_only");
        const office = targetOffice(input.office_id);
        if (office.id === b.office_id) throw new Error("same_office");
        const current = db.users.find((x) => x.id === b.consultant_id);
        // Without a consultant named: a Global consultant stays; otherwise the manager of the target office takes it.
        const consultant = input.consultant_user_id
          ? db.users.find((x) => x.id === input.consultant_user_id)
          : current && canFollow(current, office.id) ? current : db.users.find((x) => x.id === office.manager_user_id);
        if (!consultant || !canFollow(consultant, office.id)) throw new Error("invalid_consultant");
        b.office_id = office.id;
        if (b.consultant_id !== consultant.id) {
          db.businessEvents.push({ id: newId(), business_id: b.id, kind: "consultant_changed", actor_user_id: u.id, from_user_id: b.consultant_id, to_user_id: consultant.id, created_at: nowIso() });
          b.consultant_id = consultant.id;
        }
        // Its lead (the record of how it entered) moves with it.
        const l = db.leads.find((x) => x.business_id === b.id);
        if (l) {
          l.office_id = office.id;
          l.consultant_user_id = consultant.id;
          pushLeadEvent({ lead_id: l.id, kind: "transferred", from: null, to: null, body: office.name });
        }
        return delay({ ...b });
      },
    },
    users: {
      // Nobody sees people of another office; a Bishop only sees himself. Scope and writes live in ./accounts.
      ...accounts.users,
      /** Inviting a Bishop creates his framework agreement at once (the Bishop and Corporate's CEO still to sign). */
      invite: async (input) => {
        const user = await accounts.users.invite(input);
        if (user.role === "bishop") frameworkFor(user);
        return user;
      },
      createFrameworkAgreement: async (userId) => {
        if (me().role !== "sm_global") throw new Error("forbidden");
        const target = db.users.find((u) => u.id === userId);
        if (!target) throw new Error("not_found");
        if (target.role !== "bishop") throw new Error("invalid_user");
        return delay(withSigningView(frameworkFor(target), me()));
      },
      setGoogleCalendar: async (email) => {
        const u = me();
        cal.setConnected(u, email);
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
      /** SM Global (Corporate) decides who may sign for SM Square; only SM people. */
      setSigningEntities: async (userId, input) => {
        if (me().role !== "sm_global") throw new Error("forbidden");
        const target = db.users.find((u) => u.id === userId);
        if (!target) throw new Error("not_found");
        if (target.role !== "sm_team" && target.role !== "sm_global") throw new Error("invalid_user");
        target.can_sign_sm_square = input.can_sign_sm_square;
        return delay({ ...target });
      },
    },
    contractRules: crules.repository,
    ...withIntakeDocuments(net),
    // After the spread: replaces net.rules.
    rules,
    network: {
      ...net.network,
      /**
       * "Firma de la oficina": SM Global, or the admin of that office. Corporate (the sm_global organization) has its
       * own, the CEO's, uploaded by SM Global from Oficinas. PNG only; the mock keeps the name.
       */
      setOfficeSignature: async (officeId, file) => {
        const u = me();
        const office = db.orgs.find((o) => o.id === officeId && (o.kind === "sm" || o.kind === "sm_global"));
        if (!office) throw new Error("not_found");
        if (u.role !== "sm_global" && !(office.kind === "sm" && u.role === "sm_team" && u.is_admin && u.organization_id === officeId)) throw new Error("forbidden");
        if (!/\.png$/i.test(file.name.trim())) throw new Error("invalid_file");
        office.signature_file_id = newId();
        office.signature_file_name = file.name.trim();
        return delay({ ...office });
      },
    },
    // Inviting a team member creates an account behind it; handing the business over needs the owner.
    businessProfile: { ...net.businessProfile, ...accounts.businessProfile },
    brand: accounts.brand,
    calendar: cal.calendar,
    bishop: {
      ...net.bishop,
      ...opps.bishop,
      // The rule engine runs before every Bishop read, and his acceptance creates the binding agreement.
      listOpportunities: async () => { crules.sweep(); return opps.bishop.listOpportunities(); },
      getOpportunity: async (id) => { crules.sweep(); return opps.bishop.getOpportunity(id); },
      acceptOpportunity: async (id) => {
        const o = await opps.bishop.acceptOpportunity(id);
        crules.sweep();
        return o;
      },
      // Calendar v2: the consultant of each funded business, so the Bishop can schedule with him.
      getPortfolio: async () => {
        const p = await net.bishop.getPortfolio();
        const consultantOf = (businessId: string) => {
          const id = db.businesses.find((b) => b.id === businessId)?.consultant_id;
          const u = id ? db.users.find((x) => x.id === id) : undefined;
          return u ? { user_id: u.id, name: u.full_name } : null;
        };
        return { ...p, investments: p.investments.map((i) => ({ ...i, consultant: consultantOf(i.business_id) })) };
      },
      listAgreements: async () => {
        crules.sweep();
        const base = await net.bishop.listAgreements();
        return [...opps.signableAgreements(me()), ...base];
      },
    },
    leads: {
      ...opps.leads,
      ...accounts.leads,
      ...entry.leads,
      list: async (opts) => {
        entry.promptOutcomes();
        crules.sweep();
        return delay(readableLeads().filter((l) => !opts?.office_id || l.office_id === opts.office_id).map(withBooking));
      },
      get: async (id) => {
        entry.promptOutcomes();
        crules.sweep();
        const l = readableLeads().find((x) => x.id === id);
        if (!l) return delay(null);
        return delay({ lead: withBooking(l), events: leadEventsOf(id) });
      },
      /** Never a discarded lead: resolveLeadMove refuses it (global_only), the API answers invalid_transition. */
      move: async (id, to) => {
        const l = findLead(id);
        const m = resolveLeadMove(l.stage, to);
        if (!m.ok || m.action !== "move") throw new Error("invalid_transition");
        const from = l.stage;
        setStage(l, to);
        pushLeadEvent({ lead_id: id, kind: "stage_changed", from, to, body: null });
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
      /** SM Global only, any discarded lead (by hand or by the API): back to the stage it was in. */
      reactivate: async (id) => {
        if (me().role !== "sm_global") throw new Error("global_only");
        const l = db.leads.find((x) => x.id === id);
        if (!l) throw new Error("not_found");
        if (l.stage !== "discarded") throw new Error("invalid_transition");
        const to = l.discarded_from ?? "evaluated";
        setStage(l, to);
        l.discarded_from = null;
        l.discard_reason = null;
        pushLeadEvent({ lead_id: id, kind: "reactivated", from: "discarded", to, body: null });
        return delay(withBooking(l));
      },
      transfer: async (id, input) => {
        const l = db.leads.find((x) => x.id === id);
        if (!l) throw new Error("not_found");
        if (!canTransferFrom(l.office_id)) throw new Error("admin_only");
        const office = targetOffice(input.office_id);
        if (office.id === l.office_id) throw new Error("same_office");
        const consultant = db.users.find((x) => x.id === input.consultant_user_id);
        if (!consultant || !canFollow(consultant, office.id)) throw new Error("invalid_consultant");
        l.office_id = office.id;
        l.consultant_user_id = consultant.id;
        l.last_contact_at = nowIso();
        // The business entering with it follows the lead.
        const b = db.businesses.find((x) => x.id === l.business_id);
        if (b) { b.office_id = office.id; b.consultant_id = consultant.id; }
        pushLeadEvent({ lead_id: id, kind: "transferred", from: null, to: null, body: office.name });
        return delay(withBooking(l));
      },
      addNote: async (id, body) => {
        if (!body.trim()) throw new Error("note_required");
        const l = findLead(id);
        l.last_contact_at = nowIso();
        return delay(pushLeadEvent({ lead_id: id, kind: "note", from: null, to: null, body: body.trim() }));
      },
      sendNda: async (id) => {
        const l = findLead(id);
        if (l.stage !== "evaluated" && l.stage !== "meeting") throw new Error("invalid_transition");
        if (intake.record(l.id)) throw new Error("invalid_state");
        openNda(l, currentUserId);
        l.last_contact_at = nowIso();
        return delay(withBooking(l));
      },
      sendMou: async (id) => {
        const l = findLead(id);
        if (l.stage !== "meeting") throw new Error("invalid_transition");
        sendMouAndMove(l);
        return delay(withBooking(l));
      },
      setMeetingOutcome: async (leadId, meetingId, input) => {
        const l = findLead(leadId);
        const initial = !!l.meeting?.id && l.meeting.id === meetingId;
        const m = initial ? l.meeting : l.expansion_meeting?.id === meetingId ? l.expansion_meeting ?? null : null;
        const block = outcomeBlock(m, input.outcome);
        if (block || !m) throw new Error(block ?? "not_found");
        if (l.stage !== (initial ? "meeting" : "accepted")) throw new Error("invalid_transition");
        const now = nowIso();
        m.outcome = input.outcome;
        m.notes_at = now;
        l.last_contact_at = now;
        const note = input.outcome === "held" ? input.note?.trim() || null : null;
        pushLeadEvent({ lead_id: l.id, kind: "meeting_outcome", from: null, to: null, body: note, outcome: input.outcome, meeting_kind: m.kind ?? "initial" });
        if (input.outcome === "held" && initial) {
          // The MOU is signed together at the end of the meeting. A meeting held without it signed means the owner
          // did not commit: the lead leaves the process by itself (SM Global can bring it back with reactivate).
          if (!intake.summaryFor(l)?.mou_signed_by_owner) {
            setStage(l, "discarded");
            l.discarded_from = "meeting";
            l.discard_reason = AUTO_DISCARD_MOU_NOT_SIGNED;
            pushLeadEvent({ lead_id: l.id, kind: "discarded", from: "meeting", to: "discarded", body: AUTO_DISCARD_MOU_NOT_SIGNED });
            return delay(withBooking(l));
          }
          // "Se hizo" sends the documents list only (and the NDA first when the booking did not create it): the MOU
          // already exists once the owner signed the NDA.
          if (!intake.record(l.id)) openNda(l, currentUserId);
          sendDocumentsAndMove(l);
        }
        if (input.outcome === "held" && !initial) l.expansion_meeting_held_at = now;
        return delay(withBooking(l));
      },
      getIntake: async (id) => {
        crules.sweep();
        const l = readableLeads().find((x) => x.id === id);
        const summary = l ? intake.summaryFor(l) : null;
        if (!l || !summary || !l.business_id) return delay(null);
        // can_sign, my_signature, pending_parties as the API fills them for the person reading.
        const viewer = me();
        return delay({ summary, contracts: intake.contractsOf(l.business_id).map((c) => withSigningView(c, viewer, { officeId: l.office_id })), documents: intake.docsOf(l.business_id) });
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
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day1) || day1 > todayIso()) throw new Error("invalid_date");
        return delay(launchProgram(l, day1, "contract_signed"));
      },
      /** Draft of the definitive percentages: accepted leads, SM team of the office, until it is closed. */
      saveValidation: async (id, input) => {
        const l = findLead(id);
        if (l.stage !== "accepted" || l.validation?.status === "closed") throw new Error("invalid_state");
        if (splitError(input)) throw new Error("invalid_split");
        if (input.investment_amount !== null && (!Number.isFinite(input.investment_amount) || input.investment_amount < 0)) throw new Error("invalid_amount");
        const holder = input.sm_square_holder_user_id ? db.users.find((u) => u.id === input.sm_square_holder_user_id) : null;
        if (input.sm_square_holder_user_id && (!holder || !holder.can_sign_sm_square)) throw new Error("sm_square_signer_required");
        l.validation = {
          status: "open", equity_owner: input.equity_owner, equity_bishop: input.equity_bishop, equity_sm: input.equity_sm,
          investment_amount: input.investment_amount, notes: input.notes?.trim() || null, sm_square_center: input.sm_square_center?.trim() || null,
          sm_square_holder_user_id: input.sm_square_holder_user_id, closed_at: null, closed_by: null,
        };
        pushLeadEvent({ lead_id: id, kind: "validation_saved", from: null, to: null, body: null });
        return delay(withBooking(l));
      },
      /** Admin of the office (or an SM Global admin): fixes the percentages; the Operating Agreement can be created. */
      closeValidation: async (id) => {
        const u = me();
        const l = u.role === "sm_global" ? db.leads.find((x) => x.id === id) : findLead(id);
        if (!l) throw new Error("not_found");
        if (!isDocsAdmin(u, l.office_id)) throw new Error("admin_only");
        if (l.stage !== "accepted" || !l.validation || l.validation.status === "closed") throw new Error("invalid_state");
        const block = closeBlock({ ...l.validation, sm_square_center: l.validation.sm_square_center ?? null, sm_square_holder_user_id: l.validation.sm_square_holder_user_id ?? null });
        if (block) throw new Error(block === "invalid_split" ? "invalid_split" : "validation_incomplete");
        const holder = db.users.find((x) => x.id === l.validation!.sm_square_holder_user_id);
        if (!holder?.can_sign_sm_square) throw new Error("sm_square_signer_required");
        Object.assign(l.validation, { status: "closed", closed_at: nowIso(), closed_by: u.id });
        pushLeadEvent({ lead_id: id, kind: "validation_closed", from: null, to: null, body: `${l.validation.equity_owner} / ${l.validation.equity_bishop} / ${l.validation.equity_sm}` });
        notifyParties(l, "validation_closed", null);
        crules.sweep();
        return delay(withBooking(l));
      },
      /**
       * With the configurable contracts the Operating Agreement is created by its rule (binding agreement signed and
       * validation closed): "Enviar" only answers it, or validation_open. Older businesses keep the manual send.
       */
      sendTripartite: async (id) => {
        const l = findLead(id);
        if (l.business_id && opps.bindingOf(l)) {
          if (l.validation?.status !== "closed") throw new Error("validation_open");
          crules.sweep();
          const oa = opps.tripartiteOf(l);
          if (!oa) throw new Error("invalid_state");
          return delay(oa);
        }
        return opps.leads.sendTripartite(id);
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
      list: (opts) => delay(visibleTasks().filter((t) => matchesTaskFilters(t, opts)).map(computed)),
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
            .filter((m) => ids.has(m.task_id) && m.status !== "cancelled" && m.starts_at.slice(0, 10) >= todayIso())
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
          // B5-13: the brand read from the manual travels with the version and applies when the owner approves it.
          brand: t.code === "B5-13" && input.brand ? brandProposalOf(input.brand) : null,
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
        ownerInCharge(t);
        const wasBlocked = new Set(db.tasks.filter((x) => withComputed(x, db.tasks).is_blocked).map((x) => x.id));
        transition(t, "accepted");
        const v = db.versions.filter((x) => x.task_id === id).sort((a, b) => b.version - a.version)[0];
        if (v) v.status = "accepted";
        pushEvent(id, "approved", v?.version ?? null);
        // Tell the firm of each task this approval unblocks.
        for (const x of db.tasks) if (wasBlocked.has(x.id) && !withComputed(x, db.tasks).is_blocked) notify(x.assignee_user_id, "unblocked", x.id);
        // B5-13 approved with a brand: the business portal takes it ("Tu portal ya tiene tu marca").
        accounts.applyBrandFromVersion(t, v);
        return delay(withComputed(t, db.tasks));
      },
      requestChanges: async (id, note) => {
        if (!note.trim()) throw new Error("note_required");
        const t = findTask(id);
        ownerInCharge(t);
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
