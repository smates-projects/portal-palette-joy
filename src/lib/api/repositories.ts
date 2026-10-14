import type {
  Lead,
  LeadEvent,
  LeadStage,
  LeadWithComputed,
  AppNotification,
  Business,
  Franchisability,
  NotificationChannel,
  NotificationKind,
  NotificationPreference,
  ExternalCalendarEvent,
  Meeting,
  Organization,
  OwnerRequest,
  TaskComment,
  TaskEvent,
  TaskStatus,
  TaskPatch,
  TaskVersion,
  TaskWithComputed,
  User,
  Uuid,
  ViewAsOption,
} from "./types";

export interface SessionRepository {
  getCurrentUser(): Promise<User>;
  getViewAsOptions(): Promise<ViewAsOption[]>;
  setViewAs(userId: Uuid): Promise<User>;
}

export interface OrganizationsRepository {
  list(): Promise<Organization[]>;
  get(id: Uuid): Promise<Organization | null>;
}

export interface BusinessesRepository {
  list(): Promise<Business[]>;
  getFranchisability(businessId: Uuid): Promise<Franchisability>;
}

export interface UsersRepository {
  list(): Promise<User[]>;
  /** Connect (with an account email) or disconnect (null) the current user's Google Calendar. */
  setGoogleCalendar(email: string | null): Promise<User>;
  /** Current user's Google Calendar events; empty when not connected. */
  listCalendarEvents(): Promise<ExternalCalendarEvent[]>;
  /** SM team: set or clear the current user's booking link. */
  setBookingUrl(url: string | null): Promise<User>;
}

export interface LeadDetail {
  lead: LeadWithComputed;
  events: LeadEvent[];
}

/** SM only, scoped to the user's office. */
export interface LeadsRepository {
  list(): Promise<LeadWithComputed[]>;
  get(id: Uuid): Promise<LeadDetail | null>;
  /** One step forward or back, or reactivate a discarded lead to evaluated. Never to/from in_program. */
  move(id: Uuid, to: Exclude<LeadStage, "discarded" | "in_program">): Promise<LeadWithComputed>;
  /** Required reason. Not allowed once in program. */
  discard(id: Uuid, reason: string): Promise<LeadWithComputed>;
  addNote(id: Uuid, body: string): Promise<LeadEvent>;
  /** contract → in_program: creates the business (day 1 = signed_on) and its tasks from the catalog. */
  markContractSigned(id: Uuid, signed_on: string): Promise<{ lead: Lead; business_id: Uuid; task_count: number }>;
}

export interface TaskDetail {
  task: TaskWithComputed;
  versions: TaskVersion[];
  comments: TaskComment[];
  owner_requests: OwnerRequest[];
  meetings: Meeting[];
  events: TaskEvent[];
}

export interface SubmitVersionInput {
  note: string;
  file_names: string[];
}

export interface TasksRepository {
  /** Visible tasks. Cancelled ones are left out unless include_cancelled. */
  list(opts?: { include_cancelled?: boolean }): Promise<TaskWithComputed[]>;
  /** SM only: reassign, change due date or step on one or many tasks. Logged and notified to the firm. */
  update(ids: Uuid[], patch: TaskPatch): Promise<TaskWithComputed[]>;
  /** SM only: cancel with a required reason. The task stays, as cancelled. */
  cancel(ids: Uuid[], reason: string): Promise<TaskWithComputed[]>;
  get(id: Uuid): Promise<TaskDetail | null>;
  updateStatus(id: Uuid, status: TaskStatus): Promise<TaskWithComputed>;
  start(id: Uuid): Promise<TaskWithComputed>;
  submitVersion(id: Uuid, input: SubmitVersionInput): Promise<TaskVersion>;
  addComment(id: Uuid, input: { body: string; file_id: Uuid | null }): Promise<TaskComment>;
  addOwnerRequest(id: Uuid, input: { question: string; due_date: string }): Promise<OwnerRequest>;
  setOwnerRequestResolved(requestId: Uuid, resolved: boolean): Promise<OwnerRequest>;
  proposeMeeting(id: Uuid, input: { topic: string; starts_at: string; duration_minutes: number }): Promise<Meeting>;
  /** Upcoming (not cancelled) meetings on tasks the current user can see, soonest first. */
  listUpcomingMeetings(): Promise<Meeting[]>;
  /** All non-cancelled meetings on tasks the current user can see. */
  listMeetings(): Promise<Meeting[]>;
  /** Deliverable versions of every task the current user can see. */
  listVersions(): Promise<TaskVersion[]>;
  /** Open requests to the owner on visible tasks. */
  listOpenOwnerRequests(): Promise<OwnerRequest[]>;
  /** Owner only: submitted → accepted. */
  approve(id: Uuid): Promise<TaskWithComputed>;
  /** Owner only: submitted → changes_requested, with a required note. */
  requestChanges(id: Uuid, note: string): Promise<TaskWithComputed>;
  /** Owner only: answer a request by uploading a file (simulated), with an optional note. */
  answerOwnerRequest(requestId: Uuid, input: { file_name: string; note: string }): Promise<OwnerRequest>;
  /** Owner only: confirm a meeting proposed by a firm. */
  confirmMeeting(meetingId: Uuid): Promise<Meeting>;
}

export interface NotificationsRepository {
  /** Current user's notifications for kinds enabled "in app", newest first. Due ones are generated from dates. */
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  getPreferences(): Promise<NotificationPreference[]>;
  setPreference(kind: NotificationKind, channel: NotificationChannel, enabled: boolean): Promise<NotificationPreference[]>;
}

export interface ApiClient {
  notifications: NotificationsRepository;
  session: SessionRepository;
  organizations: OrganizationsRepository;
  businesses: BusinessesRepository;
  users: UsersRepository;
  tasks: TasksRepository;
  leads: LeadsRepository;
}
