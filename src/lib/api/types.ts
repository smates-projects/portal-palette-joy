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
}

export interface User {
  id: Uuid;
  full_name: string;
  email: string;
  role: UserRole;
  organization_id: Uuid | null;
  business_id: Uuid | null;
  title: string | null;
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
}

export interface TaskVersion {
  id: Uuid;
  task_id: Uuid;
  version: number;
  submitted_by_user_id: Uuid;
  submitted_at: IsoDateTime;
  note: string;
  file_name: string;
}

export interface TaskComment {
  id: Uuid;
  task_id: Uuid;
  author_user_id: Uuid;
  body: string;
  created_at: IsoDateTime;
  kind: "comment" | "changes_requested" | "approval";
}

export interface OwnerRequest {
  id: Uuid;
  task_id: Uuid;
  requested_by_user_id: Uuid;
  question: string;
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

export interface TaskWithComputed extends Task {
  is_blocked: boolean;
  is_overdue: boolean;
}

export interface ViewAsOption {
  user: User;
  organization: Organization | null;
  enabled: boolean;
}
