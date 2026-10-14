import type {
  Business,
  Meeting,
  Organization,
  OwnerRequest,
  TaskComment,
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
}

export interface TaskDetail {
  task: TaskWithComputed;
  versions: TaskVersion[];
  comments: TaskComment[];
  owner_requests: OwnerRequest[];
  meetings: Meeting[];
}

export interface TasksRepository {
  list(): Promise<TaskWithComputed[]>;
  get(id: Uuid): Promise<TaskDetail | null>;
  updateStatus(id: Uuid, status: TaskStatus): Promise<TaskWithComputed>;
}

export interface ApiClient {
  session: SessionRepository;
  organizations: OrganizationsRepository;
  businesses: BusinessesRepository;
  users: UsersRepository;
  tasks: TasksRepository;
}
