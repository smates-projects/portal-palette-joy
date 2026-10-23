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
/** Partner firms only. An inactive firm was replaced or retired: it keeps its history and is never deleted. */
export type FirmStatus = "active" | "inactive";
/** invited: account created, mail simulated, not accepted yet. inactive: deactivated with a reason (never deleted). */
export type UserStatus = "invited" | "active" | "inactive";
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
  /** SM offices: the signature image (PNG) the NDA and the MOU go out pre-signed with. */
  signature_file_id?: Uuid | null | undefined;
  signature_file_name?: string | null | undefined;
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
  /** Partner firms: SM's own team doing that area (shown as "equipo propio"). */
  internal?: boolean | undefined;
  /** Partner firms: active (one per area per office) or inactive (replaced or retired). Absent = active. */
  firm_status?: FirmStatus | null | undefined;
  /** Partner firms: contact person SM talks to. */
  contact_name?: string | null | undefined;
  /** Partner firms: the firm that took its place when it was replaced. */
  replaced_by_id?: Uuid | null | undefined;
  deactivated_at?: IsoDateTime | null | undefined;
  deactivation_reason?: string | null | undefined;
}

/** What the office admin (or SM Global) gives to add a partner firm with its first person. */
export interface CreateFirmInput {
  /** SM Global picks the office; an office admin always gets its own (ignored for it). */
  office_id?: Uuid | null | undefined;
  name: string;
  area: AreaCode;
  /** SM's own team for that area. */
  internal: boolean;
  specialty: string | null;
  contact_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  /** First person of the firm: partner_firm with is_admin. */
  first_person: { full_name: string; email: string; title: string | null };
}

export type FirmPatch = Partial<Pick<Organization, "name" | "specialty" | "contact_name" | "email" | "phone" | "city">>;

/** What happens with the open tasks of the firm being replaced. */
export type OpenTasksPolicy = "transfer" | "keep";

export type FirmEventKind = "created" | "edited" | "replaced" | "deactivated" | "took_over";

/** History of a partner firm: never deleted, every change is kept. */
export interface FirmEvent {
  id: Uuid;
  organization_id: Uuid;
  kind: FirmEventKind;
  actor_user_id: Uuid;
  created_at: IsoDateTime;
  /** replaced / took_over: the other firm. */
  other_organization_id: Uuid | null;
  /** Reason, or a summary of the edit. */
  body: string | null;
  /** replaced: how many open tasks moved to the new firm. */
  moved_tasks?: number | null | undefined;
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
  /** Absent = active (older seed rows). */
  status?: UserStatus | undefined;
  invited_at?: IsoDateTime | null | undefined;
  activated_at?: IsoDateTime | null | undefined;
  deactivated_at?: IsoDateTime | null | undefined;
  deactivation_reason?: string | null | undefined;
  /** The person turned on the verification in two steps (TOTP). Absent = unknown, read as off. */
  two_factor_enabled?: boolean | undefined;
  /**
   * Calendar v2: Google Calendar connected with read and write access (the portal reads free time and creates the
   * meetings). Absent in older rows: read from google_calendar_email (lib/calendar/scheduling isCalendarConnected).
   */
  calendar_connected?: boolean | undefined;
  /** SM people: may sign for SM Square (SM Global grants it in Personas). Absent = no. */
  can_sign_sm_square?: boolean | undefined;
  /** SM people: their key in the assessment link (strategicmates.com/assessment?asesor=<slug>). */
  advisor_slug?: string | null | undefined;
  /**
   * The account has a password. Owners (and Bishops) enter through email links while they sign; absent in older
   * rows, read as true.
   */
  has_password?: boolean | undefined;
  /**
   * GET /me: the program started and the account still has no password, so the portal asks for one (PasswordSetup
   * dialog). Absent = no.
   */
  password_setup_required?: boolean | undefined;
}

/** PATCH /users/{id}/signing-entities. */
export interface SigningEntitiesInput {
  can_sign_sm_square: boolean;
}

/** Who to invite. The organization and business depend on the role: SM people have an organization, owners a business. */
export interface InviteUserInput {
  full_name: string;
  email: string;
  role: UserRole;
  organization_id: Uuid | null;
  business_id: Uuid | null;
  title: string | null;
  /** Only SM Global may set it; the office admin creates the first person of a firm as admin. */
  is_admin: boolean;
}

export type AccountEventKind = "invited" | "accepted" | "deactivated" | "reactivated" | "admin_granted" | "admin_revoked" | "made_owner";

/** History of a person's account. Nobody deletes accounts: every change is kept here. */
export interface AccountEvent {
  id: Uuid;
  user_id: Uuid;
  kind: AccountEventKind;
  /** Null when the person accepted the invitation (simulated). */
  actor_user_id: Uuid | null;
  created_at: IsoDateTime;
  /** Deactivation reason. */
  body: string | null;
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
  /**
   * Set when the program starts, on tasks of the areas the assessment rated "strong": pending = "A validar: el negocio
   * ya lo tendría"; existing = the consultant confirmed it already existed; needed = it has to be done. Null otherwise.
   */
  pre_validation?: PreValidation | null;
  /** How it got approved: a deliverable the owner approved, or "Ya existía" (evidence shown in the Diagnóstico). */
  approval_source?: ApprovalSource | null;
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
  /** B5-13 only: the brand the firm read from the manual. Applied to the business when the owner approves. */
  brand?: BrandProposal | null | undefined;
}

// ---------- Business brand (white label) ----------

/**
 * Colors as #rrggbb. logo_url is the image the portal shows on the rail: in the mock a data URL read in the browser
 * (or a sample under /brand/samples); in production the backend stores the uploaded file and returns its URL.
 * Without a logo the portal draws the initials of the business.
 */
export interface BrandPalette {
  primary_color: string;
  accent_color: string;
  font_family: string | null;
  logo_file_name: string | null;
  logo_url: string | null;
}

/** What the firm sends with B5-13: the manual, the logo and the palette it read from the manual (corrected by hand if needed). */
export interface BrandProposal extends BrandPalette {
  manual_file_name: string;
}

export type BrandSource = "b5_13" | "manual_sm";

/**
 * The brand a business shows in its portal. Absent = Strategic Mates brand. Applied automatically when the owner
 * approves B5-13, or loaded by hand by SM. Franchises inherit it from their franchisor and cannot edit it.
 */
export interface BusinessBrand extends BrandPalette {
  business_id: Uuid;
  source: BrandSource;
  /** Deliverable version that brought it (b5_13), null when SM loaded it. */
  version: number | null;
  applied_at: IsoDateTime;
  applied_by_user_id: Uuid | null;
  manual_file_name: string | null;
  /** Stored files behind the logo and the manual. Only the real API sends them (the mock has no files). */
  logo_file_id?: Uuid | null | undefined;
  manual_file_id?: Uuid | null | undefined;
}

export type BrandEventKind = "applied_from_b5_13" | "set_by_sm" | "reset";

export interface BrandEvent {
  id: Uuid;
  business_id: Uuid;
  kind: BrandEventKind;
  actor_user_id: Uuid | null;
  created_at: IsoDateTime;
  /** The palette that was applied (null on reset). */
  palette: BrandPalette | null;
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

// ---------- Calendar v2: portal meetings created in Google Calendar ----------

/** What a portal meeting is about: a task, a business (owner, consultant, Bishop) or a lead of the Embudo. */
export type PortalMeetingKind = "task" | "business" | "lead";
/** Google's answer of each guest. */
export type MeetingResponse = "needsAction" | "accepted" | "declined" | "tentative";
/** proposed: someone still has to confirm (an organizer or a guest without the calendar connected). */
export type PortalMeetingStatus = "proposed" | "confirmed" | "cancelled";

export interface PortalMeetingParticipant {
  user_id: Uuid;
  name: string;
  response: MeetingResponse;
}

/** GET /meetings/{id}, GET /me/meetings. `version` travels back as If-Match on PATCH and DELETE. */
export interface PortalMeeting {
  id: Uuid;
  kind: PortalMeetingKind;
  task_id: Uuid | null;
  business_id: Uuid | null;
  lead_id: Uuid | null;
  topic: string;
  starts_at: IsoDateTime;
  ends_at: IsoDateTime;
  /** Only when the meeting was created in Google (google_synced). */
  meet_url: string | null;
  organizer: { user_id: Uuid; name: string };
  participants: PortalMeetingParticipant[];
  status: PortalMeetingStatus;
  /** The event exists in the organizer's Google Calendar and the invitations went out. */
  google_synced: boolean;
  version: number;
  /** The Google event and its iCalUID, when the API sends them: they tell this meeting apart in the Google events. */
  google_event_id?: string | null | undefined;
  ical_uid?: string | null | undefined;
}

/** GET /me/calendar and GET /users/{id}/calendar-status. */
export type CalendarConnectionStatus = "connected" | "not_connected" | "reconnect_required";

export interface CalendarConnection {
  connected: boolean;
  email: string | null;
  /** Google scopes granted (space separated); null when not connected. */
  scope: string | null;
  status: CalendarConnectionStatus;
}

/** POST /calendar/availability. Times are ISO; the API keeps only the common free slots inside meeting_hours. */
export interface AvailabilityInput {
  participant_user_ids: Uuid[];
  from: IsoDateTime;
  to: IsoDateTime;
  duration_minutes: number;
}

export interface TimeSlot {
  starts_at: IsoDateTime;
  ends_at: IsoDateTime;
}

/** Why a participant's free time could not be read: calendar_not_connected, calendar_reconnect_required... */
export interface UnavailableParticipant {
  user_id: Uuid;
  reason: string;
}

export interface Availability {
  slots: TimeSlot[];
  unavailable_participants: UnavailableParticipant[];
}

/** POST /meetings. The organizer is the current user; the id of the kind's subject is required. */
export interface ScheduleMeetingInput {
  kind: PortalMeetingKind;
  task_id?: Uuid | null | undefined;
  business_id?: Uuid | null | undefined;
  lead_id?: Uuid | null | undefined;
  participant_user_ids: Uuid[];
  starts_at: IsoDateTime;
  duration_minutes: number;
  topic: string;
  note?: string | null | undefined;
}

/** PATCH /meetings/{id} ("Mover"): a new time, optionally a new length or topic. */
export interface RescheduleMeetingInput {
  starts_at: IsoDateTime;
  duration_minutes?: number | undefined;
  topic?: string | undefined;
  note?: string | null | undefined;
}

/** Event from the user's own Google Calendar (simulated). Read-only in the portal. */
export interface ExternalCalendarEvent {
  id: Uuid;
  user_id: Uuid;
  title: string;
  starts_at: IsoDateTime;
  duration_minutes: number;
  /** Google's iCalUID, when the API sends it (the same event in every guest's calendar). */
  ical_uid?: string | null | undefined;
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
  // Owner: "Tu portal ya tiene tu marca" (B5-13 approved with a brand).
  "brand_applied",
  // Automatic entry (to the lead's consultant): a new assessment arrived, the owner booked the meeting.
  "lead_assessment",
  "meeting_booked",
  // Google Calendar (API): to the person whose calendar Google stopped accepting, connect it again.
  "calendar_disconnected",
  // Brand (API): to whoever uploaded the logo, the file failed verification and left the brand.
  "brand_logo_rejected",
  // Revised entry. To the consultant: a meeting ended and nobody answered "¿Se hizo?". To the owner: the MOU is ready
  // (it exists once he signed the NDA).
  "meeting_outcome_pending",
  "mou_ready",
  // To a Bishop: SM presented him an approved business (opens his opportunities).
  "opportunity_presented",
  // Calendar v2 (every role). The first three open the calendar with the meeting focused; the last two, the profile.
  "meeting_scheduled",
  "meeting_moved",
  "meeting_cancelled",
  "calendar_connect_suggested",
  "calendar_reconnect_required",
  // Entry documents and contracts (API). To SM: a document arrived, a review is past its deadline, a signature of the
  // Operating Agreement needs review. To the owner: a document asked again, the documentation approved or unlocked,
  // a contract to sign. To the other parties: a contract signed.
  "document_received",
  "document_requested",
  "documents_approved",
  "documents_unlocked",
  "contract_sent",
  "contract_signed",
  "review_overdue",
  "signature_pending_review",
  // Bishop and program (API): a business can be taken; the program started (day 1).
  "opportunity_available",
  "program_started",
  // Configurable entry contracts. To the owner, the Bishop and SM: the Acuerdo de Vinculación is ready to sign; SM
  // closed the validation with the definitive percentages.
  "binding_ready",
  "validation_closed",
  // API only, to the SM team: a lead or business arrived from another office ("Derivar a oficina"); a lead left
  // the process by itself (meeting held without the MOU signed).
  "transfer_received",
  "lead_auto_discarded",
] as const;
/** Kinds about one business entering that its three parties get (owner, Bishop, SM team and Corporate). */
export const ENTRY_PARTY_NOTIFICATION_KINDS: readonly NotificationKind[] = ["binding_ready", "validation_closed"];
/** Kinds that only the real API sends (the mock never creates them nor lists their preferences). */
export const API_ONLY_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "document_received", "document_requested", "documents_approved", "documents_unlocked", "contract_sent", "contract_signed",
  "review_overdue", "signature_pending_review", "opportunity_available", "program_started", "transfer_received", "lead_auto_discarded",
];
/** Kinds about a lead of the Embudo. Only the SM team of the lead's office gets them. */
export const LEAD_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "bishop_accepted", "funds_reported", "lead_assessment", "meeting_booked", "meeting_outcome_pending",
];
/** Kinds only a business owner gets (about his own entry). */
export const OWNER_NOTIFICATION_KINDS: readonly NotificationKind[] = ["mou_ready"];
/** Kinds only a Bishop gets. */
export const BISHOP_NOTIFICATION_KINDS: readonly NotificationKind[] = ["opportunity_presented"];
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
  /** lead_assessment: "Miami, FL". */
  lead_place?: string | null;
  /** meeting_booked: when the meeting starts. */
  meeting_at?: IsoDateTime | null;
  /** meeting_outcome_pending: the meeting to answer (the lead opens with its meeting card in focus). */
  meeting_id?: Uuid | null;
  /** opportunity_presented: the opportunity to open (same id as the lead, but the Bishop never gets lead_id). */
  opportunity_id?: Uuid | null;
  /** Contract notifications (contract_sent, contract_signed): the contract and its name ("NDA", "Operating Agreement"). */
  contract_id?: Uuid | null;
  contract_name?: string | null;
  /** The API renders the text itself (Spanish); shown as is when present, the locale texts are the fallback and the English. */
  title?: string | null | undefined;
  body?: string | null | undefined;
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

// ---------- Authentication (login, invitation, magic link, password reset) ----------

/** Minimum password length, checked by the API on accept and reset ("weak_password"). */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Error codes the session repository throws (as Error messages). 401 on login is always "invalid_credentials",
 * whether the email exists or not; "account_inactive" only after a correct password.
 */
export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "account_inactive",
  "token_invalid",
  "token_expired",
  "token_used",
  "weak_password",
  "terms_required",
  "name_required",
  // POST /me/password of an account that already has one, sent without current_password. (The login of an account
  // without password answers the generic invalid_credentials on purpose: the login screen offers the magic link.)
  "current_password_required",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export interface LoginInput {
  email: string;
  password: string;
}

/** What the invitation link shows before the person creates the account. Read only: it does not use the token. */
export interface InvitationPreview {
  email: string;
  role: UserRole;
  organization_name: string | null;
  business_name: string | null;
  expires_at: IsoDateTime;
  /** Name SM already has for the person (prefills the form); null when unknown. */
  full_name: string | null;
  /** Who sent the invitation; null when it was automatic. */
  invited_by_name: string | null;
}

export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
  /** The person ticked "Acepto los términos y la política de privacidad". */
  accepted_terms: true;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

/** POST /me/password: creates the password (no current one) or changes it (current_password required). */
export interface SetPasswordInput {
  password: string;
  current_password?: string | undefined;
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
/**
 * Strategic Mates works only with construction businesses and their branches. These are exactly the keys the
 * public assessment of sm-platform sends (readinessQuestions.js ACTIVITY_OPTIONS); other_related comes with
 * activity_other as free text.
 */
export type LeadIndustry = "construction" | "remodeling" | "installations_repairs" | "maintenance" | "cleaning" | "other_related";
/** Answer to "¿El dueño es hispano?" of the assessment. talk = prefers to talk about it in the meeting. */
export type HispanicOwner = "yes" | "no" | "talk";

// Range and block keys are exactly the ones the readiness assessment of sm-platform sends to the webhook
// (readinessQuestions.js and config/assessment_forms.php).
/** Sales of the last 12 months. */
export type RevenueRange = "lt_250k" | "250k_500k" | "500k_750k" | "750k_1m" | "1m_2m" | "gt_2m";
/** Profit margin. The assessment sends null when the owner answered "No lo sé". */
export type MarginRange = "margin_0_20" | "margin_21_40" | "margin_41_60" | "margin_60_plus";
/** People working in the business, owner included. team_1 = "Solo yo". */
export type TeamRange = "team_1" | "team_2_5" | "team_6_10" | "team_11_20" | "team_20_plus";
/** Years operating. Hard program rule: years_lt1 (less than 1 year) is an eligibility gap. */
export type YearsRange = "years_lt1" | "years_1_2" | "years_3_5" | "years_6_10" | "years_10_plus";
/** The seven scored areas, in the order the questionnaire asks them. */
export const ASSESSMENT_BLOCKS = ["time_team", "work_quality", "money", "clients_sales", "information", "experience", "direction"] as const;
export type AssessmentBlock = (typeof ASSESSMENT_BLOCKS)[number];
export type BlockStatus = "strong" | "medium" | "weak" | "unknown";
export type EligibilityGap = "years_operating" | "revenue";
/** ready: eligible and the score reaches the threshold (band high/mid/low). on_track: otherwise (band track). */
export type LeadReadiness = "ready" | "on_track";
/** landing: came from the public readiness assessment of the landing. manual: SM added it by hand (referral, event). */
export type LeadSource = "landing" | "manual";

export interface LeadResult {
  readiness: LeadReadiness;
  /** Headline band. Minimum shown score: high 70, mid 55, low 0. "track" whenever readiness is on_track. */
  band: LeadBand;
  /** Score shown to the owner (display.score of the payload, 40 to 92), not the raw percentage. */
  score: number;
  eligible_program: boolean;
  eligibility_gaps: EligibilityGap[];
  blocks: { key: AssessmentBlock; status: BlockStatus }[];
  /** The payload brings strengths[{ question, source, text }]: only the text is kept here. */
  strengths: string[];
  /** The payload brings priorities[{ question, block, title, reading, help }]: only the title is kept here. */
  priorities: string[];
}

/** What SM types to add a business by hand: the same data the assessment collects, without the result. */
export interface ManualLeadInput {
  contact: Lead["contact"];
  business: Lead["business"];
  /** Where it came from (referral, event...). Kept as the first note. */
  origin_note: string | null;
}

/**
 * A lead enters by itself. In production the assessment of strategicmates.com (outside this app) posts the lead
 * to a webhook of the Laravel API with its result; the person sees the result on screen (no email) with the
 * "Agendar mi reunión" button. The meeting arrives later from the consultant's booking calendar (Google Calendar),
 * also by webhook, and only then the summary email goes out with the meeting. The office comes from the zone
 * rules (RoutingRepository). The entry phase shown on screen is derived from the stage plus meeting and
 * summary_sent_at (see lib/leads/entry.ts): there is no separate "phase" field.
 */
export interface Lead {
  id: Uuid;
  /** SM office that receives the lead. */
  office_id: Uuid;
  /** Where it came from: the public assessment of the landing, or added by hand by SM. */
  source: LeadSource;
  /**
   * When the summary email (headline, score, strengths, priorities, plus the date, time and Meet link) went out.
   * It is sent on booking, so it is null whenever meeting is null.
   */
  summary_sent_at: IsoDateTime | null;
  /** Meeting the owner booked from the on-screen result; null while not booked (or when SM moved it by hand). */
  meeting: LeadMeeting | null;
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
  contact: { name: string; email: string; phone: string; city: string; state: string; hispanic_owner: HispanicOwner };
  business: {
    name: string;
    industry: LeadIndustry;
    /** Free text describing the branch; only relevant when industry is other_related. */
    activity_other?: string | null;
    /** Free text as the owner wrote it. */
    activity: string;
    revenue_range: RevenueRange;
    /** Null = the owner answered "No lo sé". */
    margin_range: MarginRange | null;
    team_range: TeamRange;
    years_range: YearsRange;
    has_active_clients: boolean;
  };
  /** Null for a business added by hand that has not done the assessment yet. */
  result: LeadResult | null;
  know_how_example: string | null;
  /** Manual leads: when SM sent the assessment link ("Assessment pendiente"); null until then. */
  assessment_sent_at?: IsoDateTime | null | undefined;
  /** Bishop who accepted the opportunity (null while nobody took it, or after SM released it). */
  bishop_user_id: Uuid | null;
  bishop_accepted_at: IsoDateTime | null;
  /** Reunión de ampliación, booked after the approval (kind "expansion"). Absent or null until booked. */
  expansion_meeting?: LeadMeeting | null | undefined;
  /** When the expansion meeting was answered as held: the Operating Agreement can go out from then. */
  expansion_meeting_held_at?: IsoDateTime | null | undefined;
  /** The definitive percentages SM validates after the documents; null until SM starts it. */
  validation?: LeadValidation | null | undefined;
  /** The SM advisor whose assessment link the owner used (?asesor=<slug>); null when it came without one. */
  completed_by_advisor?: { id: Uuid; name: string } | null | undefined;
}

/** Tripartite contract (Bishop + SM + owner) of an accepted lead. */
export type TripartiteState = "none" | "pending" | "signed";

export interface LeadWithComputed extends Lead {
  /** Consultant's booking link, or the office default. Null when neither is set: "Agendar reunión" cannot open a link. */
  booking_url: string | null;
  /** Where booking_url came from: the consultant's own, the office default, the platform's; "none" or null without one. */
  booking_url_source?: "consultant" | "office" | "platform" | "none" | null | undefined;
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
  /** Signed by the owner. */
  nda_signed_by_owner: boolean;
  clock: ReviewClock;
  approval: DocsApproval;
  approved_at: IsoDateTime | null;
  /** The MOU went out (after the meeting answered "Se hizo"). Absent = unknown (older answers). */
  mou_sent?: boolean | undefined;
  /** Signed by the owner: unlocks the documents (locked_until_mou). */
  mou_signed_by_owner?: boolean | undefined;
  /** The owner signed the NDA / MOU and only Strategic Mates' signature is missing. */
  nda_awaiting_sm?: boolean | undefined;
  mou_awaiting_sm?: boolean | undefined;
  /** Meetings and booking link for the owner's "Tu ingreso" (the owner never reads the lead). */
  entry?: OwnerEntry | null | undefined;
}

export type LeadEventKind =
  | "submitted" | "stage_changed" | "discarded" | "restored" | "note" | "contract_signed"
  | "nda_sent" | "doc_accepted" | "doc_requested" | "docs_approved"
  | "bishop_accepted" | "bishop_released" | "tripartite_sent"
  | "funds_recorded" | "funds_reported" | "funds_confirmed" | "funds_removed" | "program_started"
  // Business added by hand and the assessment sent to it afterwards.
  | "created_manual" | "assessment_sent"
  // Automatic entry (actor null): summary email sent, meeting booked by the owner. meeting_note: the consultant's note after it.
  | "summary_sent" | "meeting_booked" | "meeting_note"
  // Revised entry: outcome of a meeting, MOU sent, presented to Bishops, expansion meeting booked.
  | "meeting_outcome" | "mou_sent"
  | "presented_to_bishops" | "expansion_booked"
  // Moved to another office ("Derivar a oficina"): body carries the office name. Reactivated by SM Global after an
  // automatic discard. A meeting SM registered by hand ("Registrar reunión").
  | "transferred" | "reactivated" | "meeting_registered"
  // Configurable entry contracts: a rule created a contract; the validation saved or closed.
  | "contract_created" | "validation_saved" | "validation_closed";

export interface LeadEvent {
  id: Uuid;
  lead_id: Uuid;
  kind: LeadEventKind;
  actor_user_id: Uuid | null;
  /** Name of the actor, so the office reads "Marilyn lo reactivó" even when it cannot list SM Global's people. */
  actor_name?: string | null | undefined;
  created_at: IsoDateTime;
  from: LeadStage | null;
  to: LeadStage | null;
  /** Note text or discard reason. */
  body: string | null;
  /** contract_signed / program_started: day 1 of the program. */
  signed_on?: IsoDate | null;
  /** meeting_outcome: what the consultant answered and about which meeting. */
  outcome?: MeetingOutcome | null | undefined;
  meeting_kind?: MeetingKind | null | undefined;
}

export * from "./network-types";
import type { FundsStatus } from "./network-types";
export * from "./entry-types";
import type { ApprovalSource, LeadMeeting, LeadValidation, MeetingKind, MeetingOutcome, OwnerEntry, PreValidation } from "./entry-types";
export * from "./auth-types";

