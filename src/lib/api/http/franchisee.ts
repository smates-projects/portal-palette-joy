// FranchiseeRepository over the real API (franchising module: franchisee.controller.ts). Every route is the
// franchisee's own unit; anyone else gets franchisee_only from the API.
import type { FranchiseeRepository } from "../repositories";
import type {
  ChecklistItem,
  FranchiseTask,
  FranchiseeHome,
  SupportTicket,
  TeamMember,
} from "../types";
import type { HttpClient } from "./client";

export function createHttpFranchiseeRepository(client: HttpClient): FranchiseeRepository {
  return {
    getHome: () => client.get<FranchiseeHome>("/franchisee/home"),

    listChecklist: () => client.get<ChecklistItem[]>("/franchisee/checklist"),

    listTickets: () => client.get<SupportTicket[]>("/franchisee/tickets"),

    createTicket: (input) =>
      client.post<SupportTicket>("/franchisee/tickets", {
        subject: input.subject,
        body: input.body,
      }),

    listTasks: () => client.get<FranchiseTask[]>("/franchisee/tasks"),

    setTaskDone: (taskId, done) =>
      client.patch<FranchiseTask>(`/franchisee/tasks/${encodeURIComponent(taskId)}`, { done }),

    listTeam: () => client.get<TeamMember[]>("/franchisee/team"),
  };
}
