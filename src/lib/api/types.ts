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

export type UserRole = "partner_firm" | "business_owner" | "sm_team";

export interface Organization {
  id: Uuid;
  name: string;
  kind: "partner_firm" | "sm";
  area: AreaCode | null;
  /** What the firm does, shown to owners and SM. */
  specialty: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
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
}

export interface Business {
  id: Uuid;
  name: string;
  industry: string;
  city: string;
  state: string;
  owner_user_id: Uuid;
  program_start_date: IsoDate;
  program_day: number;
  /** Per-business overrides set by SM; null = use the default for all businesses. */
  franchisability_goal: number | null;
  required_task_codes: string[] | null;
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

export type TaskEventKind = "assigned" | "started" | "submitted" | "changes_requested" | "approved";

export interface TaskEvent {
  id: Uuid;
  task_id: Uuid;
  kind: TaskEventKind;
  actor_user_id: Uuid;
  version: number | null;
  comment_id: Uuid | null;
  created_at: IsoDateTime;
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
] as const;
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
}

export interface ViewAsOption {
  user: User;
  organization: Organization | null;
  /** For business owners: the business they own. */
  business: Business | null;
  enabled: boolean;
}
