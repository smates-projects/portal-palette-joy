// In-memory implementation of the network repositories (SM Global, franchises, manual, owner data, Bishop,
// franchisee). Like the rest of the mock layer it filters by the current user to simulate API authorization.
import { TODAY, nowIso } from "@/config/app";
import { PROFIT_SPLIT } from "@/config/economics";
import { bishopShareAt, estimatePaybackMonth } from "@/lib/bishop/split";
import { computeReportAmounts, nextMonth, previousMonth } from "@/lib/franchise/fees";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { areaHealth, AREAS } from "@/lib/tasks/owner";
import { withComputed } from "../computed";
import { computeFranchisability } from "../franchisability";
import { AREA_BY_KEY, addDaysIso } from "../program";
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
  type FinancialSeries,
  type Franchise,
  type FranchiseReport,
  type FranchiseSummary,
  type FranchiseTask,
  type Lead,
  type LeadStage,
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
  type StructureNode,
  type SupportTicket,
  type Task,
  type TaskVersion,
  type TeamMember,
  type User,
  type Uuid,
} from "../types";

export interface BishopOpportunityRecord {
  id: Uuid;
  bishop_user_id: Uuid;
  business_id: Uuid;
  investment: number;
  ready_date: string;
  summary: string;
  projection: ProjectionYear[];
  decision: OpportunityDecision;
  decided_at: string | null;
}

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
  documents: BusinessDocument[];
  contracts: Contract[];
  financials: FinancialSeries[];
  profiles: BusinessProfile[];
  teamMembers: TeamMember[];
  investments: BishopInvestmentRecord[];
  recovery: Record<Uuid, RecoveryPoint[]>;
  opportunities: BishopOpportunityRecord[];
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
  "network" | "rules" | "catalog" | "franchises" | "manual" | "documents" | "financials" | "businessProfile" | "bishop" | "franchisee"
>;

const MANUAL_SECTION_TITLES = ["Ventas", "Operación", "Compras", "Atención al cliente", "Administración", "Personas"];
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
    };
  };

  const officeStats = (office: Organization, all: ReturnType<typeof computedTasks>): OfficeStats => {
    const biz = db.businesses.filter((b) => b.office_id === office.id);
    const programs = biz.filter((b) => b.status === "in_program");
    const ids = new Set(biz.map((b) => b.id));
    const tasks = all.filter((t) => ids.has(t.business_id) && t.status !== "cancelled");
    const matrix = buildNetworkMatrix(tasks, db.versions, programs, TODAY, db.rules.area_amber_days);
    return {
      programs: programs.length,
      franchisors: biz.length - programs.length,
      franchises: db.franchises.filter((f) => ids.has(f.franchisor_business_id)).length,
      partner_firms: db.orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === office.id).length,
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
  const network: NetworkRepository = {
    getSummary: async () => {
      globalOnly();
      const offices = db.orgs.filter((o) => o.kind === "sm");
      const all = computedTasks();
      const month = previousMonth(TODAY.slice(0, 7));
      const sums = offices.map((o) => officeStats(o, all));
      const sum = (pick: (s: OfficeStats) => number) => sums.reduce((a, s) => a + pick(s), 0);
      const reports = reportedIn(month);
      return delay({
        offices: offices.length,
        programs: sum((s) => s.programs),
        franchisors: sum((s) => s.franchisors),
        franchises: sum((s) => s.franchises),
        partner_firms: sum((s) => s.partner_firms),
        open_leads: sum((s) => s.open_leads),
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
      const biz = db.businesses.filter((b) => b.office_id === id);
      const matrix = buildNetworkMatrix(all.filter((t) => t.status !== "cancelled"), db.versions, biz, TODAY, db.rules.area_amber_days);
      const businesses: OfficeBusinessRow[] = biz.map((b) => ({
        business_id: b.id,
        name: b.name,
        status: b.status,
        program_day: b.program_day,
        health: b.status === "franchisor" ? "grey" : matrix.find((r) => r.business.id === b.id)?.health ?? "grey",
        franchisability_pct: franchisabilityOf(b).franchisability_pct,
        franchises: db.franchises.filter((f) => f.franchisor_business_id === b.id).length,
      }));
      return delay({
        ...officeSummary(office, all),
        businesses,
        firms: db.orgs.filter((o) => o.kind === "partner_firm" && o.parent_id === id),
        team: db.users.filter((x) => x.role === "sm_team" && x.organization_id === id),
      });
    },
    getStructure: async () => {
      globalOnly();
      const global = db.orgs.find((o) => o.kind === "sm_global");
      if (!global) throw new Error("not_found");
      const offices = db.orgs.filter((o) => o.kind === "sm" && o.parent_id === global.id).sort((a, b) => a.name.localeCompare(b.name));
      const officeNode = (o: Organization): StructureNode => {
        const businessNodes = db.businesses
          .filter((b) => b.office_id === o.id)
          .map((b): StructureNode => ({
            id: b.id, kind: "business", name: b.name, detail: b.status === "franchisor" ? b.city : `${b.city} · ${b.program_day}`,
            children: db.franchises.filter((f) => f.franchisor_business_id === b.id).map((f): StructureNode => ({ id: f.id, kind: "franchise", name: f.name, detail: f.status, children: [] })),
          }));
        const firmNodes = db.orgs
          .filter((x) => x.kind === "partner_firm" && x.parent_id === o.id)
          .map((x): StructureNode => ({ id: x.id, kind: "firm", name: x.name, detail: x.area, children: [] }));
        return { id: o.id, kind: "office", name: o.name, detail: o.city, children: [...businessNodes, ...firmNodes] };
      };
      return delay({
        root: { id: global.id, kind: "global", name: global.name, detail: global.city, children: offices.map(officeNode) },
        counts: {
          offices: offices.length,
          businesses: db.businesses.filter((b) => b.status === "in_program").length,
          franchisors: db.businesses.filter((b) => b.status === "franchisor").length,
          franchises: db.franchises.length,
          firms: db.orgs.filter((o) => o.kind === "partner_firm").length,
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
        const red = [...programIds].filter((id) => areaHealth(inArea.filter((t) => t.business_id === id), db.versions, TODAY, db.rules.area_amber_days) === "red").length;
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
  };

  // ---------- Rules ----------
  const rules: RulesRepository = {
    get: async () => delay(db.rules),
    update: async (patch, note = null) => {
      globalOnly();
      const next: PlatformRules = { ...db.rules, ...patch };
      if (!Number.isInteger(next.franchisability_goal) || next.franchisability_goal < 1 || next.franchisability_goal > 100) throw new Error("invalid_goal");
      if (!Number.isInteger(next.area_amber_days) || next.area_amber_days < 1) throw new Error("invalid_amber_days");
      if (!Number.isInteger(next.franchisability_amber_tolerance) || next.franchisability_amber_tolerance < 0 || next.franchisability_amber_tolerance > 100) throw new Error("invalid_tolerance");
      const known = new Set(db.catalog.filter((c) => !c.archived).map((c) => c.code));
      if (new Set(next.required_task_codes).size !== next.required_task_codes.length || next.required_task_codes.some((c) => !known.has(c))) throw new Error("unknown_task_code");
      const fields = Object.keys(next) as (keyof PlatformRules)[];
      const changes = fields.filter((f) => !sameJson(db.rules[f], next[f])).map((field) => ({ field, from: db.rules[field], to: next[field] }));
      if (changes.length > 0) {
        db.rulesHistory.push({ id: newId(), actor_user_id: me().id, created_at: nowIso(), changes, note: note?.trim() || null });
        db.rules = next;
      }
      return delay(db.rules);
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
      const month = previousMonth(TODAY.slice(0, 7));
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
        db.manualSections.push(...MANUAL_SECTION_TITLES.map((title): ManualSection => ({ id: newId(), business_id: b.id, title, pct: 0, status: "not_started", updated_at: TODAY, published_in: null })));
      const sections = db.manualSections.filter((s) => s.business_id === b.id);
      const versions = db.manualVersions.filter((v) => v.business_id === b.id).sort((x, y) => y.published_at.localeCompare(x.published_at) || y.version.localeCompare(x.version, undefined, { numeric: true }));
      return delay({
        business_id: b.id,
        sections,
        versions,
        current_version: versions[0]?.version ?? null,
        completion_pct: average(sections.map((s) => s.pct)),
        franchises_following: me().role === "franchisee" ? 0 : db.franchises.filter((f) => f.franchisor_business_id === b.id).length,
      });
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
        id: newId(), business_id: businessId, version, published_at: TODAY, note: input.note.trim(),
        published_by_user_id: me().id, section_titles: sections.map((s) => s.title),
      };
      db.manualVersions.push(published);
      for (const s of sections) {
        s.published_in = version;
        s.updated_at = TODAY;
      }
      // It flows down: every franchise follows the new version and gets a task to read what changed.
      for (const f of db.franchises.filter((x) => x.franchisor_business_id === businessId)) {
        f.manual_version = version;
        db.franchiseTasks.push({ id: newId(), franchise_id: f.id, kind: "manual_read", title: `Leer el manual ${version}: ${published.section_titles.join(", ")}`, due_date: addDaysIso(TODAY, 7), done: false });
      }
      return delay(published);
    },
  };

  // ---------- Documents, financials, business profile ----------
  const businessIdsInScope = (businessId?: Uuid) => (businessId ? [pickBusiness(businessId).id] : readableBusinesses().map((b) => b.id));
  const documents: DocumentsRepository = {
    listDocuments: async (businessId) => {
      const ids = new Set(businessIdsInScope(businessId));
      return delay(db.documents.filter((d) => ids.has(d.business_id)));
    },
    listContracts: async (businessId) => {
      const ids = new Set(businessIdsInScope(businessId));
      return delay(db.contracts.filter((c) => ids.has(c.business_id)));
    },
    uploadDocument: async (documentId, fileName) => {
      const b = ownOwnerBusiness();
      const d = db.documents.find((x) => x.id === documentId && x.business_id === b.id);
      if (!d) throw new Error("not_found");
      if (d.state !== "requested") throw new Error("invalid_state");
      if (!fileName.trim()) throw new Error("file_required");
      Object.assign(d, { state: "received", received_at: TODAY, file_name: fileName.trim() });
      return delay(d);
    },
  };
  const financials: FinancialsRepository = {
    get: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.financials.find((f) => f.business_id === b.id) ?? null);
    },
  };
  const businessProfile: BusinessProfileRepository = {
    get: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.profiles.find((p) => p.business_id === b.id) ?? null);
    },
    update: async (patch) => {
      const b = ownOwnerBusiness();
      const p = db.profiles.find((x) => x.business_id === b.id);
      if (!p) throw new Error("not_found");
      if (patch.email !== undefined && !validEmail(patch.email)) throw new Error("invalid_email");
      if (patch.legal_name !== undefined && !patch.legal_name.trim()) throw new Error("name_required");
      if (patch.employees !== undefined && (!Number.isInteger(patch.employees) || patch.employees < 0)) throw new Error("invalid_employees");
      Object.assign(p, patch);
      return delay(p);
    },
    listTeam: async (businessId) => {
      const b = pickBusiness(businessId);
      return delay(db.teamMembers.filter((m) => m.owner_id === b.id));
    },
    inviteMember: async (input) => {
      const b = ownOwnerBusiness();
      if (!input.name.trim() || !input.role.trim()) throw new Error("name_required");
      if (!validEmail(input.email)) throw new Error("invalid_email");
      const m: TeamMember = { id: newId(), owner_id: b.id, name: input.name.trim(), role: input.role.trim(), email: input.email.trim(), state: "invited" };
      db.teamMembers.push(m);
      return delay(m);
    },
  };

  // ---------- Business Bishop ----------
  const bishopOnly = () => {
    const u = me();
    if (u.role !== "bishop") throw new Error("bishop_only");
    return u;
  };
  const toOpportunity = (o: BishopOpportunityRecord): BishopOpportunity => {
    const b = businessOf(o.business_id)!;
    const f = franchisabilityOf(b);
    return {
      id: o.id, business_id: b.id, business_name: b.name, industry: b.industry, city: b.city, state: b.state,
      stage: f.is_ready ? "ready" : "preparing", investment: o.investment,
      share_year1_pct: Math.round(PROFIT_SPLIT.bishop_year1 * 100), share_stable_pct: Math.round(PROFIT_SPLIT.bishop_stabilized * 100),
      ready_date: o.ready_date, franchisability_pct: f.franchisability_pct, program_day: b.program_day, summary: o.summary,
      decision: o.decision, decided_at: o.decided_at,
    };
  };
  const myOpportunity = (id: Uuid) => {
    const u = bishopOnly();
    const o = db.opportunities.find((x) => x.id === id && x.bishop_user_id === u.id);
    if (!o) throw new Error("not_found");
    return o;
  };
  const decide = (id: Uuid, decision: OpportunityDecision) => {
    const o = myOpportunity(id);
    o.decision = decision;
    o.decided_at = decision === "none" ? null : nowIso();
    return toOpportunity(o);
  };
  const bishop: BishopRepository = {
    getPortfolio: async () => {
      const u = bishopOnly();
      const investments = db.investments
        .filter((i) => i.bishop_user_id === u.id)
        .map((i): BishopInvestment => {
          const series = db.recovery[i.id] ?? [];
          const recovered = series.filter((p) => p.actual !== null).at(-1)?.actual ?? 0;
          return {
            id: i.id, bishop_user_id: i.bishop_user_id, business_id: i.business_id, business_name: businessOf(i.business_id)?.name ?? "",
            invested: i.invested, invested_at: i.invested_at, recovered, recovered_pct: pct(recovered, i.invested),
            current_share_pct: bishopShareAt(i.invested_at, TODAY),
            estimated_payback_month: estimatePaybackMonth(series, i.invested),
            franchises: db.franchises.filter((f) => f.franchisor_business_id === i.business_id).length,
            recovery: series,
          };
        });
      const invested = investments.reduce((a, i) => a + i.invested, 0);
      const recovered = investments.reduce((a, i) => a + i.recovered, 0);
      return delay({ investments, totals: { invested, recovered, recovered_pct: pct(recovered, invested) } });
    },
    listOpportunities: async () => {
      const u = bishopOnly();
      return delay(db.opportunities.filter((o) => o.bishop_user_id === u.id).map(toOpportunity));
    },
    getOpportunity: async (id) => {
      const u = bishopOnly();
      const o = db.opportunities.find((x) => x.id === id && x.bishop_user_id === u.id);
      return delay(o ? { ...toOpportunity(o), projection: o.projection } : null);
    },
    expressInterest: async (id) => delay(decide(id, "interested")),
    pass: async (id) => delay(decide(id, "passed")),
    clearDecision: async (id) => delay(decide(id, "none")),
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
