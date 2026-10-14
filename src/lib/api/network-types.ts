// Types for the SM network (Global, offices), franchisors, franchises, Bishop and owner data.
// Same conventions as types.ts: snake_case, UUID string ids, ISO dates.
import type { AreaCode, IsoDate, IsoDateTime, LeadStage, Organization, User, Uuid } from "./types";

/** Month as YYYY-MM. */
export type IsoMonth = string;

// ---------- SM Global: offices, structure, bottlenecks ----------

export interface OfficeStats {
  /** Businesses still in the 180-day program. */
  programs: number;
  /** Businesses that finished the program and now franchise (status franchisor). */
  franchisors: number;
  franchises: number;
  partner_firms: number;
  open_leads: number;
  open_tasks: number;
  overdue_tasks: number;
  /** Business health counts (worst of its areas). Franchisors are not counted: they have no program. */
  health: { red: number; amber: number; green: number };
}

export interface OfficeSummary {
  office: Organization;
  manager: User | null;
  stats: OfficeStats;
}

export interface OfficeBusinessRow {
  business_id: Uuid;
  name: string;
  status: "in_program" | "franchisor";
  program_day: number;
  health: "red" | "amber" | "green" | "grey";
  franchisability_pct: number;
  franchises: number;
}

export interface OfficeDetail extends OfficeSummary {
  businesses: OfficeBusinessRow[];
  firms: Organization[];
  team: User[];
}

export interface StructureNode {
  id: Uuid;
  kind: "global" | "office" | "business" | "franchise" | "firm";
  name: string;
  /** Short extra line: city, area, status. */
  detail: string | null;
  children: StructureNode[];
}

export interface StructureTree {
  root: StructureNode;
  counts: { offices: number; businesses: number; franchisors: number; franchises: number; firms: number };
}

export interface AreaBottleneck {
  area: AreaCode;
  open: number;
  overdue: number;
  blocked: number;
  /** Deliverables waiting for the owner. */
  waiting_owner: number;
  /** Businesses with this area in red. */
  red_businesses: number;
  by_office: { office_id: Uuid; office_name: string; open: number; overdue: number }[];
}

export interface NetworkSummary {
  offices: number;
  programs: number;
  franchisors: number;
  franchises: number;
  partner_firms: number;
  open_leads: number;
  overdue_tasks: number;
  /** Last closed month (2026-09): sales reported by franchises and royalties due. */
  last_month: IsoMonth;
  franchise_sales_last_month: number;
  royalties_last_month: number;
}

export interface NetworkFunnel {
  stages: { stage: LeadStage; count: number }[];
  by_office: { office_id: Uuid; office_name: string; stages: { stage: LeadStage; count: number }[] }[];
}

// ---------- SM Global: platform rules and catalog admin ----------

export interface PlatformRules {
  /** Franchisability goal in percent. */
  franchisability_goal: number;
  required_task_codes: string[];
  /** A deliverable waiting for the owner more than this many days (or a task due within it) turns an area amber. */
  area_amber_days: number;
  /** Progress this many points below the expected line turns a business amber. */
  franchisability_amber_tolerance: number;
}

export interface RulesChange {
  id: Uuid;
  actor_user_id: Uuid;
  created_at: IsoDateTime;
  /** Only the fields that changed. */
  changes: { field: keyof PlatformRules; from: PlatformRules[keyof PlatformRules]; to: PlatformRules[keyof PlatformRules] }[];
  note: string | null;
}

export interface CatalogAdminItem {
  code: string;
  /** Catalog area key: estr, proc, fin, tec, marca, legal. */
  area: string;
  area_code: AreaCode;
  name: string;
  owner: string;
  support: string;
  applies: string;
  priority: string;
  acceptance: string;
  start_day: number | null;
  due_day: number | null;
  archived: boolean;
  updated_at: IsoDateTime;
}

/** What SM Global can set when adding or editing an entry. The code is generated on add. */
export interface CatalogItemInput {
  area_code: AreaCode;
  name: string;
  owner: string;
  support: string;
  applies: string;
  priority: string;
  acceptance: string;
  start_day: number | null;
  due_day: number | null;
}

export interface CatalogChange {
  id: Uuid;
  code: string;
  kind: "added" | "edited" | "archived" | "restored";
  actor_user_id: Uuid;
  created_at: IsoDateTime;
  changes: { field: keyof CatalogItemInput; from: string | number | null; to: string | number | null }[];
  note: string | null;
}

// ---------- Franchises ----------

export type FranchiseStatus = "opening" | "operating";

/** A franchise unit. Its id is also the id of its Organization (kind "franchise"). */
export interface Franchise {
  id: Uuid;
  franchisor_business_id: Uuid;
  name: string;
  franchisee_user_id: Uuid;
  city: string;
  state: string;
  status: FranchiseStatus;
  /** Opening date (past if operating, planned if opening). */
  opening_date: IsoDate;
  /** Manual version this unit follows. */
  manual_version: string;
}

export interface FranchiseSummary extends Franchise {
  franchisee_name: string;
  /** Share of standards met (operating) or opening checklist done (opening), 0-100. */
  compliance_pct: number;
  open_tickets: number;
  last_report: FranchiseReport | null;
  /** Sales of the last submitted month, null if none yet. */
  last_sales: number | null;
}

export type ReportStatus = "due" | "submitted" | "paid";

/** Monthly sales report of a franchise. Fees are computed when it is submitted (see lib/franchise/fees.ts). */
export interface FranchiseReport {
  id: Uuid;
  franchise_id: Uuid;
  month: IsoMonth;
  due_date: IsoDate;
  status: ReportStatus;
  gross_sales: number | null;
  royalty_amount: number | null;
  marketing_fund_amount: number | null;
  /** royalty + marketing fund. */
  total_due: number | null;
  submitted_at: IsoDateTime | null;
  paid_at: IsoDate | null;
}

export interface SubmitReportInput {
  month: IsoMonth;
  gross_sales: number;
}

export interface ChecklistItem {
  id: Uuid;
  franchise_id: Uuid;
  kind: "standard" | "opening";
  item: string;
  ok: boolean;
}

export type TicketState = "open" | "answered" | "closed";

export interface SupportTicket {
  id: Uuid;
  /** Human code shown in lists, e.g. T-118. */
  code: string;
  franchise_id: Uuid;
  subject: string;
  body: string;
  state: TicketState;
  created_by_user_id: Uuid;
  created_at: IsoDateTime;
  /** Franchisor answer, null until answered. */
  response: string | null;
}

export interface FranchiseTask {
  id: Uuid;
  franchise_id: Uuid;
  kind: "report" | "audit" | "manual_read" | "other";
  title: string;
  due_date: IsoDate;
  done: boolean;
}

export interface TeamMember {
  id: Uuid;
  /** Business or franchise the person belongs to. */
  owner_id: Uuid;
  name: string;
  role: string;
  email: string | null;
  state: "active" | "invited";
}

export interface FranchiseDetail {
  franchise: FranchiseSummary;
  franchisee: User;
  reports: FranchiseReport[];
  checklist: ChecklistItem[];
  tickets: SupportTicket[];
  tasks: FranchiseTask[];
  team: TeamMember[];
}

/** Franchisor home numbers. Sums are over the franchises of one franchisor. */
export interface FranchisorSummary {
  business_id: Uuid;
  franchises: number;
  operating: number;
  opening: number;
  last_month: IsoMonth;
  sales_last_month: number;
  royalties_last_month: number;
  marketing_fund_last_month: number;
  open_tickets: number;
  reports_due: number;
  manual_version: string | null;
}

// ---------- Manual (the franchisor's "encyclopedia") ----------

export type ManualSectionStatus = "not_started" | "drafting" | "in_review" | "approved";

export interface ManualSection {
  id: Uuid;
  business_id: Uuid;
  title: string;
  pct: number;
  status: ManualSectionStatus;
  updated_at: IsoDate;
  /** Version in which this section was last published to the franchises. */
  published_in: string | null;
}

export interface ManualVersion {
  id: Uuid;
  business_id: Uuid;
  version: string;
  published_at: IsoDate;
  note: string;
  published_by_user_id: Uuid | null;
  section_titles: string[];
}

export interface ManualOverview {
  business_id: Uuid;
  sections: ManualSection[];
  /** Newest first. */
  versions: ManualVersion[];
  current_version: string | null;
  /** Average of section percentages. */
  completion_pct: number;
  /** Franchises that follow this manual (only visible to the franchisor, SM and Global). */
  franchises_following: number;
}

export interface PublishManualInput {
  note: string;
  section_ids: Uuid[];
}

// ---------- Documents, contracts, financials, business profile ----------

export type DocumentState = "requested" | "received" | "reviewed";

export interface BusinessDocument {
  id: Uuid;
  business_id: Uuid;
  area: AreaCode | "diagnosis" | "closing";
  name: string;
  state: DocumentState;
  requested_at: IsoDate;
  received_at: IsoDate | null;
  file_name: string | null;
}

/** Same states DocuSeal reports. */
export type ContractState = "draft" | "sent" | "opened" | "signed" | "declined";

export interface Signer {
  name: string;
  role: string;
  signed_at: IsoDate | null;
}

export interface Contract {
  id: Uuid;
  business_id: Uuid;
  area: AreaCode | "diagnosis" | "closing";
  name: string;
  state: ContractState;
  sent_at: IsoDate | null;
  signed_at: IsoDate | null;
  signers: Signer[];
}

export interface FinancialChange {
  metric: string;
  before: string;
  now: string;
}

export interface FinancialSeries {
  business_id: Uuid;
  months: IsoMonth[];
  revenue: number[];
  /** Net margin in percent, same length as months. */
  margin_pct: number[];
  cash: number[];
  /** "Antes y ahora" of the program. */
  changes: FinancialChange[];
}

export interface BusinessProfile {
  business_id: Uuid;
  legal_name: string;
  industry: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  website: string | null;
  years_operating: number;
  employees: number;
}

export type BusinessProfilePatch = Partial<Pick<BusinessProfile, "legal_name" | "address" | "city" | "state" | "phone" | "email" | "website" | "employees">>;

export interface InviteMemberInput {
  name: string;
  role: string;
  email: string;
}

// ---------- Business Bishop ----------

export interface RecoveryPoint {
  month: IsoMonth;
  /** Cumulative amount returned to the Bishop, as projected in the agreement. */
  projected: number;
  /** Cumulative amount really returned; null for future months. */
  actual: number | null;
}

export interface BishopInvestment {
  id: Uuid;
  bishop_user_id: Uuid;
  business_id: Uuid;
  business_name: string;
  invested: number;
  invested_at: IsoDate;
  /** Returned so far (last actual point of the series). */
  recovered: number;
  recovered_pct: number;
  /** Share of the franchisor result the Bishop receives today (see PROFIT_SPLIT, provisional). */
  current_share_pct: number;
  /** Month when the trailing 6-month pace recovers the whole investment; null if not recovering. */
  estimated_payback_month: IsoMonth | null;
  franchises: number;
  recovery: RecoveryPoint[];
}

export interface BishopPortfolio {
  investments: BishopInvestment[];
  totals: { invested: number; recovered: number; recovered_pct: number };
}

export type OpportunityDecision = "none" | "interested" | "passed";

export interface ProjectionYear {
  year: number;
  franchises: number;
  revenue: number;
  /** Franchisor result before splitting. */
  result: number;
  bishop: number;
  /** SM share, from year 2. */
  sm: number;
}

export interface BishopOpportunity {
  id: Uuid;
  business_id: Uuid;
  business_name: string;
  industry: string;
  city: string;
  state: string;
  /** preparing: still in the program. ready: franchisability reached. */
  stage: "preparing" | "ready";
  investment: number;
  /** Bishop share of the result in year 1 and once stabilized (provisional parameters). */
  share_year1_pct: number;
  share_stable_pct: number;
  ready_date: IsoDate;
  franchisability_pct: number;
  program_day: number;
  summary: string;
  decision: OpportunityDecision;
  decided_at: IsoDateTime | null;
}

export interface OpportunityDetail extends BishopOpportunity {
  projection: ProjectionYear[];
}

export type AgreementState = "draft" | "sent" | "signed";

export interface BishopAgreement {
  id: Uuid;
  bishop_user_id: Uuid;
  business_id: Uuid | null;
  name: string;
  counterparties: string;
  state: AgreementState;
  signed_at: IsoDate | null;
}

// ---------- Franchisee ----------

export interface FranchiseeHome {
  franchise: FranchiseSummary;
  franchisor_name: string;
  manual_version: string;
  /** A newer manual version was published after the last one this unit read. */
  manual_unread: boolean;
  compliance_pct: number;
  next_report: FranchiseReport | null;
  open_tickets: number;
  /** Open tasks, soonest first. */
  tasks: FranchiseTask[];
}
