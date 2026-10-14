import type {
  Business,
  ExternalCalendarEvent,
  Meeting,
  Organization,
  OwnerRequest,
  TaskComment,
  TaskEvent,
  TaskStatus,
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
}

export interface UsersRepository {
  list(): Promise<User[]>;
  /** Connect (with an account email) or disconnect (null) the current user's Google Calendar. */
  setGoogleCalendar(email: string | null): Promise<User>;
  /** Current user's Google Calendar events; empty when not connected. */
  listCalendarEvents(): Promise<ExternalCalendarEvent[]>;
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
  list(): Promise<TaskWithComputed[]>;
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
}

export interface ApiClient {
  session: SessionRepository;
  organizations: OrganizationsRepository;
  businesses: BusinessesRepository;
  users: UsersRepository;
  tasks: TasksRepository;
}
