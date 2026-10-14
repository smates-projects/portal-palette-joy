import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./index";
import type { SubmitVersionInput } from "./repositories";

export const queryKeys = {
  me: ["session", "me"] as const,
  viewAs: ["session", "view-as"] as const,
  tasks: ["tasks"] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  meetings: ["tasks", "meetings"] as const,
  businesses: ["businesses"] as const,
  users: ["users"] as const,
};

export const useCurrentUser = () => useQuery({ queryKey: queryKeys.me, queryFn: api.session.getCurrentUser });
export const useViewAsOptions = () =>
  useQuery({ queryKey: queryKeys.viewAs, queryFn: api.session.getViewAsOptions });
export const useTasks = () => useQuery({ queryKey: queryKeys.tasks, queryFn: api.tasks.list });
export const useUpcomingMeetings = () =>
  useQuery({ queryKey: queryKeys.meetings, queryFn: api.tasks.listUpcomingMeetings });
export const useBusinesses = () => useQuery({ queryKey: queryKeys.businesses, queryFn: api.businesses.list });
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
export const useTaskDetail = (id: string) =>
  useQuery({ queryKey: queryKeys.task(id), queryFn: () => api.tasks.get(id) });

export function useSetViewAs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.session.setViewAs(userId),
    // Changing user changes what the "backend" authorizes: refetch everything.
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Task mutations refresh both the list and every detail (status, blocked flags). */
function useTaskMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }) });
}

export const useStartTask = () => useTaskMutation((id: string) => api.tasks.start(id));
export const useSubmitVersion = () =>
  useTaskMutation((v: { id: string } & SubmitVersionInput) => api.tasks.submitVersion(v.id, v));
export const useAddComment = () =>
  useTaskMutation((v: { id: string; body: string; file_id: string | null }) => api.tasks.addComment(v.id, v));
export const useAddOwnerRequest = () =>
  useTaskMutation((v: { id: string; question: string; due_date: string }) => api.tasks.addOwnerRequest(v.id, v));
export const useSetOwnerRequestResolved = () =>
  useTaskMutation((v: { requestId: string; resolved: boolean }) => api.tasks.setOwnerRequestResolved(v.requestId, v.resolved));
export const useProposeMeeting = () =>
  useTaskMutation((v: { id: string; topic: string; starts_at: string; duration_minutes: number }) => api.tasks.proposeMeeting(v.id, v));
