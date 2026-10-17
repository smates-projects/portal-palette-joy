// Shapes mirror the Laravel REST API: snake_case, UUID string ids, ISO dates.

export type Uuid = string;
export type IsoDate = string; // YYYY-MM-DD
export type IsoDateTime = string;

export type AreaCode = "B1" | "B2" | "B3" | "B4" | "B5" | "B6";
export type TaskStep = "survey" | "design" | "implement" | "validate" | "document";

export type VisibleTaskStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "changes_requested"
  | "accepted";
export type HiddenTaskStatus = "proposed" | "excluded" | "with_third_party" | "cancelled";
export type TaskStatus = VisibleTaskStatus | HiddenTaskStatus;

/**
 * sm_global: SM headquarters (sees the whole network). bishop: Business Bishop, an investor who funds a
 * business ready to franchise in exchange for an equity share. franchisee: runs one franchise unit.
 * The franchisor is not a role: it is a business_owner whose business has status "franchisor".
 */
export type UserRole = "partner_firm" | "business_owner" | "sm_team" | "sm_global" | "bishop" | "franchisee";

export type OrganizationKind = "partner_firm" | "sm" | "sm_global" | "franchise";
export type OfficeStatus = "opening" | "operating" | "paused";
/** onboarding: NDA and MOU sent, still entering (no program yet). */
export type BusinessStatus = "onboarding" | "in_program" | "franchisor";

export interface Organization {
  id: Uuid;
  name: string;
  /** sm = an SM office. A franchise unit is an Organization too (its id is the Franchise id). */
  kind: OrganizationKind;
  area: AreaCode | null;
  /** What the firm does, shown to owners and SM. */
  specialty: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  /** SM offices: booking link used when the assigned consultant has none. */
  default_booking_url?: string | null;
  /** Partner firm: its SM office. SM office: SM Global. */
  parent_id?: Uuid | null;
  /** SM offices only. */
  status?: OfficeStatus | null;
  /** Opening date: planned while the office is in opening, the real one once it operates. */
  opened_at?: IsoDate | null;
  /** Why SM Global paused the office; null when it is not paused. */
  pause_reason?: string | null;
  manager_user_id?: Uuid | null;
  /** Franchise units only: the franchisor business they belong to. */
  franchisor_business_id?: Uuid | null;
}

export interface User {
  id: Uuid;
  full_name: string;
  email: string;
  role: UserRole;
  organization_id: Uuid | null;
  business_id: Uuid | null;
  title: string | null;
  /** Simulated Google Calendar link used to send meeting invites. */
  google_calendar_email: string | null;
  /** SM team: personal booking link (Google Calendar, Calendly...). Set in Mi perfil. */
  booking_url: string | null;
  /** SM office admin (or SM Global admin): the only ones who give "Aprobar documentación". */
  is_admin?: boolean | undefined;
}

export interface Business {
  id: Uuid;
  name: string;
  industry: string;
  city: string;
  state: string;
  owner_user_id: Uuid;
  /** in_program: running the 180 days. franchisor: finished it and now franchises. */
  status: BusinessStatus;
  program_start_date: IsoDate;
  program_day: number;
  /** SM office that runs this program (phase 1: only SM Miami). Scope for the SM team. */
  office_id: Uuid;
  /** SM consultant assigned to this business (inherited from the lead when the contract is signed). */
  consultant_id: Uuid | null;
}

/** Business activity: changes made by the SM team (phase 1: consultant reassignment). */
export interface BusinessEvent {
  id: Uuid;
  business_id: Uuid;
  kind: "consultant_changed";
  actor_user_id: Uuid;
  from_user_id: Uuid | null;
  to_user_id: Uuid;
  created_at: string;
}

/** Readiness to franchise, computed by the data layer (as the backend will). */
export interface Franchisability {
  business_id: Uuid;
  franchisability_pct: number;
  franchisability_goal: number;
  required_task_codes: string[];
  missing_required: string[];
  is_ready: boolean;
}

export interface Task {
  id: Uuid;
  code: string;
  name: string;
  acceptance_criteria: string;
  area: AreaCode;
  step: TaskStep;
  status: TaskStatus;
  business_id: Uuid;
  organization_id: Uuid;
  assignee_user_id: Uuid;
  /** SM person who supervises the task. */
  supervisor_user_id: Uuid;
  depends_on_task_ids: Uuid[];
  start_date: IsoDate;
  due_date: IsoDate;
  current_version: number;
  updated_at: IsoDateTime;
  /** When the owner approved it (null/absent if not approved). */
  accepted_at?: IsoDateTime | null;
}

export interface TaskFile {
  id: Uuid;
  name: string;
  size_kb: number;
}

export type VersionStatus = "submitted" | "changes_requested" | "accepted";

export interface TaskVersion {
  id: Uuid;
  task_id: Uuid;
  version: number;
  submitted_by_user_id: Uuid;
  submitted_at: IsoDateTime;
  note: string;
  files: TaskFile[];
  status: VersionStatus;
  /** Owner comment that requested changes on this version. */
  review_comment_id: Uuid | null;
}

export type TaskEventKind =
  | "assigned" | "started" | "submitted" | "changes_requested" | "approved"
  | "reassigned" | "due_changed" | "step_changed" | "cancelled";

/**
 * A change SM made to a task. from/to: ISO date for due_date, step code for step,
 * display name "Person (Firm)" for assignee; reason only for cancelled.
 */
export interface TaskChange {
  field: "assignee" | "due_date" | "step" | "cancelled";
  from: string | null;
  to: string | null;
  reason?: string | null;
}

export interface TaskEvent {
  id: Uuid;
  task_id: Uuid;
  kind: TaskEventKind;
  actor_user_id: Uuid;
  version: number | null;
  comment_id: Uuid | null;
  created_at: IsoDateTime;
  change?: TaskChange | null;
}

export interface TaskComment {
  id: Uuid;
  task_id: Uuid;
  author_user_id: Uuid;
  body: string;
  created_at: IsoDateTime;
  kind: "comment" | "changes_requested" | "approval";
  /** Set when the comment is about a specific deliverable file. */
  file_id: Uuid | null;
}

export interface OwnerRequest {
  id: Uuid;
  task_id: Uuid;
  requested_by_user_id: Uuid;
  question: string;
  due_date: IsoDate;
  answer: string | null;
  status: "open" | "resolved";
  created_at: IsoDateTime;
  resolved_at: IsoDateTime | null;
}

export interface Meeting {
  id: Uuid;
  task_id: Uuid;
  proposed_by_user_id: Uuid;
  topic: string;
  starts_at: IsoDateTime;
  duration_minutes: number;
  status: "proposed" | "confirmed" | "cancelled";
}

/** Event from the user's own Google Calendar (simulated). Read-only in the portal. */
export interface ExternalCalendarEvent {
  id: Uuid;
  user_id: Uuid;
  title: string;
  starts_at: IsoDateTime;
  duration_minutes: number;
}

export const NOTIFICATION_KINDS = [
  "due_today",
  "due_tomorrow",
  "overdue",
  "submitted_for_approval",
  "changes_requested",
  "mentioned",
  "meeting_proposed",
  "meeting_confirmed",
  "unblocked",
  "task_updated",
  // Entry flow (SM only): about a lead, not a task.
  "bishop_accepted",
  "funds_reported",
] as const;
/** Kinds about a lead of the Embudo. Only the SM team of the lead's office gets them. */
export const LEAD_NOTIFICATION_KINDS: readonly NotificationKind[] = ["bishop_accepted", "funds_reported"];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationChannel = "in_app" | "email";

export interface AppNotification {
  id: string;
  user_id: Uuid;
  kind: NotificationKind;
  task_id: Uuid;
  task_code: string;
  task_name: string;
  business_id: Uuid;
  business_name: string;
  /** Who caused it; null for date-generated ones. */
  actor_user_id: Uuid | null;
  actor_name: string | null;
  created_at: IsoDateTime;
  read_at: IsoDateTime | null;
  /** Only for task_updated: what SM changed. */
  change?: TaskChange | null;
  /** Lead notifications (bishop_accepted, funds_reported): the lead to open. Task fields are empty then. */
  lead_id?: Uuid | null;
}

export interface NotificationPreference {
  kind: NotificationKind;
  in_app: boolean;
  /** Only stored for now: emails are not sent yet. */
  email: boolean;
}

export interface TaskWithComputed extends Task {
  is_blocked: boolean;
  is_overdue: boolean;
  /** When the latest deliverable version was sent (null if never). Set by the data layer. */
  last_submitted_at?: IsoDateTime | null;
}

/** What SM can edit on a task (never name or criteria: those come from the catalog). */
export interface TaskPatch {
  organization_id?: Uuid;
  assignee_user_id?: Uuid;
  due_date?: IsoDate;
  step?: TaskStep;
}

export interface ViewAsOption {
  user: User;
  organization: Organization | null;
  /** For business owners: the business they own. */
  business: Business | null;
  enabled: boolean;
}

/** Franchisability part of the platform rules. Set only by SM Global, same for every program (like the catalog). Required list may be empty. */
export interface FranchisabilityRules {
  goal: number;
  required_task_codes: string[];
}

// ---------- Pipeline (leads from the external readiness assessment) ----------

export const LEAD_STAGES = ["evaluated", "meeting", "documents", "accepted", "in_program"] as const;
export type ActiveLeadStage = (typeof LEAD_STAGES)[number];
export type LeadStage = ActiveLeadStage | "discarded";
export type LeadBand = "high" | "mid" | "low" | "track";
export type LeadIndustry = "construction" | "remodeling" | "cleaning" | "restaurant" | "salon";
export type RevenueRange = "lt_250k" | "250k_500k" | "500k_1m" | "1m_3m" | "gt_3m";
export type MarginRange = "lt_10" | "10_20" | "20_30" | "gt_30";
export type TeamRange = "1_5" | "6_15" | "16_50" | "gt_50";
export type YearsRange = "lt_2" | "2_5" | "5_10" | "gt_10";
export const ASSESSMENT_BLOCKS = ["time_team", "work_quality", "money", "clients_sales", "info_agreements", "experience", "vision"] as const;
export type AssessmentBlock = (typeof ASSESSMENT_BLOCKS)[number];
export type BlockStatus = "strong" | "medium" | "weak" | "unknown";
export type EligibilityGap = "years" | "revenue";

export interface Lead {
  id: Uuid;
  /** SM office that receives the lead. */
  office_id: Uuid;
  stage: LeadStage;
  /** Stage the lead was in when discarded (null otherwise). */
  discarded_from: ActiveLeadStage | null;
  discard_reason: string | null;
  stage_entered_at: IsoDateTime;
  submitted_at: IsoDateTime;
  /** Last time SM moved the lead or wrote a note (null = never contacted). */
  last_contact_at: IsoDateTime | null;
  consultant_user_id: Uuid;
  /** Set when the contract is signed and the business is created. */
  business_id: Uuid | null;
  contact: { name: string; email: string; phone: string; city: string; state: string; hispanic_owner: boolean };
  business: {
    name: string;
    industry: LeadIndustry;
    /** Free text as the owner wrote it. */
    activity: string;
    revenue_range: RevenueRange;
    margin_range: MarginRange;
    team_range: TeamRange;
    years_range: YearsRange;
    has_active_clients: boolean;
  };
  result: {
    band: LeadBand;
    score: number;
    eligible_program: boolean;
    eligibility_gaps: EligibilityGap[];
    blocks: { key: AssessmentBlock; status: BlockStatus }[];
    strengths: string[];
    priorities: string[];
  };
  know_how_example: string | null;
  /** Bishop who accepted the opportunity (null while nobody took it, or after SM released it). */
  bishop_user_id: Uuid | null;
  bishop_accepted_at: IsoDateTime | null;
}

/** Tripartite contract (Bishop + SM + owner) of an accepted lead. */
export type TripartiteState = "none" | "pending" | "signed";

export interface LeadWithComputed extends Lead {
  /** Consultant's booking link, or the office default. Resolved by the data layer. */
  booking_url: string;
  /** Entry checklist once NDA and MOU were sent (null before). Computed by the data layer. */
  intake: IntakeSummary | null;
  tripartite: TripartiteState;
  /**
   * Bishop funds once the tripartite contract is signed (null before). Only the state and whether the program can
   * start: amounts live in FundsRepository, which the mock serves only to SM and that Bishop.
   */
  funds: { status: FundsStatus; to_confirm: boolean; ready_to_start: boolean; proposed_day1: IsoDate | null } | null;
}

// ---------- Entry (NDA, MOU, due diligence documents) ----------

export type ReviewClockStatus = "waiting_upload" | "running" | "paused" | "done";
export interface ReviewClock {
  status: ReviewClockStatus;
  /** Review day (0 before it starts). */
  day: number;
  /** SM Global rule: days SM has to review. */
  total: number;
  tone: "ok" | "amber" | "red";
}
export type DocsApproval = { ok: true } | { ok: false; reason: "contracts" | "documents"; missing: string[] };
export interface IntakeSummary {
  business_id: Uuid;
  required_total: number;
  /** Required documents with a file (accepted, waiting review or asked again). */
  uploaded: number;
  accepted: number;
  /** Received and not reviewed yet. */
  to_review: number;
  nda_signed: boolean;
  mou_signed: boolean;
  /** Signed by the owner: unlocks the upload. */
  nda_signed_by_owner: boolean;
  clock: ReviewClock;
  approval: DocsApproval;
  approved_at: IsoDateTime | null;
}

export type LeadEventKind =
  | "submitted" | "stage_changed" | "discarded" | "restored" | "note" | "contract_signed"
  | "nda_sent" | "doc_accepted" | "doc_requested" | "docs_approved"
  | "bishop_accepted" | "bishop_released" | "tripartite_sent"
  | "funds_recorded" | "funds_reported" | "funds_confirmed" | "funds_removed" | "program_started";

export interface LeadEvent {
  id: Uuid;
  lead_id: Uuid;
  kind: LeadEventKind;
  actor_user_id: Uuid | null;
  created_at: IsoDateTime;
  from: LeadStage | null;
  to: LeadStage | null;
  /** Note text or discard reason. */
  body: string | null;
  /** contract_signed / program_started: day 1 of the program. */
  signed_on?: IsoDate | null;
}

export * from "./network-types";
import type { FundsStatus } from "./network-types";

