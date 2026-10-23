// Types for the SM network (Global, offices), franchisors, franchises, Bishop and owner data.
// Same conventions as types.ts: snake_case, UUID string ids, ISO dates.
import type { AreaCode, BusinessStatus, IsoDate, IsoDateTime, Lead, LeadBand, LeadIndustry, LeadResult, LeadStage, OfficeStatus, Organization, ReviewClock, User, Uuid } from "./types";
import type { AssessmentAreaMap, MouAcknowledgmentPoint, OpportunityVisibility, SmEntities, SmEntity } from "./entry-types";

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
  /** Assessments (leads) received this month. */
  leads_this_month: number;
  /** Businesses that entered the program this month over the assessments received this month, in percent. Null with no assessments. */
  conversion_month: number | null;
  /** Businesses in the program that already meet the franchisability rules. */
  ready_to_franchise: number;
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

/** What SM Global gives to open an office. The manager gets an SM team account. */
export interface CreateOfficeInput {
  /** "SM Tampa": the name of the office, apart from its city. */
  name: string;
  /** "Tampa, FL". */
  city: string;
  manager_name: string;
  manager_email: string;
  planned_opening_date: IsoDate;
}

export type OfficeChecklistKey = "manager_access" | "booking_link" | "partner_firms" | "first_lead";

export interface OfficeChecklistItem {
  key: OfficeChecklistKey;
  done: boolean;
  /** partner_firms only: the areas that still have no firm. */
  missing_areas: AreaCode[];
}

/** Opening checklist, computed from the office data. The office can be activated only when it is complete. */
export interface OfficeChecklist {
  items: OfficeChecklistItem[];
  complete: boolean;
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
  /** Only for an office in opening; null otherwise. */
  checklist: OfficeChecklist | null;
}

export type StructureHealth = "red" | "amber" | "green" | "grey";

/** Facts of a structure node, by kind. Numbers and codes only: the screen writes the text. */
export type StructureDetail =
  | { kind: "office"; status: OfficeStatus; programs: number; ready_to_franchise: number; operating_franchises: number; city: string | null; manager_name: string | null; missing_areas: AreaCode[] }
  | { kind: "business"; status: BusinessStatus; program_day: number | null; consultant_name: string | null; owner_name: string | null }
  | { kind: "franchise"; status: FranchiseStatus; city: string; franchisee_name: string | null }
  | { kind: "firm"; area: AreaCode | null; overdue_tasks: number; specialty: string | null; contact_name: string | null }
  | { kind: "investor"; invested: number; share_pct: number };

export interface StructureNode {
  id: Uuid;
  /** An investor hangs from the business he funded; it is not part of the reporting line. */
  kind: "global" | "office" | "business" | "franchise" | "firm" | "investor";
  name: string;
  /** Office: worst of its programs. Business in program: worst of its areas. Firm: red with overdue tasks. Null where it does not apply. */
  health: StructureHealth | null;
  /** Business in program: franchisability reached and the value expected for its program day. */
  franchisability: { value: number; expected: number } | null;
  /** Null for the global node. */
  detail: StructureDetail | null;
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
  /** Same three numbers as OfficeStats, for the whole network. */
  leads_this_month: number;
  conversion_month: number | null;
  ready_to_franchise: number;
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
  /** Days SM has to review the entry documents, counted from the full upload. */
  document_review_days: number;
  /** Entry documents every owner uploads (to validate with Melany). */
  intake_documents: IntakeDocRule[];
  /**
   * USD the Bishop pays SM for one program (paid outside the app). Money is visible only to SM and Bishops:
   * the mock leaves it out of the rules it returns to owners, firms and franchisees.
   */
  program_amount?: number | undefined;
  /** Assessment block → areas whose tasks start as "A validar" when the block is strong (see lib/leads/prevalidation). */
  assessment_area_map?: AssessmentAreaMap | undefined;
  // Revised entry. Absent = the default of lib/leads/entry-flow (ENTRY_RULE_DEFAULTS).
  /** presented: a Bishop sees only the businesses SM presented to him. all: every approved business. */
  opportunity_visibility?: OpportunityVisibility | undefined;
  /** Nobody signs the Operating Agreement before this many days from the day it went out. */
  oa_waiting_days?: number | undefined;
  /** The Operating Agreement goes out only after the expansion meeting was held. */
  require_expansion_meeting?: boolean | undefined;
  /** The NDA (and the MOU) go out already signed by Strategic Mates with the office signature. */
  nda_auto_signed_by_sm?: boolean | undefined;
  /** Calendar v2: window where meetings can be scheduled. Absent = 09:00-18:00 America/New_York (lib/calendar). */
  meeting_hours?: MeetingHours | undefined;
  /** Who can enter the program. Absent = DEFAULT_ELIGIBILITY (lib/leads/readiness). */
  eligibility?: EligibilityRules | undefined;
  /** General note at the top of the entry documents list (the "Indicaciones para preparar la entrega"). */
  intake_help_text?: string | undefined;
  /** Names of the Strategic Mates companies that sign (Corporate and SM Square). Absent = DEFAULT_SM_ENTITIES. */
  sm_entities?: SmEntities | undefined;
  /** Bilingual contracts: the version that prevails if the Spanish and the English differ. Absent = English. */
  contracts?: { governing_language: ContractLanguage } | undefined;
}

/** Eligibility rules of the program (SM Global, Reglas). The year of operation stays a hard rule of the assessment. */
export interface EligibilityRules {
  /** Lowest annual revenue the owner declares in the assessment, in USD. Default 250,000. */
  min_annual_revenue: number;
}

/** Help of one entry document: what it is, what counts as that document, and a tip. */
export interface IntakeDocumentHelp {
  what: string;
  /** "Sirve:" list, one line each. */
  counts: string[];
  tip: string;
}

/** "HH:MM" start and end of the day, in an IANA time zone. */
export interface MeetingHours {
  start: string;
  end: string;
  timezone: string;
}

export interface IntakeDocRule {
  id: Uuid;
  name: string;
  required: boolean;
  /** Required only when the business is an LLC. */
  only_if_llc: boolean;
  /** Example of the verified fact the Bishop sees once SM accepts it. */
  verified_hint: string;
  archived: boolean;
  /** Shown to the owner and the consultant next to the document. Absent = no help yet. */
  help?: IntakeDocumentHelp | null | undefined;
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
  /** inactive: the account behind the member was deactivated. */
  state: "active" | "invited" | "inactive";
  /** Account behind the member (invited through the portal). Absent for people without an account. */
  user_id?: Uuid | null | undefined;
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
  /** Catalog tasks whose results feed this section. The section can be approved when all of them are approved. */
  catalog_codes: string[];
  /** What the section says: purpose and key steps, paragraphs separated by a blank line. Empty until the section is started. */
  body: string;
}

export interface ManualEvent {
  id: Uuid;
  business_id: Uuid;
  section_id: Uuid;
  section_title: string;
  kind: "approved";
  actor_user_id: Uuid;
  created_at: IsoDateTime;
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
  /** Section approvals, newest first. */
  activity: ManualEvent[];
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

/**
 * reviewed = accepted by SM. rejected = SM asked for another file. not_applicable = the owner says the document does
 * not apply to his business (with a reason); SM accepts it (reviewed) or asks for it anyway (rejected).
 */
export type DocumentState = "requested" | "received" | "reviewed" | "rejected" | "not_applicable";

export interface BusinessDocument {
  id: Uuid;
  business_id: Uuid;
  area: AreaCode | "diagnosis" | "closing" | "intake";
  name: string;
  state: DocumentState;
  requested_at: IsoDate;
  received_at: IsoDate | null;
  file_name: string | null;
  /** Entry documents only. */
  required?: boolean | undefined;
  rule_id?: Uuid | undefined;
  only_if_llc?: boolean | undefined;
  verified_hint?: string | undefined;
  /** Short fact SM writes when accepting it; the Bishop sees it. */
  verified_fact?: string | null | undefined;
  review_comment?: string | null | undefined;
  reviewed_at?: IsoDate | null | undefined;
  /** Intervals while SM waited for a replacement (they pause the review clock). */
  pauses?: { from: IsoDate; to: IsoDate | null }[] | undefined;
  /** Entry documents: the owner cannot upload it until he signs the MOU. */
  locked_until_mou?: boolean | undefined;
  /** not_applicable: why the owner says it does not apply (kept once SM accepts it, as the verified fact says). */
  not_applicable_reason?: string | null | undefined;
}

/** Same states DocuSeal reports. */
export type ContractState = "draft" | "sent" | "opened" | "signed" | "declined";

export type SignerStatus = "sent" | "opened" | "signed" | "declined";

/**
 * The visible signature: drawn on screen, typed (rendered in a script font) or an uploaded image. image_url is a
 * data URL in the mock; in production DocuSeal keeps it inside the sealed PDF together with the audit trail
 * (who, when, from which IP, document hash), which is what gives the signature its legal weight, not the drawing.
 */
export interface ContractSignature {
  /** saved: the person's signature kept in Mi perfil, used for this document. */
  kind: "drawn" | "typed" | "uploaded" | "saved";
  image_url: string;
}

/** Error codes of the signing and scheduling endpoints the screens read. */
export const SIGNING_ERROR_CODES = ["signature_not_saved", "calendar_not_connected"] as const;
export type SigningErrorCode = (typeof SIGNING_ERROR_CODES)[number];

/** The signature a person keeps in Mi perfil (GET /me/signature). */
export interface SavedSignature {
  kind: "drawn" | "typed" | "uploaded";
  image_url: string;
  updated_at: IsoDateTime;
}

/** PUT /me/signature: the stored file (context contract_signature) and how it was made. */
export interface SaveSignatureInput {
  file_id: Uuid;
  kind: "drawn" | "typed" | "uploaded";
}

/** POST /contracts/{id}/sign: a new signature (signature_file_id) or the saved one (use_saved_signature). */
export type SignContractRequest =
  & { consent: true; save_signature?: boolean | undefined }
  & ({ signature_file_id: Uuid; signature_kind?: "drawn" | "typed" | "uploaded" | undefined } | { use_saved_signature: true });

/** How signContract signs: the saved signature, or a new one (optionally saved for next time). */
export interface SignContractOptions {
  use_saved_signature?: boolean | undefined;
  save_signature?: boolean | undefined;
}

export interface Signer {
  name: string;
  role: string;
  signed_at: IsoDate | null;
  /** Entry contracts: who signs (owner, Strategic Mates or Bishop) and DocuSeal status with its history. */
  party?: "owner" | "sm" | "bishop" | undefined;
  user_id?: Uuid | null | undefined;
  status?: SignerStatus | undefined;
  history?: { status: SignerStatus; at: IsoDate }[] | undefined;
  decline_reason?: string | null | undefined;
  signature?: ContractSignature | null | undefined;
  /** MOU, owner: the points he confirmed with "Entendí" (all four are needed before signing). */
  acknowledgments?: MouAcknowledgmentPoint[] | null | undefined;
  /** SM signer of a contract created by a rule: the Strategic Mates company it signs for. */
  sm_entity?: SmEntity | null | undefined;
}

export interface Contract {
  id: Uuid;
  business_id: Uuid;
  area: AreaCode | "diagnosis" | "closing" | "intake";
  /**
   * Entry contracts. nda is Strategic Mates' NDA (SM pre-signed, the only NDA of the entry); tripartite is the
   * Operating Agreement (owner, SM and Bishop).
   */
  kind?: ContractKind | undefined;
  name: string;
  state: ContractState;
  sent_at: IsoDate | null;
  signed_at: IsoDate | null;
  signers: Signer[];
  /** What the contract means in plain words, in Spanish (kept one release; explainers.es replaces it). */
  explainer?: ContractExplainer | null | undefined;
  /** Full text in Spanish (kept one release; text.es replaces it). Absent = no text yet. */
  body?: string | null | undefined;
  /** Full text in both languages. en is null on contracts sent before the English versions. */
  text?: LocalizedContractText | undefined;
  /** The plain-words window in both languages; a missing language falls back to Spanish. */
  explainers?: LocalizedExplainers | undefined;
  /** The version that prevails if the two differ (the platform rule at the time it was sent). */
  language_governing?: ContractLanguage | undefined;
  /** The sealed PDF copies, one per language, once every party signed. null until then. */
  sealed_files?: SealedFiles | null | undefined;
  /** The entry contract rule that created it (EntryContractRule.code); absent on contracts older than the rules. */
  rule_code?: string | null | undefined;
  /** Last day to sign it (rules with deadline_days); absent = no deadline or not known. */
  sign_by?: IsoDate | null | undefined;
  /** The current person may sign it now (their part is pending and they are the right signer). Absent = unknown. */
  can_sign?: boolean | undefined;
  /** The owner signed and only Strategic Mates' signature is missing. */
  awaiting_sm_signature?: boolean | undefined;
  /** The current person's own part, when they are a party: signed or still pending. */
  my_signature?: "signed" | "pending" | null | undefined;
  /** Names of the parties that have not signed yet ("Strategic Mates Corporate"); from the signers when absent. */
  pending_parties?: string[] | undefined;
}

/** binding: the Acuerdo de Vinculación y Formalización (owner, Bishop and Strategic Mates). other: any other rule. */
export type ContractKind = "nda" | "mou" | "binding" | "tripartite" | "framework" | "other";

/** The plain-words window above a contract: a title, a few paragraphs and the key points. */
export interface ContractExplainer {
  title: string;
  paragraphs: string[];
  bullets: string[];
}

/** Every contract is written in Spanish and English. */
export type ContractLanguage = "es" | "en";

export interface LocalizedContractText {
  es: string;
  en: string | null;
}

export interface LocalizedExplainers {
  es: ContractExplainer | null;
  en: ContractExplainer | null;
}

/** One sealed PDF copy: its stored file and a presigned link that expires (it comes fresh with every read). */
export interface SealedFile {
  file_id: Uuid;
  download_url: string;
}

export interface SealedFiles {
  es: SealedFile | null;
  en: SealedFile | null;
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
  /** Readable name of the industry (Spanish / English). Absent in older rows: fall back to industry. */
  industry_label?: string | undefined;
  industry_label_en?: string | undefined;
  /** Fields SM already checked against the entry documents: only these are locked for the owner. */
  verified_fields?: VerifiedProfileField[] | undefined;
}

export type BusinessProfilePatch = Partial<Pick<BusinessProfile, "legal_name" | "address" | "city" | "state" | "phone" | "email" | "website" | "employees">>;

/**
 * Fields SM verified against the entry documents (articles of organization, licenses). Once the business is past
 * onboarding the owner cannot edit them: they ask SM for a change and SM applies it after checking the paperwork.
 */
export const VERIFIED_PROFILE_FIELDS = ["legal_name", "address", "city", "state"] as const;
export type VerifiedProfileField = (typeof VERIFIED_PROFILE_FIELDS)[number];

export type ProfileChangeStatus = "pending" | "applied" | "rejected";

export interface ProfileChangeRequest {
  id: Uuid;
  business_id: Uuid;
  field: VerifiedProfileField;
  current_value: string;
  new_value: string;
  /** Why it changed (new address, legal rename...). SM asks for the supporting document outside the app. */
  reason: string;
  status: ProfileChangeStatus;
  requested_by_user_id: Uuid;
  created_at: IsoDateTime;
  resolved_by_user_id: Uuid | null;
  resolved_at: IsoDateTime | null;
  resolution_note: string | null;
}

export interface ProfileChangeInput {
  field: VerifiedProfileField;
  new_value: string;
  reason: string;
}

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
  /**
   * Share of the franchisor result the Bishop receives today. Provisional (PROFIT_SPLIT) until SM closed the
   * validation of that business: then it is the validated percentage and split_final is true.
   */
  current_share_pct: number;
  split_final?: boolean | undefined;
  /** Month when the trailing 6-month pace recovers the whole investment; null if not recovering. */
  estimated_payback_month: IsoMonth | null;
  franchises: number;
  recovery: RecoveryPoint[];
  /**
   * Calendar v2: the SM consultant of the business, so the Bishop can schedule a meeting with him (a Bishop does
   * not see the office's people). Absent when the API does not send it: the portfolio then hides the action.
   */
  consultant?: { user_id: Uuid; name: string } | null | undefined;
}

export interface BishopPortfolio {
  investments: BishopInvestment[];
  totals: { invested: number; recovered: number; recovered_pct: number };
}

export type OpportunityDecision = "none" | "passed";

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

/**
 * Phase of an opportunity as one Bishop sees it. It is born from a lead once NDA and MOU are signed by both.
 * in_review: SM reviews the documents. available: approved, nobody took it. accepted_by_you: you took it.
 * in_contract: tripartite contract being signed. funds_pending: signed by the three, funds pending (Part 3).
 */
export const OPPORTUNITY_PHASES = ["in_review", "available", "accepted_by_you", "in_contract", "funds_pending"] as const;
export type OpportunityPhase = (typeof OPPORTUNITY_PHASES)[number];

export interface BishopOpportunity {
  /** Same as lead_id. */
  id: Uuid;
  lead_id: Uuid;
  phase: OpportunityPhase;
  industry: LeadIndustry;
  city: string;
  state: string;
  /** Commercial and owner names: only once this Bishop accepted it. Never the owner's contact. */
  business_name: string | null;
  owner_name: string | null;
  /** Program amount the Bishop pays SM (SM Global rule). */
  investment: number;
  /** Bishop share of the result in year 1 and once stabilized (provisional parameters). */
  share_year1_pct: number;
  share_stable_pct: number;
  score: number;
  band: LeadBand;
  /** Review clock while SM reviews the documents. */
  review: ReviewClock | null;
  decision: OpportunityDecision;
  decided_at: IsoDateTime | null;
  /** When SM presented this business to this Bishop ("Strategic Mates te presentó este negocio"); null otherwise. */
  presented_at?: IsoDateTime | null | undefined;
  /**
   * True once SM closed the validation: share_year1_pct and share_stable_pct are then the definitive participation of
   * the Bishop in the franchisor (the same number), not the provisional split.
   */
  split_final?: boolean | undefined;
}

export interface OpportunityVerifiedItem {
  name: string;
  /** Fact SM wrote when accepting the document; null = pending. */
  fact: string | null;
}

export interface OpportunityDetail extends BishopOpportunity {
  /** What the owner declared in the assessment (ranges, never the name before accepting). */
  declared: Omit<Lead["business"], "name">;
  /** Empty result (score 0, every block unknown) for a business added by hand that has no assessment yet. */
  result: LeadResult;
  know_how_example: string | null;
  verified: OpportunityVerifiedItem[];
  checklist: { nda_signed: boolean; mou_signed: boolean; required_total: number; uploaded: number; accepted: number; approved: boolean };
  projection: ProjectionYear[];
  /** After accepting: billing and tax files, read only. */
  files: { id: Uuid; name: string; file_name: string }[];
  /** Tripartite contract once SM sent it. */
  tripartite: Contract | null;
  /** The Acuerdo de Vinculación once it exists (only for the Bishop who took the business). */
  binding?: Contract | null | undefined;
}

/** What SM sees about the Bishops on one lead. */
export interface LeadInvestors {
  /** Bishops that opened the opportunity (with their answer). */
  views: { bishop_user_id: Uuid; name: string; viewed_at: IsoDateTime; decision: OpportunityDecision; decided_at: IsoDateTime | null }[];
  bishop: { user_id: Uuid; name: string; accepted_at: IsoDateTime } | null;
  tripartite: Contract | null;
  /** Bishops SM presented the business to ("Presentar a Bishops"), oldest first. */
  presented?: { bishop_user_id: Uuid; name: string; presented_at: IsoDateTime }[] | undefined;
  /** Who SM can present it to: active Bishops (framework_signed false = the framework agreement is still unsigned). */
  candidates?: { user_id: Uuid; name: string; framework_signed?: boolean | undefined }[] | undefined;
}

export type AgreementState = "draft" | "sent" | "signed";

export interface BishopAgreement {
  id: Uuid;
  /** framework: agreement with SM (confidentiality, non-circumvention). tripartite: program contract. */
  kind?: "framework" | "binding" | "tripartite" | "participation" | "nda" | undefined;
  /** Signable through DocuSeal (framework and tripartite). */
  contract?: Contract | undefined;
  bishop_user_id: Uuid;
  business_id: Uuid | null;
  name: string;
  counterparties: string;
  state: AgreementState;
  signed_at: IsoDate | null;
  /** The agreement document exists and can be opened. */
  has_file: boolean;
  file_name: string | null;
  /** The Bishop's own part, and who still has to sign ("Strategic Mates Corporate"). From the contract when absent. */
  my_signature?: "signed" | "pending" | null | undefined;
  pending_parties?: string[] | undefined;
}

// ---------- Bishop funds and distribution to the firms (visible only to SM and that Bishop) ----------

export const PAYMENT_METHODS = ["transfer", "wire", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Simulated upload: only the file name and size are kept (PDF or image). */
export interface Receipt {
  file_name: string;
  size_kb: number;
}

/**
 * A receipt the person attaches: the File picked in the input, or its `{ file_name, size_kb }` as the mock keeps it.
 * The HTTP adapters need the real File (they upload the bytes) and reject the placeholder with "invalid_file".
 */
export type ReceiptUpload = File | Receipt;

/** Pending: nothing confirmed. Partial: some confirmed, less than the total. Received: the total is confirmed. */
export type FundsStatus = "pending" | "partial" | "received";

/** One transfer from the Bishop to SM. Reported = the Bishop uploaded his receipt and SM has not confirmed it yet. */
export interface FundPayment {
  id: Uuid;
  business_id: Uuid;
  amount: number;
  paid_on: IsoDate;
  method: PaymentMethod;
  reference: string | null;
  receipt: Receipt | null;
  status: "reported" | "confirmed";
  reported_by: "sm" | "bishop";
  created_at: IsoDateTime;
  confirmed_at: IsoDateTime | null;
}

/** What the Bishop pays SM for one program. Exists once the tripartite contract is signed by the three. */
export interface BishopFunds {
  business_id: Uuid;
  lead_id: Uuid;
  business_name: string;
  bishop_user_id: Uuid;
  bishop_name: string;
  /** Program amount when the tripartite contract was signed (SM Global rule at that moment). */
  total: number;
  /** Sum of the confirmed payments. */
  received: number;
  /** Sum of the payments the Bishop reported and SM still has to confirm. */
  to_confirm: number;
  status: FundsStatus;
  /** Day the confirmed payments reached the total; null while they do not. */
  completed_on: IsoDate | null;
  /** Oldest first. */
  payments: FundPayment[];
  /** True once the program started (the funds are closed). */
  program_started: boolean;
}

export interface FundPaymentInput {
  amount: number;
  paid_on: IsoDate;
  method: PaymentMethod;
  reference: string | null;
  receipt: ReceiptUpload | null;
}

/** One-time payment, installments with dates, or milestones described with a short text. */
export type PaymentPlanKind = "one_time" | "installments" | "milestones";

export interface DistributionPayment {
  id: Uuid;
  amount: number;
  /** One-time and installments: due date. Milestones: optional. */
  due_on: IsoDate | null;
  /** Milestones only. */
  milestone: string | null;
  status: "pending" | "paid";
  paid_on: IsoDate | null;
  method: PaymentMethod | null;
  reference: string | null;
  receipt: Receipt | null;
  /** Computed by the data layer: pending with a due date already past. */
  overdue: boolean;
}

/** What SM pays one partner firm of the business, or keeps for itself (organization_id null = orchestration). */
export interface DistributionLine {
  /** `${business_id}:${organization_id ?? "sm"}`: one line per firm. */
  id: string;
  business_id: Uuid;
  organization_id: Uuid | null;
  /** Firm name, or null for Strategic Mates (orchestration). The screen writes the label. */
  firm_name: string | null;
  /** Areas the firm works on in this business. */
  areas: AreaCode[];
  /** Null while nothing is assigned to this line. */
  kind: PaymentPlanKind | null;
  amount: number;
  paid: number;
  payments: DistributionPayment[];
}

export interface Distribution {
  business_id: Uuid;
  business_name: string;
  /** Funds received (confirmed). The lines can never add up to more. */
  received: number;
  assigned: number;
  unassigned: number;
  paid: number;
  overdue_count: number;
  lines: DistributionLine[];
}

export interface DistributionPaymentInput {
  amount: number;
  due_on: IsoDate | null;
  milestone: string | null;
}

export interface DistributionLineInput {
  organization_id: Uuid | null;
  kind: PaymentPlanKind;
  payments: DistributionPaymentInput[];
}

export interface MarkPaidInput {
  paid_on: IsoDate;
  method: PaymentMethod;
  reference: string | null;
  receipt: ReceiptUpload | null;
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
