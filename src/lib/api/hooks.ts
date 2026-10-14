import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./index";
import { listCatalog } from "./catalog";
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
export const useTasks = () => useQuery({ queryKey: queryKeys.tasks, queryFn: () => api.tasks.list() });
/** Includes cancelled tasks: only for the SM "Cancelada" filter. */
export const useTasksWithCancelled = (enabled: boolean) =>
  useQuery({ queryKey: ["tasks", "with-cancelled"], queryFn: () => api.tasks.list({ include_cancelled: true }), enabled });
export const useUpcomingMeetings = () =>
  useQuery({ queryKey: queryKeys.meetings, queryFn: api.tasks.listUpcomingMeetings });
export const useMeetings = () => useQuery({ queryKey: ["tasks", "meetings", "all"], queryFn: api.tasks.listMeetings });
export const useCalendarEvents = () =>
  useQuery({ queryKey: [...queryKeys.users, "calendar-events"], queryFn: api.users.listCalendarEvents });
export const useVersions = () => useQuery({ queryKey: ["tasks", "versions"], queryFn: api.tasks.listVersions });
export const useFranchisability = (businessId: string | undefined) =>
  useQuery({ queryKey: ["tasks", "franchisability", businessId], queryFn: () => api.businesses.getFranchisability(businessId!), enabled: !!businessId });
/** Franchisability of several businesses (Negocios). Shares cache with useFranchisability. */
export const useFranchisabilityMany = (businessIds: string[]) =>
  useQueries({
    queries: businessIds.map((id) => ({ queryKey: ["tasks", "franchisability", id], queryFn: () => api.businesses.getFranchisability(id) })),
    combine: (rs) => ({ data: rs.flatMap((r) => (r.data ? [r.data] : [])), isLoading: rs.some((r) => r.isLoading) }),
  });
export const useCatalog = () => useQuery({ queryKey: ["catalog"], queryFn: listCatalog, staleTime: Infinity });
export const useOpenOwnerRequests = () => useQuery({ queryKey: ["tasks", "owner-requests"], queryFn: api.tasks.listOpenOwnerRequests });
export const useBusinesses = () => useQuery({ queryKey: queryKeys.businesses, queryFn: api.businesses.list });
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
export const useTaskDetail = (id: string) =>
  useQuery({ queryKey: queryKeys.task(id), queryFn: () => api.tasks.get(id) });

export const useOrganizations = () => useQuery({ queryKey: ["organizations"], queryFn: api.organizations.list });

export function useSetGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string | null) => api.users.setGoogleCalendar(email),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.me }), qc.invalidateQueries({ queryKey: queryKeys.users })]),
  });
}

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
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.tasks }), qc.invalidateQueries({ queryKey: ["notifications"] })]) });
}

export const useStartTask = () => useTaskMutation((id: string) => api.tasks.start(id));
/** Undo a start made by mistake: in_progress → pending. */
export const useUnstartTask = () => useTaskMutation((id: string) => api.tasks.updateStatus(id, "pending"));
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

export const useNotifications = () => useQuery({ queryKey: ["notifications"], queryFn: api.notifications.list });
export const useNotificationPreferences = () =>
  useQuery({ queryKey: ["notifications", "prefs"], queryFn: api.notifications.getPreferences });
function useNotificationMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
}
export const useMarkNotificationRead = () => useNotificationMutation((id: string) => api.notifications.markRead(id));
export const useMarkAllNotificationsRead = () => useNotificationMutation((_: void) => api.notifications.markAllRead());
export const useSetNotificationPreference = () =>
  useNotificationMutation((v: { kind: import("./types").NotificationKind; channel: import("./types").NotificationChannel; enabled: boolean }) =>
    api.notifications.setPreference(v.kind, v.channel, v.enabled),
  );

export const useApproveTask = () => useTaskMutation((id: string) => api.tasks.approve(id));
export const useRequestChanges = () => useTaskMutation((v: { id: string; note: string }) => api.tasks.requestChanges(v.id, v.note));
export const useAnswerOwnerRequest = () =>
  useTaskMutation((v: { requestId: string; file_name: string; note: string }) => api.tasks.answerOwnerRequest(v.requestId, v));
export const useConfirmMeeting = () => useTaskMutation((id: string) => api.tasks.confirmMeeting(id));

export const useUpdateTasks = () =>
  useTaskMutation((v: { ids: string[]; patch: import("./types").TaskPatch }) => api.tasks.update(v.ids, v.patch));
export const useCancelTasks = () => useTaskMutation((v: { ids: string[]; reason: string }) => api.tasks.cancel(v.ids, v.reason));

// ---------- Pipeline (SM) ----------
export const useLeads = () => useQuery({ queryKey: ["leads"], queryFn: api.leads.list });
export const useLeadDetail = (id: string | undefined) =>
  useQuery({ queryKey: ["leads", "detail", id], queryFn: () => api.leads.get(id!), enabled: !!id });
function useLeadMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }) });
}
export const useMoveLead = () =>
  useLeadMutation((v: { id: string; to: "evaluated" | "meeting" | "accepted" | "contract" }) => api.leads.move(v.id, v.to));
export const useDiscardLead = () => useLeadMutation((v: { id: string; reason: string }) => api.leads.discard(v.id, v.reason));
export const useAddLeadNote = () => useLeadMutation((v: { id: string; body: string }) => api.leads.addNote(v.id, v.body));
/** Creates a business and its tasks: refresh everything. */
export function useSignLeadContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; signed_on: string }) => api.leads.markContractSigned(v.id, v.signed_on),
    onSuccess: () => qc.invalidateQueries(),
  });
}
export function useSetBookingUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string | null) => api.users.setBookingUrl(url),
    onSuccess: () => qc.invalidateQueries(),
  });
}
