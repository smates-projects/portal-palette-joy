// In-memory implementation of the network repositories (SM Global, franchises, manual, owner data, Bishop,
// franchisee). Like the rest of the mock layer it filters by the current user to simulate API authorization.
import { todayIso, nowIso } from "@/lib/clock";
import { FEE_FIELDS, MOCK_LIMITS, MOCK_MAX_MONTHLY_SALES, MOCK_PROGRAM, PROFIT_SPLIT } from "./economics";
import { DEFAULT_PLATFORM_RULES } from "../franchisability";
import { equityRangesError } from "@/lib/leads/validation";
import { isActiveFirm, isActiveUser } from "@/lib/accounts/permissions";
import { bishopShareAt, estimatePaybackMonth } from "@/lib/bishop/split";
import { computeReportAmounts, nextMonth, previousMonth } from "@/lib/franchise/fees";
import { monthCohortConversion } from "@/lib/leads/pipeline";
import { validateMeetingHours } from "@/lib/calendar/scheduling";
import { eligibilityError } from "@/lib/leads/readiness";
import { expectedFranchisePct } from "@/lib/tasks/office";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { areaHealth, AREAS } from "@/lib/tasks/owner";
import { withComputed } from "../computed";
import { computeFranchisability } from "../franchisability";
import { computeOfficeChecklist, missingFirmAreas } from "../office-checklist";
import { AREA_BY_KEY, addDaysIso } from "../program";
import { MANUAL_SECTION_TITLES, manualSectionContent } from "./seed-manual";
import { VERIFIED_PROFILE_FIELDS, type ProfileChangeRequest } from "../network-types";
import type {
  ApiClient,
  BishopRepository,
  BusinessProfileRepository,
  CatalogRepository,
  DocumentsRepository,
  FinancialsRepository,
  FranchiseeRepository,
  FranchisesRepository,
  ManualRepository,
  NetworkRepository,
  RulesRepository,
} from "../repositories";
import {
  LEAD_STAGES,
  type AreaBottleneck,
  type AreaCode,
  type RulesField,
  type BishopAgreement,
  type BishopInvestment,
  type BishopOpportunity,
  type Business,
  type BusinessDocument,
  type BusinessProfile,
  type CatalogAdminItem,
  type CatalogChange,
  type CatalogItemInput,
  type ChecklistItem,
  type Contract,
  type CreateOfficeInput,
  type FinancialSeries,
  type Franchise,
  type FranchiseReport,
  type FranchiseSummary,
  type FranchiseTask,
  type Lead,
  type LeadStage,
  type ManualEvent,
  type ManualSection,
  type ManualVersion,
  type OfficeBusinessRow,
  type OfficeStats,
  type OfficeSummary,
  type Organization,
  type OpportunityDecision,
  type PlatformRules,
  type ProjectionYear,
  type RecoveryPoint,
  type RulesChange,
  type StructureHealth,
  type StructureNode,
  type SupportTicket,
  type Task,
  type TaskVersion,
  type TeamMember,
  type User,
  type Uuid,
} from "../types";

export interface BishopInvestmentRecord {
  id: Uuid;
  bishop_user_id: Uuid;
  business_id: Uuid;
  invested: number;
  invested_at: string;
}

/** Collections the network repositories read and write. The mock index owns the object. */
export interface NetworkDb {
  tasks: Task[];
  versions: TaskVersion[];
  users: User[];
  orgs: Organization[];
  businesses: Business[];
  leads: Lead[];
  rules: PlatformRules;
  rulesHistory: RulesChange[];
  catalog: CatalogAdminItem[];
  catalogHistory: CatalogChange[];
  franchises: Franchise[];
  franchiseReports: FranchiseReport[];
  checklist: ChecklistItem[];
  tickets: SupportTicket[];
  franchiseTasks: FranchiseTask[];
  manualSections: ManualSection[];
  manualVersions: ManualVersion[];
  manualEvents: ManualEvent[];
  documents: BusinessDocument[];
  contracts: Contract[];
  financials: FinancialSeries[];
  profiles: BusinessProfile[];
  profileChangeRequests: ProfileChangeRequest[];
  teamMembers: TeamMember[];
  investments: BishopInvestmentRecord[];
  recovery: Record<Uuid, RecoveryPoint[]>;
  agreements: BishopAgreement[];
}

export interface MockContext {
  db: NetworkDb;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(value: T) => Promise<T>;
}

type NetworkApi = Pick<
  ApiClient,
  "rules" | "catalog" | "franchises" | "manual" | "financials" | "businessProfile" | "franchisee"
> & { network: Omit<ApiClient["network"], "setOfficeSignature"> } & { bishop: Pick<BishopRepository, "getPortfolio" | "listAgreements"> } & { documents: Pick<ApiClient["documents"], "listDocuments" | "listContracts" | "uploadDocument"> };

const PRIORITIES = ["minimo", "alto_valor", "opcional", "tercero", "fuera"];
const AREA_KEY_BY_CODE = Object.fromEntries(Object.entries(AREA_BY_KEY).map(([key, code]) => [code, key])) as Record<AreaCode, string>;
const average = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const validEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

export function createNetworkRepositories(ctx: MockContext): NetworkApi {
  const { db, me, newId, delay } = ctx;

  // ---------- Scope helpers ----------
  const globalOnly = () => {
    if (me().role !== "sm_global") throw new Error("global_only");
  };
  const businessOf = (id: Uuid) => db.businesses.find((b) => b.id === id);
  const officeOf = (id: Uuid) => db.orgs.find((o) => o.id === id && o.kind === "sm");

  /** Businesses the current user may read documents, numbers, manual or profile for. */
  const readableBusinesses = (): Business[] => {
    const u = me();
    if (u.role === "sm_global") return db.businesses;
    if (u.role === "sm_team") return db.businesses.filter((b) => b.office_id === u.organization_id);
    if (u.role === "business_owner") return db.businesses.filter((b) => b.id === u.business_id);
    throw new Error("forbidden");
  };
  /** The one business a call refers to: the owner's own, or the one SM names. */
  const pickBusiness = (businessId?: Uuid): Business => {
    const inScope = readableBusinesses();
    if (me().role === "business_owner") {
      const own = inScope[0];
      if (!own || (businessId && businessId !== own.id)) throw new Error("not_found");
      return own;
    }
    if (!businessId) throw new Error("business_required");
    const b = inScope.find((x) => x.id === businessId);
    if (!b) throw new Error("not_found");
    return b;
  };
  const ownOwnerBusiness = (): Business => {
    const u = me();
    const b = u.role === "business_owner" ? businessOf(u.business_id ?? "") : undefined;
    if (!b) throw new Error("owner_only");
    return b;
  };

  const franchisorOfFranchise = (f: Franchise) => businessOf(f.franchisor_business_id)!;
  /** Franchise units the current user may see. */
  const visibleFranchises = (): Franchise[] => {
    const u = me();
    switch (u.role) {
      case "sm_global":
        return db.franchises;
      case "sm_team":
        return db.franchises.filter((f) => franchisorOfFranchise(f).office_id === u.organization_id);
      case "business_owner": {
        const own = businessOf(u.business_id ?? "");
        return own?.status === "franchisor" ? db.franchises.filter((f) => f.franchisor_business_id === own.id) : [];
      }
      case "franchisee":
        return db.franchises.filter((f) => f.id === u.organization_id);
      default:
        throw new Error("forbidden");
    }
  };

  // ---------- Computed data ----------
  const computedTasks = () => db.tasks.map((t) => withComputed(t, db.tasks));
  const franchisabilityOf = (b: Business) =>
    computeFranchisability(b, db.tasks, { goal: db.rules.franchisability_goal, required_task_codes: db.rules.required_task_codes });
  const openTicketsOf = (franchiseId: Uuid) => db.tickets.filter((t) => t.franchise_id === franchiseId && t.state === "open").length;
  const compliancePct = (f: Franchise) => {
    const items = db.checklist.filter((c) => c.franchise_id === f.id && c.kind === (f.status === "operating" ? "standard" : "opening"));
    return pct(items.filter((c) => c.ok).length, items.length);
  };
  const reportsOf = (franchiseId: Uuid) => db.franchiseReports.filter((r) => r.franchise_id === franchiseId).sort((a, b) => b.month.localeCompare(a.month));
  const summarize = (f: Franchise): FranchiseSummary => {
    const last = reportsOf(f.id).find((r) => r.status !== "due") ?? null;
    return {
      ...f,
      franchisee_name: db.users.find((u) => u.id === f.franchisee_user_id)?.full_name ?? "",
      compliance_pct: compliancePct(f),
      open_tickets: openTicketsOf(f.id),
      last_report: last,
      last_sales: last?.gross_sales ?? null,
      ...FEE_FIELDS,
    };
  };

  const officeStats = (office: Organization, all: ReturnType<typeof computedTasks>): OfficeStats => {
    const biz = db.businesses.filter((b) => b.office_id === office.id && b.status !== "onboarding");
    const programs = biz.filter((b) => b.status === "in_program");
    const ids = new Set(biz.map((b) => b.id));
    const tasks = all.filter((t) => ids.has(t.business_id) && t.status !== "cancelled");
    const matrix = buildNetworkMatrix(tasks, db.versions, programs, todayIso(), db.rules.area_amber_days);
    // The month's cohort, as GET /leads/counters: the same conversion on every screen (QA M7).
    const month = monthCohortConversion(db.leads.filter((l) => l.office_id === office.id));
    return {
      programs: programs.length,
      leads_this_month: month.submitted,
      conversion_month: month.pct,
      ready_to_franchise: programs.filter((b) => franchisabilityOf(b).is_ready).length,
      franchisors: biz.length - programs.length,
      franchises: db.franchises.filter((f) => ids.has(f.franchisor_business_id)).length,
      partner_firms: db.orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === office.id && isActiveFirm(o)).length,
      open_leads: db.leads.filter((l) => l.office_id === office.id && l.stage !== "in_program" && l.stage !== "discarded").length,
      open_tasks: tasks.filter((t) => t.status !== "accepted").length,
      overdue_tasks: tasks.filter((t) => t.is_overdue).length,
      health: {
        red: matrix.filter((r) => r.health === "red").length,
        amber: matrix.filter((r) => r.health === "amber").length,
        green: matrix.filter((r) => r.health === "green" || r.health === "grey").length,
      },
    };
  };
  const officeSummary = (office: Organization, all: ReturnType<typeof computedTasks>): OfficeSummary => ({
    office,
    manager: db.users.find((u) => u.id === office.manager_user_id) ?? null,
    stats: officeStats(office, all),
  });
  const reportedIn = (month: string) => db.franchiseReports.filter((r) => r.month === month && r.status !== "due");

  // ---------- Network (SM Global) ----------
  // The office signature lives in ./index.ts (it needs the admin flag of the current user).
  const network: Omit<NetworkRepository, "setOfficeSignature"> = {
    getSummary: async () => {
      globalOnly();
      const offices = db.orgs.filter((o) => o.kind === "sm");
      const all = computedTasks();
      const month = previousMonth(todayIso().slice(0, 7));
      const sums = offices.map((o) => officeStats(o, all));
      const sum = (pick: (s: OfficeStats) => number) => sums.reduce((a, s) => a + pick(s), 0);
      const reports = reportedIn(month);
      // The conversion of the network is its own ratio, not the average of the offices.
      const leadsMonth = monthCohortConversion(db.leads);
      return delay({
        offices: offices.length,
        programs: sum((s) => s.programs),
        franchisors: sum((s) => s.franchisors),
        franchises: sum((s) => s.franchises),
        partner_firms: sum((s) => s.partner_firms),
        open_leads: sum((s) => s.open_leads),
        leads_this_month: leadsMonth.submitted,
        conversion_month: leadsMonth.pct,
        ready_to_franchise: sum((s) => s.ready_to_franchise),
        overdue_tasks: sum((s) => s.overdue_tasks),
        last_month: month,
        franchise_sales_last_month: reports.reduce((a, r) => a + (r.gross_sales ?? 0), 0),
        royalties_last_month: reports.reduce((a, r) => a + (r.royalty_amount ?? 0), 0),
      });
    },
    listOffices: async () => {
      const u = me();
      if (u.role !== "sm_global" && u.role !== "sm_team") throw new Error("forbidden");
      const all = computedTasks();
      const offices = db.orgs.filter((o) => o.kind === "sm" && (u.role === "sm_global" || o.id === u.organization_id));
      return delay(offices.map((o) => officeSummary(o, all)).sort((a, b) => a.office.name.localeCompare(b.office.name)));
    },
    getOffice: async (id) => {
      const u = me();
      if (u.role !== "sm_global" && u.role !== "sm_team") throw new Error("forbidden");
      const office = officeOf(id);
      if (!office || (u.role === "sm_team" && office.id !== u.organization_id)) return delay(null);
      const all = computedTasks();
      const biz = db.businesses.filter((b) => b.office_id === id && b.status !== "onboarding");
      const matrix = buildNetworkMatrix(all.filter((t) => t.status !== "cancelled"), db.versions, biz, todayIso(), db.rules.area_amber_days);
      const businesses: OfficeBusinessRow[] = biz.map((b) => ({
        business_id: b.id,
        name: b.name,
        status: b.status as OfficeBusinessRow["status"],
        program_day: b.program_day,
        health: b.status === "franchisor" ? "grey" : matrix.find((r) => r.business.id === b.id)?.health ?? "grey",
        franchisability_pct: franchisabilityOf(b).franchisability_pct,
        franchises: db.franchises.filter((f) => f.franchisor_business_id === b.id).length,
      }));
      return delay({
        ...officeSummary(office, all),
        businesses,
        firms: db.orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === id && isActiveFirm(o)),
        team: db.users.filter((x) => x.role === "sm_team" && x.organization_id === id && isActiveUser(x)),
        checklist: office.status === "opening" ? computeOfficeChecklist(office, db.users, db.orgs, db.leads) : null,
      });
    },
    getStructure: async () => {
      globalOnly();
      const global = db.orgs.find((o) => o.kind === "sm_global");
      if (!global) throw new Error("not_found");
      const offices = db.orgs.filter((o) => o.kind === "sm" && o.parent_id === global.id).sort((a, b) => a.name.localeCompare(b.name));
      // Health, franchisability and facts of every node are computed here, so the screen only draws the tree.
      const tasks = computedTasks().filter((t) => t.status !== "cancelled");
      const programs = db.businesses.filter((b) => b.status === "in_program");
      const rows = buildNetworkMatrix(tasks, db.versions, programs, todayIso(), db.rules.area_amber_days);
      const consultantName = (b: Business) => db.users.find((u) => u.id === b.consultant_id)?.full_name ?? null;
      const worst = (healths: StructureHealth[]): StructureHealth =>
        (["red", "amber", "green"] as const).find((h) => healths.includes(h)) ?? "grey";
      const officeNode = (o: Organization): StructureNode => {
        const own = db.businesses.filter((b) => b.office_id === o.id && b.status !== "onboarding");
        const businessNodes = own.map((b): StructureNode => {
          const inProgram = b.status === "in_program";
          const f = franchisabilityOf(b);
          return {
            id: b.id, kind: "business", name: b.name,
            health: inProgram ? rows.find((r) => r.business.id === b.id)?.health ?? "grey" : null,
            franchisability: inProgram ? { value: f.franchisability_pct, expected: expectedFranchisePct(b.program_day, f.franchisability_goal) } : null,
            detail: { kind: "business", status: b.status, program_day: inProgram ? b.program_day : null, consultant_name: consultantName(b), owner_name: db.users.find((u) => u.id === b.owner_user_id)?.full_name ?? null },
            children: [
              ...db.franchises.filter((x) => x.franchisor_business_id === b.id).map((x): StructureNode => ({
                id: x.id, kind: "franchise", name: x.name, health: null, franchisability: null,
                detail: { kind: "franchise", status: x.status, city: `${x.city}, ${x.state}`, franchisee_name: db.users.find((u) => u.id === x.franchisee_user_id)?.full_name ?? null },
                children: [],
              })),
              // Bishop investors hang from the business they funded; the share is the provisional split of that date.
              ...db.investments.filter((i) => i.business_id === b.id).map((i): StructureNode => ({
                id: i.id, kind: "investor", name: db.users.find((u) => u.id === i.bishop_user_id)?.full_name ?? "", health: null, franchisability: null,
                detail: { kind: "investor", invested: i.invested, share_pct: bishopShareAt(i.invested_at, todayIso()) }, children: [],
              })),
            ],
          };
        });
        const firmNodes = db.orgs
          .filter((x) => x.kind === "partner_firm" && x.parent_id === o.id && isActiveFirm(x))
          .map((x): StructureNode => {
            const overdue = tasks.filter((t) => t.organization_id === x.id && t.is_overdue).length;
            return {
              id: x.id, kind: "firm", name: x.name, health: overdue > 0 ? "red" : "green", franchisability: null,
              detail: {
                kind: "firm", area: x.area, overdue_tasks: overdue, specialty: x.specialty,
                contact_name: x.contact_name ?? db.users.find((u) => u.role === "partner_firm" && u.organization_id === x.id && isActiveUser(u))?.full_name ?? null,
              },
              children: [],
            };
          });
        const inProgram = own.filter((b) => b.status === "in_program");
        return {
          id: o.id, kind: "office", name: o.name,
          health: worst(rows.filter((r) => r.business.office_id === o.id).map((r) => r.health)),
          franchisability: null,
          detail: {
            kind: "office", status: o.status ?? "operating", programs: inProgram.length,
            ready_to_franchise: inProgram.filter((b) => franchisabilityOf(b).is_ready).length,
            operating_franchises: db.franchises.filter((x) => x.status === "operating" && own.some((b) => b.id === x.franchisor_business_id)).length,
            city: o.city,
            manager_name: db.users.find((u) => u.id === o.manager_user_id)?.full_name ?? null,
            missing_areas: missingFirmAreas(o, db.orgs),
          },
          children: [...businessNodes, ...firmNodes],
        };
      };
      return delay({
        root: { id: global.id, kind: "global", name: global.name, health: null, franchisability: null, detail: null, children: offices.map(officeNode) },
        counts: {
          offices: offices.length,
          businesses: db.businesses.filter((b) => b.status === "in_program").length,
          franchisors: db.businesses.filter((b) => b.status === "franchisor").length,
          franchises: db.franchises.length,
          firms: db.orgs.filter((o) => o.kind === "partner_firm" && isActiveFirm(o)).length,
        },
      });
    },
    listBottlenecks: async () => {
      globalOnly();
      const all = computedTasks().filter((t) => t.status !== "cancelled");
      const offices = db.orgs.filter((o) => o.kind === "sm");
      const programIds = new Set(db.businesses.filter((b) => b.status === "in_program").map((b) => b.id));
      const rows: AreaBottleneck[] = AREAS.map((area) => {
        const inArea = all.filter((t) => t.area === area);
        const open = inArea.filter((t) => t.status !== "accepted");
        const red = [...programIds].filter((id) => areaHealth(inArea.filter((t) => t.business_id === id), db.versions, todayIso(), db.rules.area_amber_days) === "red").length;
        return {
          area,
          open: open.length,
          overdue: inArea.filter((t) => t.is_overdue).length,
          blocked: open.filter((t) => t.is_blocked).length,
          waiting_owner: inArea.filter((t) => t.status === "submitted").length,
          red_businesses: red,
          by_office: offices
            .map((o) => {
              const ids = new Set(db.businesses.filter((b) => b.office_id === o.id).map((b) => b.id));
              const mine = inArea.filter((t) => ids.has(t.business_id));
              return { office_id: o.id, office_name: o.name, open: mine.filter((t) => t.status !== "accepted").length, overdue: mine.filter((t) => t.is_overdue).length };
            })
            .filter((x) => x.open > 0 || x.overdue > 0),
        };
      });
      return delay(rows.sort((a, b) => b.overdue - a.overdue || a.area.localeCompare(b.area)));
    },
    getFunnel: async () => {
      globalOnly();
      const stages: LeadStage[] = [...LEAD_STAGES, "discarded"];
      const count = (leads: Lead[]) => stages.map((stage) => ({ stage, count: leads.filter((l) => l.stage === stage).length }));
      return delay({
        stages: count(db.leads),
        by_office: db.orgs.filter((o) => o.kind === "sm").map((o) => ({ office_id: o.id, office_name: o.name, stages: count(db.leads.filter((l) => l.office_id === o.id)) })),
      });
    },
    createOffice: async (input) => {
      globalOnly();
      const global = db.orgs.find((o) => o.kind === "sm_global");
      const city = input.city.trim();
      const name = input.name.trim();
      if (!name) throw new Error("name_required");
      if (!city) throw new Error("city_required");
      if (db.orgs.some((o) => o.kind === "sm" && o.name.toLowerCase() === name.toLowerCase())) throw new Error("office_exists");
      if (!input.manager_name.trim()) throw new Error("manager_required");
      if (!validEmail(input.manager_email)) throw new Error("invalid_email");
      if (db.users.some((u) => u.email.toLowerCase() === input.manager_email.trim().toLowerCase())) throw new Error("email_taken");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.planned_opening_date) || input.planned_opening_date < todayIso()) throw new Error("invalid_date");
      const officeId = newId();
      const managerId = newId();
      // The manager is the admin of the new office: invites its team and adds its partner firms.
      db.users.push({
        id: managerId, full_name: input.manager_name.trim(), email: input.manager_email.trim(), role: "sm_team", organization_id: officeId, business_id: null,
        title: "Responsable de la oficina", google_calendar_email: null, booking_url: null, is_admin: true, status: "invited", invited_at: nowIso(),
      });
      const office: Organization = {
        id: officeId, name, kind: "sm", area: null, specialty: null, city, email: null, phone: null, default_booking_url: null,
        parent_id: global?.id ?? null, status: "opening", opened_at: input.planned_opening_date, pause_reason: null, manager_user_id: managerId,
      };
      db.orgs.push(office);
      return delay(officeSummary(office, computedTasks()));
    },
    pauseOffice: async (officeId, reason) => {
      globalOnly();
      const office = officeOf(officeId);
      if (!office) throw new Error("not_found");
      if (!reason.trim()) throw new Error("reason_required");
      // An office that is not live yet is never paused: it simply stays in opening.
      if (office.status !== "operating") throw new Error("invalid_state");
      office.status = "paused";
      office.pause_reason = reason.trim();
      return delay(officeSummary(office, computedTasks()));
    },
    activateOffice: async (officeId) => {
      globalOnly();
      const office = officeOf(officeId);
      if (!office) throw new Error("not_found");
      if (office.status === "operating") throw new Error("invalid_state");
      if (office.status === "opening") {
        if (!computeOfficeChecklist(office, db.users, db.orgs, db.leads).complete) throw new Error("checklist_incomplete");
        office.opened_at = todayIso();
      }
      office.status = "operating";
      office.pause_reason = null;
      return delay(officeSummary(office, computedTasks()));
    },
  };

  // ---------- Rules ----------
  /** As GET /rules: the editable rules plus the read-only program and limits, and which fields are at their default. */
  const RULES_FIELDS: Exclude<RulesField, "program_start_requires_full_funds">[] = [
    "franchisability_goal", "required_task_codes", "area_amber_days", "franchisability_amber_tolerance", "document_review_days",
    "intake_documents", "program_amount", "assessment_area_map", "opportunity_visibility", "oa_waiting_days",
    "require_expansion_meeting", "nda_auto_signed_by_sm", "meeting_hours", "intake_help_text", "owner_nda_template",
    "eligibility", "sm_entities", "contracts", "equity_ranges",
  ];
  const readRules = (): PlatformRules => ({
    ...db.rules,
    program_length_days: MOCK_PROGRAM.length_days,
    program: structuredClone(MOCK_PROGRAM),
    limits: { ...MOCK_LIMITS, meeting_durations: [...MOCK_LIMITS.meeting_durations] },
    // Money is SM's and the Bishops' only: for anyone else program_amount is not even named among the defaults.
    defaults: RULES_FIELDS.filter((f) => (f !== "program_amount" || ["sm_team", "sm_global", "bishop"].includes(me().role))
      && (db.rules[f] === undefined || sameJson(db.rules[f], DEFAULT_PLATFORM_RULES[f]))),
  });
  const rules: RulesRepository = {
    get: async () => delay(readRules()),
    update: async (patch, note = null) => {
      globalOnly();
      // The program, the limits and the defaults list are read only: never stored from a patch.
      const { program: _program, program_length_days: _length, limits: _limits, defaults: _defaults, ...editable } = patch;
      const next: PlatformRules = { ...db.rules, ...editable };
      if (next.equity_ranges !== undefined && equityRangesError(next.equity_ranges)) throw new Error("invalid_equity_ranges");
      if (!Number.isInteger(next.franchisability_goal) || next.franchisability_goal < 1 || next.franchisability_goal > 100) throw new Error("invalid_goal");
      if (!Number.isInteger(next.area_amber_days) || next.area_amber_days < 1) throw new Error("invalid_amber_days");
      if (!Number.isInteger(next.franchisability_amber_tolerance) || next.franchisability_amber_tolerance < 0 || next.franchisability_amber_tolerance > 100) throw new Error("invalid_tolerance");
      if (!Number.isInteger(next.document_review_days) || next.document_review_days < 1) throw new Error("invalid_review_days");
      if (next.intake_documents.some((d) => !d.name.trim())) throw new Error("name_required");
      if (!Number.isInteger(next.program_amount) || (next.program_amount ?? 0) < 1) throw new Error("invalid_program_amount");
      if (next.opportunity_visibility !== undefined && next.opportunity_visibility !== "presented" && next.opportunity_visibility !== "all") throw new Error("invalid_visibility");
      if (next.oa_waiting_days !== undefined && (!Number.isInteger(next.oa_waiting_days) || next.oa_waiting_days < 0 || next.oa_waiting_days > MOCK_LIMITS.oa_waiting_days_max)) throw new Error("invalid_waiting_days");
      if (next.meeting_hours !== undefined && validateMeetingHours(next.meeting_hours)) throw new Error("invalid_meeting_hours");
      // Eligibility: the declared annual revenue is a whole number of dollars (0 = no minimum).
      if (next.eligibility !== undefined && eligibilityError(next.eligibility)) throw new Error(eligibilityError(next.eligibility)!);
      // Bilingual contracts: the version that prevails is Spanish or English.
      if (next.contracts !== undefined && next.contracts.governing_language !== "es" && next.contracts.governing_language !== "en") throw new Error("invalid_governing_language");
      const known = new Set(db.catalog.filter((c) => !c.archived).map((c) => c.code));
      if (new Set(next.required_task_codes).size !== next.required_task_codes.length || next.required_task_codes.some((c) => !known.has(c))) throw new Error("unknown_task_code");
      const fields = Object.keys(next) as (keyof PlatformRules)[];
      const changes = fields.filter((f) => !sameJson(db.rules[f], next[f])).map((field) => ({ field, from: db.rules[field], to: next[field] }));
      if (changes.length > 0) {
        db.rulesHistory.push({ id: newId(), actor_user_id: me().id, created_at: nowIso(), changes, note: note?.trim() || null });
        db.rules = next;
      }
      return delay(readRules());
    },
    listHistory: async () => {
      globalOnly();
      return delay([...db.rulesHistory].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
  };

  // ---------- Catalog admin ----------
  const catalog: CatalogRepository = {
    list: async (opts) => {
      const withArchived = !!opts?.include_archived && me().role === "sm_global";
      return delay(db.catalog.filter((c) => withArchived || !c.archived));
    },
    add: async (input) => {
      globalOnly();
      validateCatalogInput(input);
      const sameArea = db.catalog.filter((c) => c.area_code === input.area_code);
      const next = Math.max(0, ...sameArea.map((c) => Number(c.code.split("-")[1]))) + 1;
      const item: CatalogAdminItem = {
        ...input,
        code: `${input.area_code}-${String(next).padStart(2, "0")}`,
        area: AREA_KEY_BY_CODE[input.area_code],
        archived: false,
        updated_at: nowIso(),
      };
      db.catalog.push(item);
      logCatalog(item.code, "added", [], null);
      return delay(item);
    },
    update: async (code, patch, note = null) => {
      globalOnly();
      const item = db.catalog.find((c) => c.code === code);
      if (!item) throw new Error("not_found");
      if (patch.area_code && patch.area_code !== item.area_code) throw new Error("area_locked");
      validateCatalogInput({ ...item, ...patch });
      const fields = (Object.keys(patch) as (keyof CatalogItemInput)[]).filter((f) => f !== "area_code" && !sameJson(item[f], patch[f]));
      const changes = fields.map((field) => ({ field, from: item[field] as string | number | null, to: patch[field] as string | number | null }));
      if (changes.length > 0) {
        Object.assign(item, Object.fromEntries(fields.map((f) => [f, patch[f]])), { updated_at: nowIso() });
        logCatalog(code, "edited", changes, note);
      }
      return delay(item);
    },
    archive: async (code, reason) => {
      globalOnly();
      if (!reason.trim()) throw new Error("reason_required");
      const item = db.catalog.find((c) => c.code === code);
      if (!item) throw new Error("not_found");
      if (!item.archived) {
        item.archived = true;
        item.updated_at = nowIso();
        logCatalog(code, "archived", [], reason.trim());
      }
      return delay(item);
    },
    restore: async (code) => {
      globalOnly();
      const item = db.catalog.find((c) => c.code === code);
      if (!item) throw new Error("not_found");
      if (item.archived) {
        item.archived = false;
        item.updated_at = nowIso();
        logCatalog(code, "restored", [], null);
      }
      return delay(item);
    },
    listHistory: async (code) => {
      globalOnly();
      return delay(db.catalogHistory.filter((h) => !code || h.code === code).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
  };
  function validateCatalogInput(i: CatalogItemInput) {
    if (!i.name.trim()) throw new Error("name_required");
    if (!i.acceptance.trim()) throw new Error("acceptance_required");
    if (!PRIORITIES.includes(i.priority)) throw new Error("invalid_priority");
    if (i.start_day !== null && i.due_day !== null && i.due_day < i.start_day) throw new Error("invalid_window");
  }
  function logCatalog(code: string, kind: CatalogChange["kind"], changes: CatalogChange["changes"], note: string | null) {
    db.catalogHistory.push({ id: newId(), code, kind, actor_user_id: me().id, created_at: nowIso(), changes, note });
  }

  // ---------- Franchises ----------
  const findFranchise = (id: Uuid) => {
    const f = visibleFranchises().find((x) => x.id === id);
    if (!f) throw new Error("not_found");
    return f;
  };
  const franchises: FranchisesRepository = {
    list: async (franchisorBusinessId) =>
      delay(visibleFranchises().filter((f) => !franchisorBusinessId || f.franchisor_business_id === franchisorBusinessId).map(summarize)),
    get: async (id) => {
      const f = visibleFranchises().find((x) => x.id === id);
      if (!f) return delay(null);
      return delay({
        franchise: summarize(f),
        franchisee: db.users.find((u) => u.id === f.franchisee_user_id)!,
        reports: reportsOf(f.id),
        checklist: db.checklist.filter((c) => c.franchise_id === f.id),
        tickets: db.tickets.filter((t) => t.franchise_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
        tasks: db.franchiseTasks.filter((t) => t.franchise_id === f.id),
        team: db.teamMembers.filter((m) => m.owner_id === f.id),
      });
    },
    getFranchisorSummary: async (businessId) => {
      const u = me();
      if (u.role === "franchisee" || u.role === "partner_firm" || u.role === "bishop") throw new Error("forbidden");
      const b = pickBusiness(businessId);
      if (b.status !== "franchisor") throw new Error("franchisor_only");
      const units = db.franchises.filter((f) => f.franchisor_business_id === b.id);
      const unitIds = new Set(units.map((f) => f.id));
      const month = previousMonth(todayIso().slice(0, 7));
      const reports = reportedIn(month).filter((r) => unitIds.has(r.franchise_id));
      return delay({
        business_id: b.id,
        franchises: units.length,
        operating: units.filter((f) => f.status === "operating").length,
        opening: units.filter((f) => f.status === "opening").length,
        last_month: month,
        sales_last_month: reports.reduce((a, r) => a + (r.gross_sales ?? 0), 0),
        royalties_last_month: reports.reduce((a, r) => a + (r.royalty_amount ?? 0), 0),
        marketing_fund_last_month: reports.reduce((a, r) => a + (r.marketing_fund_amount ?? 0), 0),
        open_tickets: db.tickets.filter((t) => unitIds.has(t.franchise_id) && t.state === "open").length,
        reports_due: db.franchiseReports.filter((r) => unitIds.has(r.franchise_id) && r.status === "due").length,
        manual_version: db.manualVersions.filter((v) => v.business_id === b.id).sort((x, y) => y.published_at.localeCompare(x.published_at))[0]?.version ?? null,
      });
    },
    listReports: async (franchiseId) => {
      const units = franchiseId ? [findFranchise(franchiseId)] : visibleFranchises();
      const ids = new Set(units.map((f) => f.id));
      return delay(db.franchiseReports.filter((r) => ids.has(r.franchise_id)).sort((a, b) => b.month.localeCompare(a.month) || a.franchise_id.localeCompare(b.franchise_id)));
    },
    submitReport: async (franchiseId, input) => {
      const u = me();
      if (u.role !== "franchisee" || u.organization_id !== franchiseId) throw new Error("franchisee_only");
      if (!Number.isFinite(input.gross_sales) || input.gross_sales < 0) throw new Error("invalid_amount");
      const report = db.franchiseReports.find((r) => r.franchise_id === franchiseId && r.month === input.month && r.status === "due");
      if (!report) throw new Error("report_not_due");
      Object.assign(report, computeReportAmounts(input.gross_sales), { gross_sales: input.gross_sales, status: "submitted", submitted_at: nowIso() });
      // The next month opens right away, due on the 5th of the month after it.
      const following = nextMonth(input.month);
      if (!db.franchiseReports.some((r) => r.franchise_id === franchiseId && r.month === following))
        db.franchiseReports.push({
          id: newId(), franchise_id: franchiseId, month: following, due_date: `${nextMonth(following)}-05`, status: "due", gross_sales: null,
          royalty_amount: null, marketing_fund_amount: null, total_due: null, submitted_at: null, paid_at: null,
        });
      const reportTask = db.franchiseTasks.filter((t) => t.franchise_id === franchiseId && t.kind === "report" && !t.done).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      if (reportTask) reportTask.done = true;
      return delay(report);
    },
    previewReport: async (franchiseId, grossSales) => {
      findFranchise(franchiseId);
      if (!Number.isFinite(grossSales) || grossSales <= 0) throw new Error("invalid_amount");
      if (grossSales > MOCK_MAX_MONTHLY_SALES) throw new Error("invalid_over_max_sales");
      return delay({ gross_sales: grossSales, ...computeReportAmounts(grossSales), ...FEE_FIELDS, max_monthly_sales: MOCK_MAX_MONTHLY_SALES });
    },
    listTickets: async () => {
      const ids = new Set(visibleFranchises().map((f) => f.id));
      return delay(db.tickets.filter((t) => ids.has(t.franchise_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
  };

  // ---------- Manual ----------
  const manualBusiness = (businessId?: Uuid): Business => {
    const u = me();
    if (u.role === "franchisee") {
      const unit = db.franchises.find((f) => f.id === u.organization_id);
      const b = unit ? businessOf(unit.franchisor_business_id) : undefined;
      if (!b) throw new Error("not_found");
      return b;
    }
    return pickBusiness(businessId);
  };
  const manual: ManualRepository = {
    get: async (businessId) => {
      const b = manualBusiness(businessId);
      // A business whose manual has not started yet gets the six empty sections.
      if (!db.manualSections.some((s) => s.business_id === b.id))
        db.manualSections.push(
          ...MANUAL_SECTION_TITLES.map((title): ManualSection => ({
            id: newId(), business_id: b.id, title, pct: 0, status: "not_started", updated_at: todayIso(), published_in: null, ...manualSectionContent(title, "not_started"),
          })),
        );
      const all = db.manualSections.filter((s) => s.business_id === b.id);
      const franchisee = me().role === "franchisee";
      // A franchisee reads only what the franchisor already published, never drafts or the franchisor's own activity.
      const sections = franchisee ? all.filter((s) => s.published_in !== null) : all;
      const versions = db.manualVersions.filter((v) => v.business_id === b.id).sort((x, y) => y.published_at.localeCompare(x.published_at) || y.version.localeCompare(x.version, undefined, { numeric: true }));
      const activity = franchisee ? [] : db.manualEvents.filter((e) => e.business_id === b.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
      return delay({
        business_id: b.id,
        sections,
        versions,
        activity,
        current_version: versions[0]?.version ?? null,
        completion_pct: average(all.map((s) => s.pct)),
        franchises_following: franchisee ? 0 : db.franchises.filter((f) => f.franchisor_business_id === b.id).length,
      });
    },
    approveSection: async (sectionId) => {
      const b = ownOwnerBusiness();
      const section = db.manualSections.find((s) => s.id === sectionId && s.business_id === b.id);
      if (!section) throw new Error("not_found");
      if (section.status === "approved") throw new Error("already_approved");
      // Only the tasks the business really has count; cancelled or excluded ones do not feed the section.
      const feeding = db.tasks.filter((t) => t.business_id === b.id && section.catalog_codes.includes(t.code) && !["cancelled", "excluded", "with_third_party"].includes(t.status));
      if (feeding.length === 0) throw new Error("no_tasks");
      if (feeding.some((t) => t.status !== "accepted")) throw new Error("tasks_pending");
      section.status = "approved";
      section.pct = 100;
      section.updated_at = todayIso();
      if (!section.body) section.body = manualSectionContent(section.title, "approved").body;
      db.manualEvents.push({ id: newId(), business_id: b.id, section_id: section.id, section_title: section.title, kind: "approved", actor_user_id: me().id, created_at: nowIso() });
      return delay(section);
    },
    publish: async (businessId, input) => {
      const b = ownOwnerBusiness();
      if (b.id !== businessId || b.status !== "franchisor") throw new Error("franchisor_only");
      if (!input.note.trim()) throw new Error("note_required");
      const sections = db.manualSections.filter((s) => s.business_id === businessId && input.section_ids.includes(s.id));
      if (input.section_ids.length === 0 || sections.length !== input.section_ids.length) throw new Error("sections_required");
      if (sections.some((s) => s.status !== "approved")) throw new Error("section_not_approved");
      const current = db.manualVersions.filter((v) => v.business_id === businessId).map((v) => v.version).sort((x, y) => y.localeCompare(x, undefined, { numeric: true }))[0];
      const [major, minor] = current ? (current.slice(1).split(".").map(Number) as [number, number]) : [1, -1];
      const version = `v${major}.${minor + 1}`;
      const published: ManualVersion = {
        id: newId(), business_id: businessId, version, published_at: todayIso(), note: input.note.trim(),
        published_by_user_id: me().id, section_titles: sections.map((s) => s.title),
      };
      db.manualVersions.push(published);
      for (const s of sections) {
        s.published_in = version;
        s.updated_at = todayIso();
      }
      // It flows down: every franchise follows the new version and gets a task to read what changed.
      for (const f of db.franchises.filter((x) => x.franchisor_business_id === businessId)) {
        f.manual_version = version;
        db.franchiseTasks.push({ id: newId(), franchise_id: f.id, kind: "manual_read", title: `Leer el manual ${version}: ${published.section_titles.join(", ")}`, due_date: addDaysIso(todayIso(), 7), done: false });
      }
      return delay(published);
    },
  };

  // ---------- Documents, financials, business profile ----------
  const businessIdsInScope = (businessId?: Uuid) => (businessId ? [pickBusiness(businessId).id] : readableBusinesses().map((b) => b.id));
  const documents: Pick<DocumentsRepository, "listDocuments" | "listContracts" | "uploadDocument"> = {
    listDocuments: async (businessId) => {
      const ids = new Set(businessIdsInScope(businessId));
      return delay(db.documents.filter((d) => ids.has(d.business_id)));
    },
    listContracts: async (businessId) => {
      const ids = new Set(businessIdsInScope(businessId));
      return delay(db.contracts.filter((c) => ids.has(c.business_id)));
    },
    uploadDocument: async (documentId, file) => {
      // The mock keeps only the name of the file.
      const fileName = file.name;
      const b = ownOwnerBusiness();
      const d = db.documents.find((x) => x.id === documentId && x.business_id === b.id);
      if (!d) throw new Error("not_found");
      if (d.state !== "requested") throw new Error("invalid_state");
      if (!fileName.trim()) throw new Error("file_required");
      Object.assign(d, { state: "received", received_at: todayIso(), file_name: fileName.trim() });
      return delay(d);
    },
  };
  const financials: FinancialsRepository = {
    get: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.financials.find((f) => f.business_id === b.id) ?? null);
    },
  };
  // As the API: past onboarding SM checked the legal data against the entry documents, so those fields are verified.
  const verifiedFieldsOf = (b: Business) => (b.status !== "onboarding" ? [...VERIFIED_PROFILE_FIELDS] : []);
  const businessProfile: BusinessProfileRepository = {
    get: async (businessId) => {
      const b = pickBusiness(businessId);
      const p = db.profiles.find((x) => x.business_id === b.id);
      return delay(p ? { ...p, verified_fields: verifiedFieldsOf(b) } : null);
    },
    update: async (patch) => {
      const b = ownOwnerBusiness();
      const p = db.profiles.find((x) => x.business_id === b.id);
      if (!p) throw new Error("not_found");
      // Verified fields are frozen: the owner asks SM for a change.
      const verified = verifiedFieldsOf(b);
      if (verified.some((f) => patch[f] !== undefined && patch[f] !== p[f])) throw new Error("locked_field");
      if (patch.email !== undefined && !validEmail(patch.email)) throw new Error("invalid_email");
      if (patch.legal_name !== undefined && !patch.legal_name.trim()) throw new Error("name_required");
      if (patch.employees !== undefined && (!Number.isInteger(patch.employees) || patch.employees < 0)) throw new Error("invalid_employees");
      Object.assign(p, patch);
      return delay({ ...p, verified_fields: verified });
    },
    requestChange: async (input) => {
      const b = ownOwnerBusiness();
      const p = db.profiles.find((x) => x.business_id === b.id);
      if (!p) throw new Error("not_found");
      if (!VERIFIED_PROFILE_FIELDS.includes(input.field)) throw new Error("not_verified_field");
      if (!input.new_value.trim()) throw new Error("value_required");
      if (input.new_value.trim() === p[input.field]) throw new Error("same_value");
      if (!input.reason.trim()) throw new Error("reason_required");
      if (db.profileChangeRequests.some((r) => r.business_id === b.id && r.field === input.field && r.status === "pending")) throw new Error("already_pending");
      const r: ProfileChangeRequest = {
        id: newId(), business_id: b.id, field: input.field, current_value: p[input.field], new_value: input.new_value.trim(), reason: input.reason.trim(),
        status: "pending", requested_by_user_id: me().id, created_at: new Date().toISOString(), resolved_by_user_id: null, resolved_at: null, resolution_note: null,
      };
      db.profileChangeRequests.push(r);
      return delay(r);
    },
    listChangeRequests: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.profileChangeRequests.filter((r) => r.business_id === b.id).sort((x, y) => y.created_at.localeCompare(x.created_at)));
    },
    resolveChangeRequest: async (id, status, note) => {
      const u = me();
      if (u.role !== "sm_team" && u.role !== "sm_global") throw new Error("sm_only");
      const r = db.profileChangeRequests.find((x) => x.id === id);
      if (!r) throw new Error("not_found");
      pickBusiness(r.business_id); // scope: the office of the business, or Global
      if (r.status !== "pending") throw new Error("invalid_state");
      if (status === "applied") {
        const p = db.profiles.find((x) => x.business_id === r.business_id);
        if (!p) throw new Error("not_found");
        p[r.field] = r.new_value;
        const b = businessOf(r.business_id);
        if (b && r.field === "city") b.city = r.new_value;
        if (b && r.field === "state") b.state = r.new_value;
      }
      r.status = status;
      r.resolved_by_user_id = u.id;
      r.resolved_at = new Date().toISOString();
      r.resolution_note = note?.trim() || null;
      return delay(r);
    },
    listTeam: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.teamMembers.filter((m) => m.owner_id === b.id));
    },
    // Replaced by ./accounts (the member gets an account behind it); kept so this module stays complete on its own.
    inviteMember: async (input) => {
      const b = ownOwnerBusiness();
      if (!input.name.trim() || !input.role.trim()) throw new Error("name_required");
      if (!validEmail(input.email)) throw new Error("invalid_email");
      const m: TeamMember = { id: newId(), owner_id: b.id, name: input.name.trim(), role: input.role.trim(), email: input.email.trim(), state: "invited", user_id: null };
      db.teamMembers.push(m);
      return delay(m);
    },
    makeOwner: async () => {
      throw new Error("not_implemented");
    },
  };

  // ---------- Business Bishop ----------
  const bishopOnly = () => {
    const u = me();
    if (u.role !== "bishop") throw new Error("bishop_only");
    return u;
  };
  const bishop: Pick<BishopRepository, "getPortfolio" | "listAgreements"> = {
    getPortfolio: async () => {
      const u = bishopOnly();
      const investments = db.investments
        .filter((i) => i.bishop_user_id === u.id)
        .map((i): BishopInvestment => {
          const series = db.recovery[i.id] ?? [];
          const recovered = series.filter((p) => p.actual !== null).at(-1)?.actual ?? 0;
          // The validated percentage once SM closed the validation of that business; the provisional split before.
          const validation = db.leads.find((l) => l.business_id === i.business_id)?.validation;
          const final = validation?.status === "closed" && validation.equity_bishop !== null;
          return {
            id: i.id, bishop_user_id: i.bishop_user_id, business_id: i.business_id, business_name: businessOf(i.business_id)?.name ?? "",
            invested: i.invested, invested_at: i.invested_at, recovered, recovered_pct: pct(recovered, i.invested),
            current_share_pct: final ? validation.equity_bishop! : bishopShareAt(i.invested_at, todayIso()),
            split_final: final,
            estimated_payback_month: estimatePaybackMonth(series, i.invested),
            franchises: db.franchises.filter((f) => f.franchisor_business_id === i.business_id).length,
            recovery: series,
            recovery_status: series.some((p) => p.actual !== null) ? "reporting" : "no_reports_yet",
          };
        });
      const invested = investments.reduce((a, i) => a + i.invested, 0);
      const recovered = investments.reduce((a, i) => a + i.recovered, 0);
      // As the API: the latest payback month, null when any investment is not recovering.
      const months = investments.map((i) => i.estimated_payback_month);
      const payback = months.length === 0 || months.some((m) => m === null) ? null : (months as string[]).sort().at(-1)!;
      const reporting = investments.some((i) => i.recovery_status === "reporting");
      return delay({
        investments,
        totals: { invested, recovered, recovered_pct: pct(recovered, invested), estimated_payback_month: payback, recovery_status: reporting ? "reporting" : "no_reports_yet", payback_window_months: 6 },
      });
    },
    listAgreements: async () => {
      const u = bishopOnly();
      return delay(db.agreements.filter((a) => a.bishop_user_id === u.id));
    },
  };

  // ---------- Franchisee ----------
  const myFranchise = (): Franchise => {
    const u = me();
    const f = u.role === "franchisee" ? db.franchises.find((x) => x.id === u.organization_id) : undefined;
    if (!f) throw new Error("franchisee_only");
    return f;
  };
  const franchisee: FranchiseeRepository = {
    getHome: async () => {
      const f = myFranchise();
      const tasks = db.franchiseTasks.filter((t) => t.franchise_id === f.id && !t.done).sort((a, b) => a.due_date.localeCompare(b.due_date));
      return delay({
        franchise: summarize(f),
        franchisor_name: businessOf(f.franchisor_business_id)?.name ?? "",
        manual_version: f.manual_version,
        manual_unread: tasks.some((t) => t.kind === "manual_read"),
        compliance_pct: compliancePct(f),
        next_report: reportsOf(f.id).filter((r) => r.status === "due").at(-1) ?? null,
        open_tickets: openTicketsOf(f.id),
        tasks,
        ...FEE_FIELDS,
        max_monthly_sales: MOCK_MAX_MONTHLY_SALES,
      });
    },
    listChecklist: async () => {
      const f = myFranchise();
      const kind = f.status === "operating" ? "standard" : "opening";
      return delay(db.checklist.filter((c) => c.franchise_id === f.id && c.kind === kind));
    },
    listTickets: async () => {
      const f = myFranchise();
      return delay(db.tickets.filter((t) => t.franchise_id === f.id).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    createTicket: async (input) => {
      const f = myFranchise();
      if (!input.subject.trim()) throw new Error("subject_required");
      if (!input.body.trim()) throw new Error("body_required");
      const last = Math.max(0, ...db.tickets.map((t) => Number(t.code.split("-")[1])));
      const ticket: SupportTicket = {
        id: newId(), code: `T-${last + 1}`, franchise_id: f.id, subject: input.subject.trim(), body: input.body.trim(), state: "open",
        created_by_user_id: me().id, created_at: nowIso(), response: null,
      };
      db.tickets.push(ticket);
      return delay(ticket);
    },
    listTasks: async () => {
      const f = myFranchise();
      return delay(db.franchiseTasks.filter((t) => t.franchise_id === f.id).sort((a, b) => a.due_date.localeCompare(b.due_date)));
    },
    setTaskDone: async (taskId, done) => {
      const f = myFranchise();
      const t = db.franchiseTasks.find((x) => x.id === taskId && x.franchise_id === f.id);
      if (!t) throw new Error("not_found");
      t.done = done;
      return delay(t);
    },
    listTeam: async () => {
      const f = myFranchise();
      return delay(db.teamMembers.filter((m) => m.owner_id === f.id));
    },
  };

  return { network, rules, catalog, franchises, manual, documents, financials, businessProfile, bishop, franchisee };
}
