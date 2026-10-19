import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./index";
import type { DocumentUpload, SetBrandInput, SubmitVersionInput } from "./repositories";
import type {
  BusinessProfilePatch,
  CatalogItemInput,
  ContractSignature,
  CreateFirmInput,
  CreateOfficeInput,
  DistributionLineInput,
  FirmPatch,
  FundPaymentInput,
  InviteUserInput,
  ManualLeadInput,
  MarkPaidInput,
  InviteMemberInput,
  OpenTasksPolicy,
  PlatformRules,
  ProfileChangeInput,
  PublishManualInput,
  SubmitReportInput,
} from "./types";

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
/** Active catalog entries. SM Global admin screens use useCatalogAdmin (archived included). */
export const useCatalog = () => useQuery({ queryKey: ["catalog", "active"], queryFn: () => api.catalog.list() });
export const useOpenOwnerRequests = () => useQuery({ queryKey: ["tasks", "owner-requests"], queryFn: api.tasks.listOpenOwnerRequests });
export const useBusinesses = () => useQuery({ queryKey: queryKeys.businesses, queryFn: api.businesses.list });
/** True when the current user owns a business that already finished the program and franchises. Decides the owner menu and home. */
export function useIsFranchisor(): boolean {
  const me = useCurrentUser().data;
  const businesses = useBusinesses().data;
  return me?.role === "business_owner" && businesses?.find((b) => b.id === me.business_id)?.status === "franchisor";
}
export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: () => api.users.list() });
/** Everyone in scope, deactivated people included (Personas, Equipo, Mi equipo). */
export const useUsersWithInactive = () => useQuery({ queryKey: [...queryKeys.users, "with-inactive"], queryFn: () => api.users.list({ include_inactive: true }) });
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

// ---------- Sign-in (public screens) ----------
/** Queries of the sign-in screens themselves; kept when the session changes. */
const AUTH_KEY = "auth";

/** A new person signed in: drop every cached answer of the previous session (nothing of it may show). */
const resetSessionCache = (qc: ReturnType<typeof useQueryClient>) =>
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== AUTH_KEY });

/**
 * Synchronous read for the route guard. Subscribed to the session query, so a logout (which invalidates it)
 * re-renders the guard.
 */
export function useIsAuthenticated(): boolean {
  useCurrentUser();
  return api.session.isAuthenticated();
}

function useSessionStart<V>(fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => resetSessionCache(qc) });
}
export const useLogin = () => useSessionStart((v: import("./types").LoginInput) => api.session.login(v));
export const useAcceptInvitation = () => useSessionStart((v: import("./types").AcceptInvitationInput) => api.session.acceptInvitation(v));

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (_: void) => api.session.logout(),
    // Not awaited: the caller navigates to /login right away and the shell unmounts.
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
export const useRequestMagicLink = () => useMutation({ mutationFn: (email: string) => api.session.requestMagicLink(email) });
export const useForgotPassword = () => useMutation({ mutationFn: (email: string) => api.session.forgotPassword(email) });
export const useResetPassword = () => useMutation({ mutationFn: (v: import("./types").ResetPasswordInput) => api.session.resetPassword(v) });

/** Reads the invitation (who, which business, which role). A bad token is an answer, not something to retry. */
export const useExchangeInvitation = (token: string) =>
  useQuery({ queryKey: [AUTH_KEY, "invitation", token], queryFn: () => api.session.exchangeInvitation(token), retry: false, staleTime: Infinity, refetchOnWindowFocus: false });

/**
 * Uses the magic link once and starts the session. A query (not a mutation) so a remount or React StrictMode
 * shares the same exchange instead of spending the single-use token twice.
 */
export function useExchangeMagicLink(token: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: [AUTH_KEY, "magic-link", token],
    queryFn: async () => {
      const user = await api.session.exchangeMagicLink(token);
      resetSessionCache(qc);
      return user;
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

/** Task mutations refresh both the list and every detail (status, blocked flags). An approval may also apply the brand. */
function useTaskMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.tasks }), qc.invalidateQueries({ queryKey: ["notifications"] }), qc.invalidateQueries({ queryKey: ["brand"] })]),
  });
}

export const useStartTask = () => useTaskMutation((id: string) => api.tasks.start(id));
/** Undo a start made by mistake: in_progress → pending. */
export const useUnstartTask = () => useTaskMutation((id: string) => api.tasks.updateStatus(id, "pending"));
export const useSubmitVersion = () =>
  useTaskMutation((v: { id: string } & SubmitVersionInput) => api.tasks.submitVersion(v.id, v));
export const useAddComment = () =>
  useTaskMutation((v: { id: string; body: string; file_id: string | null; file?: File | null }) => api.tasks.addComment(v.id, v));
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
  useTaskMutation((v: { requestId: string; file_name: string; note: string; file?: File | null }) => api.tasks.answerOwnerRequest(v.requestId, v));
export const useConfirmMeeting = () => useTaskMutation((id: string) => api.tasks.confirmMeeting(id));

export const useUpdateTasks = () =>
  useTaskMutation((v: { ids: string[]; patch: import("./types").TaskPatch }) => api.tasks.update(v.ids, v.patch));
export const useCancelTasks = () => useTaskMutation((v: { ids: string[]; reason: string }) => api.tasks.cancel(v.ids, v.reason));

// ---------- Pipeline (SM) ----------
/** LeadWithComputed[]. SM team: its office. SM Global: every office (read only), or one office with officeId. */
export const useLeads = (officeId?: string) =>
  useQuery({
    queryKey: ["leads", "list", officeId ?? "all"],
    queryFn: () => api.leads.list(officeId ? { office_id: officeId } : undefined),
    // Changing the office filter keeps the previous board on screen until the new one arrives.
    placeholderData: keepPreviousData,
  });
export const useLeadDetail = (id: string | undefined) =>
  useQuery({ queryKey: ["leads", "detail", id], queryFn: () => api.leads.get(id!), enabled: !!id });
function useLeadMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }) });
}
export const useMoveLead = () =>
  useLeadMutation((v: { id: string; to: "evaluated" | "meeting" | "documents" | "accepted" }) => api.leads.move(v.id, v.to));
export const useDiscardLead = () => useLeadMutation((v: { id: string; reason: string }) => api.leads.discard(v.id, v.reason));
export const useAddLeadNote = () => useLeadMutation((v: { id: string; body: string }) => api.leads.addNote(v.id, v.body));
/** "Agregar negocio": a lead added by hand, in Evaluado with source "manual" and no result. */
export const useCreateManualLead = () => useLeadMutation((input: ManualLeadInput) => api.leads.createManual(input));
/** "Enviar el assessment" to a manual lead: it shows "Assessment pendiente". */
export const useSendAssessment = () => useLeadMutation((id: string) => api.leads.sendAssessment(id));
/**
 * "Confirmar inicio del programa": tripartite signed and funds complete. Moves the lead and the business to
 * in_program and generates its tasks: refresh everything.
 */
export function useConfirmProgramStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; day1: string }) => api.leads.confirmProgramStart(v.id, v.day1),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ---------- Automatic entry, zones, "Ya lo tenía", ficha del negocio ----------
/** LeadMeetingItem[]: booked meetings of the current consultant's leads (SM team; empty for anyone else). */
export const useLeadMeetings = (enabled = true) => useQuery({ queryKey: ["leads", "meetings"], queryFn: api.leads.listMeetings, enabled });
export const useAddMeetingNote = () => useLeadMutation((v: { id: string; body: string }) => api.leads.addMeetingNote(v.id, v.body));
/** Demo: they also notify the consultant, so the bell refreshes too. */
export const useSimulateAssessment = () => useNetworkMutation((_: void) => api.leads.simulateAssessment(), ["leads", "notifications"]);
export const useSimulateBooking = () => useNetworkMutation((id: string) => api.leads.simulateBooking(id), ["leads", "notifications"]);
/** RoutingRules: zones (state or city → office) and the default office. SM team and SM Global. */
export const useRoutingRules = () => useQuery({ queryKey: ["routing"], queryFn: api.routing.getRules });
export const useSetZone = () => useNetworkMutation((input: import("./types").ZoneRuleInput) => api.routing.setRule(input), ["routing"]);
export const useRemoveZone = () => useNetworkMutation((id: string) => api.routing.removeRule(id), ["routing"]);
export const useSetDefaultOffice = () => useNetworkMutation((officeId: string) => api.routing.setDefaultOffice(officeId), ["routing"]);
/** "Ya lo tenía" / "Hay que hacerla" / undo, on a task marked "A validar". */
export const useResolvePreValidation = () =>
  useNetworkMutation((v: { id: string; input: import("./types").PreValidationInput }) => api.tasks.resolvePreValidation(v.id, v.input), ["tasks", "business-file", "notifications"]);
/** AssessmentSnapshot | null of a business (owner: own, without the score). */
export const useBusinessSnapshot = (businessId?: string) =>
  useQuery({ queryKey: ["business-file", "snapshot", businessId ?? "own"], queryFn: () => api.businessFile.getSnapshot(businessId) });
/** BusinessMilestone[] newest first (SM only). */
export const useBusinessMilestones = (businessId: string, enabled = true) =>
  useQuery({ queryKey: ["business-file", "milestones", businessId], queryFn: () => api.businessFile.listMilestones(businessId), enabled });

// ---------- Bishop funds and distribution (SM and that Bishop only) ----------
/** Funds and distribution writes also change the lead (action, activity) and the Bishop screens. */
const MONEY_ROOTS = ["funds", "distribution", "leads", "bishop", "notifications"];
/** BishopFunds | null of one business: total, received, status, payments (with receipt). */
export const useBusinessFunds = (businessId: string | undefined) =>
  useQuery({ queryKey: ["funds", "business", businessId], queryFn: () => api.funds.get(businessId!), enabled: !!businessId });
/** BishopFunds[]: every business the current Bishop funds. */
export const useMyFunds = (enabled = true) => useQuery({ queryKey: ["funds", "mine"], queryFn: api.funds.listMine, enabled });
export const useRecordFundPayment = () =>
  useNetworkMutation((v: { businessId: string; input: FundPaymentInput }) => api.funds.recordPayment(v.businessId, v.input), MONEY_ROOTS);
export const useReportFundPayment = () =>
  useNetworkMutation((v: { businessId: string; input: FundPaymentInput }) => api.funds.reportPayment(v.businessId, v.input), MONEY_ROOTS);
export const useConfirmFundPayment = () =>
  useNetworkMutation((v: { businessId: string; paymentId: string }) => api.funds.confirmPayment(v.businessId, v.paymentId), MONEY_ROOTS);
export const useRemoveFundPayment = () =>
  useNetworkMutation((v: { businessId: string; paymentId: string }) => api.funds.removePayment(v.businessId, v.paymentId), MONEY_ROOTS);
/** Distribution | null: one line per firm plus SM (orchestration), received / assigned / unassigned / paid. */
export const useDistribution = (businessId: string | undefined) =>
  useQuery({ queryKey: ["distribution", businessId], queryFn: () => api.distribution.get(businessId!), enabled: !!businessId });
export const useSaveDistributionLine = () =>
  useNetworkMutation((v: { businessId: string; input: DistributionLineInput }) => api.distribution.saveLine(v.businessId, v.input), MONEY_ROOTS);
export const useClearDistributionLine = () =>
  useNetworkMutation((v: { businessId: string; organizationId: string | null }) => api.distribution.clearLine(v.businessId, v.organizationId), MONEY_ROOTS);
export const useMarkDistributionPaid = () =>
  useNetworkMutation((v: { businessId: string; paymentId: string; input: MarkPaidInput }) => api.distribution.markPaid(v.businessId, v.paymentId, v.input), MONEY_ROOTS);
export const useMarkDistributionPending = () =>
  useNetworkMutation((v: { businessId: string; paymentId: string }) => api.distribution.markPending(v.businessId, v.paymentId), MONEY_ROOTS);
// ---------- Entry (NDA, MOU, documents) ----------
/** LeadIntake | null: summary (clock, counts, approval), NDA/MOU with signer status, and the entry documents. */
export const useLeadIntake = (id: string | undefined) =>
  useQuery({ queryKey: ["leads", "intake", id], queryFn: () => api.leads.getIntake(id!), enabled: !!id });
/** Entry writes touch leads, documents and contracts: refresh both roots. */
function useIntakeMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["documents"] }), qc.invalidateQueries({ queryKey: ["bishop"] })]),
  });
}
/** LeadInvestors | null: who saw the opportunity, who passed, who accepted, tripartite contract. */
export const useLeadInvestors = (id: string | undefined) =>
  useQuery({ queryKey: ["leads", "investors", id], queryFn: () => api.leads.getInvestors(id!), enabled: !!id });
export const useReleaseOpportunity = () => useIntakeMutation((v: { id: string; reason: string }) => api.leads.releaseOpportunity(v.id, v.reason));
export const useSendTripartite = () => useIntakeMutation((id: string) => api.leads.sendTripartite(id));
export const useSendNdaMou = () => useIntakeMutation((id: string) => api.leads.sendNdaMou(id));
export const useAcceptDocument = () => useIntakeMutation((v: { id: string; documentId: string; fact: string }) => api.leads.acceptDocument(v.id, v.documentId, v.fact));
export const useRequestDocument = () => useIntakeMutation((v: { id: string; documentId: string; comment: string }) => api.leads.requestDocument(v.id, v.documentId, v.comment));
export const useResendContract = () => useIntakeMutation((v: { id: string; contractId: string }) => api.leads.resendContract(v.id, v.contractId));
export const useApproveDocuments = () => useIntakeMutation((id: string) => api.leads.approveDocuments(id));
export const useRejectDocuments = () => useIntakeMutation((v: { id: string; reason: string }) => api.leads.rejectDocuments(v.id, v.reason));
/** IntakeSummary | null of a business in onboarding (owner: own). */
export const useIntake = (businessId?: string) =>
  useQuery({ queryKey: ["documents", "intake", businessId ?? "own"], queryFn: () => api.documents.getIntake(businessId) });
export const useOpenContract = () => useIntakeMutation((contractId: string) => api.documents.openContract(contractId));
export const useSignContract = () => useIntakeMutation((v: { contractId: string; signature: ContractSignature }) => api.documents.signContract(v.contractId, v.signature));
export const useDeclineContract = () => useIntakeMutation((v: { contractId: string; reason: string }) => api.documents.declineContract(v.contractId, v.reason));
/** True when the current user owns a business still entering (NDA and MOU sent, not in program yet). */
export function useIsOnboarding(): boolean {
  const me = useCurrentUser().data;
  const businesses = useBusinesses().data;
  return me?.role === "business_owner" && businesses?.find((b) => b.id === me.business_id)?.status === "onboarding";
}

export function useSetBookingUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string | null) => api.users.setBookingUrl(url),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ---------- Accounts and partner firms ----------
/** People, firms and tasks change together (a replaced firm moves tasks; a new person changes who can be assigned). */
const ACCOUNT_ROOTS = ["users", "organizations", "tasks", "network", "business-profile", "session"];
/** AccountEvent[] of one person (or everyone in scope), newest first. */
export const useAccountEvents = (userId?: string) =>
  useQuery({ queryKey: [...queryKeys.users, "events", userId ?? "all"], queryFn: () => api.users.listAccountEvents(userId) });
export const useInviteUser = () => useNetworkMutation((input: InviteUserInput) => api.users.invite(input), ACCOUNT_ROOTS);
/** Demo: the invited person accepts and becomes active. */
export const useSimulateAcceptance = () => useNetworkMutation((userId: string) => api.users.simulateAcceptance(userId), ACCOUNT_ROOTS);
export const useDeactivateUser = () => useNetworkMutation((v: { userId: string; reason: string }) => api.users.deactivate(v.userId, v.reason), ACCOUNT_ROOTS);
export const useReactivateUser = () => useNetworkMutation((userId: string) => api.users.reactivate(userId), ACCOUNT_ROOTS);
export const useSetUserAdmin = () => useNetworkMutation((v: { userId: string; isAdmin: boolean }) => api.users.setAdmin(v.userId, v.isAdmin), ACCOUNT_ROOTS);
/** FirmEvent[] of one firm (or every firm in scope), newest first. */
export const useFirmEvents = (organizationId?: string) =>
  useQuery({ queryKey: ["organizations", "firm-events", organizationId ?? "all"], queryFn: () => api.organizations.listFirmEvents(organizationId) });
export const useCreateFirm = () => useNetworkMutation((input: CreateFirmInput) => api.organizations.createFirm(input), ACCOUNT_ROOTS);
export const useUpdateFirm = () => useNetworkMutation((v: { id: string; patch: FirmPatch }) => api.organizations.updateFirm(v.id, v.patch), ACCOUNT_ROOTS);
export const useReplaceFirm = () =>
  useNetworkMutation((v: { id: string; input: CreateFirmInput; openTasks: OpenTasksPolicy }) => api.organizations.replaceFirm(v.id, v.input, v.openTasks), ACCOUNT_ROOTS);
export const useDeactivateFirm = () => useNetworkMutation((v: { id: string; reason: string }) => api.organizations.deactivateFirm(v.id, v.reason), ACCOUNT_ROOTS);
/** Owner hands the business over to a team member with an active account. */
export const useMakeOwner = () => useNetworkMutation((memberId: string) => api.businessProfile.makeOwner(memberId), [...ACCOUNT_ROOTS, "businesses", "brand"]);

// ---------- Business brand (white label) ----------
/** BusinessBrand | null the current user's portal shows (null = Strategic Mates brand). Drives the shell colors. */
export const useMyBrand = () => useQuery({ queryKey: ["brand", "mine"], queryFn: api.brand.getMine });
/** BusinessBrand | null of a business (owner: own; SM: the one named). */
export const useBusinessBrand = (businessId?: string, enabled = true) =>
  useQuery({ queryKey: ["brand", "business", businessId ?? "own"], queryFn: () => api.brand.get(businessId), enabled });
export const useBrandEvents = (businessId: string | undefined) =>
  useQuery({ queryKey: ["brand", "events", businessId], queryFn: () => api.brand.listEvents(businessId!), enabled: !!businessId });
export const useSetBrand = () => useNetworkMutation((v: { businessId: string; palette: SetBrandInput }) => api.brand.set(v.businessId, v.palette), ["brand"]);
export const useResetBrand = () => useNetworkMutation((businessId: string) => api.brand.reset(businessId), ["brand"]);

export const useBusinessEvents = (businessId: string) =>
  useQuery({ queryKey: [...queryKeys.businesses, "events", businessId], queryFn: () => api.businesses.listEvents(businessId) });

export function useSetBusinessConsultant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ businessId, userId }: { businessId: string; userId: string }) => api.businesses.setConsultant(businessId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.businesses }),
  });
}

// =====================================================================================================
// Network, franchises, manual, owner data, Business Bishop, franchisee, rules and catalog admin.
// Each section is used by one feature folder (components/global, owner, bishop, franchisee).
// =====================================================================================================

/** Mutations of the network data refresh everything under the given key roots. */
function useNetworkMutation<V, R>(fn: (v: V) => Promise<R>, roots: string[]) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all(roots.map((r) => qc.invalidateQueries({ queryKey: [r] }))) });
}

// ---------- SM Global: network ----------
/** NetworkSummary: counts of offices, programs, franchisors, franchises and last-month sales and royalties. */
export const useNetworkSummary = () => useQuery({ queryKey: ["network", "summary"], queryFn: api.network.getSummary });
/** OfficeSummary[]: { office, manager, stats }. SM Global gets every office, an SM team user only its own. */
export const useOffices = () => useQuery({ queryKey: ["network", "offices"], queryFn: api.network.listOffices });
/** OfficeDetail | null: summary plus businesses (with health), firms and team. */
export const useOffice = (id: string | undefined) =>
  useQuery({ queryKey: ["network", "offices", id], queryFn: () => api.network.getOffice(id!), enabled: !!id });
/** StructureTree: { root, counts } with global > offices > businesses > franchises and firms under each office. */
export const useStructure = () => useQuery({ queryKey: ["network", "structure"], queryFn: api.network.getStructure });
/** AreaBottleneck[]: one row per area B1..B6, most overdue first, with the breakdown by office. */
export const useBottlenecks = () => useQuery({ queryKey: ["network", "bottlenecks"], queryFn: api.network.listBottlenecks });
/** NetworkFunnel: leads per stage, overall and by office. */
export const useNetworkFunnel = () => useQuery({ queryKey: ["network", "funnel"], queryFn: api.network.getFunnel });
/** Offices change who is in the network: refresh offices, structure, users and organizations. */
const OFFICE_ROOTS = ["network", "organizations", "users"];
/** SM Global opens an office: it starts in "opening" with its checklist. */
export const useCreateOffice = () => useNetworkMutation((input: CreateOfficeInput) => api.network.createOffice(input), OFFICE_ROOTS);
export const usePauseOffice = () => useNetworkMutation((v: { officeId: string; reason: string }) => api.network.pauseOffice(v.officeId, v.reason), OFFICE_ROOTS);
/** Opening office: only with its checklist complete. Paused office: resumes. */
export const useActivateOffice = () => useNetworkMutation((officeId: string) => api.network.activateOffice(officeId), OFFICE_ROOTS);

// ---------- SM Global: rules and catalog admin ----------
/** PlatformRules: franchisability goal, required task codes, area amber days, amber tolerance. Readable by everyone. */
export const useRules = () => useQuery({ queryKey: ["rules"], queryFn: api.rules.get });
/** RulesChange[]: history of rule changes, newest first (SM Global). */
export const useRulesHistory = () => useQuery({ queryKey: ["rules", "history"], queryFn: api.rules.listHistory });
export const useUpdateRules = () =>
  useNetworkMutation((v: { patch: Partial<PlatformRules>; note?: string | null }) => api.rules.update(v.patch, v.note ?? null), ["rules", "tasks", "businesses", "network"]);
/** CatalogAdminItem[] with archived entries (SM Global). */
export const useCatalogAdmin = () => useQuery({ queryKey: ["catalog", "admin"], queryFn: () => api.catalog.list({ include_archived: true }) });
/** CatalogChange[]: history of catalog edits, newest first; one code or all (SM Global). */
export const useCatalogHistory = (code?: string) => useQuery({ queryKey: ["catalog", "history", code ?? "all"], queryFn: () => api.catalog.listHistory(code) });
export const useAddCatalogItem = () => useNetworkMutation((input: CatalogItemInput) => api.catalog.add(input), ["catalog"]);
export const useUpdateCatalogItem = () =>
  useNetworkMutation((v: { code: string; patch: Partial<CatalogItemInput>; note?: string | null }) => api.catalog.update(v.code, v.patch, v.note ?? null), ["catalog"]);
export const useArchiveCatalogItem = () => useNetworkMutation((v: { code: string; reason: string }) => api.catalog.archive(v.code, v.reason), ["catalog"]);
export const useRestoreCatalogItem = () => useNetworkMutation((code: string) => api.catalog.restore(code), ["catalog"]);

// ---------- Franchises ----------
/** FranchiseSummary[]: units in scope with franchisee name, compliance %, open tickets and last report. */
export const useFranchises = (franchisorBusinessId?: string) =>
  useQuery({ queryKey: ["franchises", "list", franchisorBusinessId ?? "all"], queryFn: () => api.franchises.list(franchisorBusinessId) });
/** FranchiseDetail | null: summary, franchisee, reports, checklist, tickets, tasks, team. */
export const useFranchise = (id: string | undefined) =>
  useQuery({ queryKey: ["franchises", "detail", id], queryFn: () => api.franchises.get(id!), enabled: !!id });
/** FranchisorSummary: franchise counts, last-month sales, royalties and marketing fund, tickets, manual version. */
export const useFranchisorSummary = (businessId?: string) =>
  useQuery({ queryKey: ["franchises", "summary", businessId ?? "own"], queryFn: () => api.franchises.getFranchisorSummary(businessId) });
/** FranchiseReport[]: monthly reports (sales, royalty 5%, marketing fund 3%, status due/submitted/paid), newest first. */
export const useFranchiseReports = (franchiseId?: string) =>
  useQuery({ queryKey: ["franchises", "reports", franchiseId ?? "all"], queryFn: () => api.franchises.listReports(franchiseId) });
/** Franchisee submits a report: fees are computed from gross sales. */
export const useSubmitFranchiseReport = () =>
  useNetworkMutation((v: { franchiseId: string } & SubmitReportInput) => api.franchises.submitReport(v.franchiseId, { month: v.month, gross_sales: v.gross_sales }), ["franchises", "franchisee"]);
/** SupportTicket[] of the franchises in scope (franchisor, SM). A franchisee uses useFranchiseeTickets. */
export const useFranchiseTickets = () => useQuery({ queryKey: ["franchises", "tickets"], queryFn: api.franchises.listTickets });

// ---------- Manual ----------
/** ManualOverview: sections with % and status, versions (newest first), current version, completion %. */
export const useManual = (businessId?: string) =>
  useQuery({ queryKey: ["manual", businessId ?? "own"], queryFn: () => api.manual.get(businessId) });
/** Franchisor publishes the next version; franchises follow it and get a task to read it. */
export const usePublishManual = () =>
  useNetworkMutation((v: { businessId: string } & PublishManualInput) => api.manual.publish(v.businessId, { note: v.note, section_ids: v.section_ids }), ["manual", "franchises", "franchisee"]);
/** Owner approves a section once all the catalog tasks that feed it are approved. */
export const useApproveManualSection = () => useNetworkMutation((sectionId: string) => api.manual.approveSection(sectionId), ["manual"]);

// ---------- Documents, numbers, business ----------
/** BusinessDocument[]: requested / received / reviewed. Owner: own business. SM: pass a businessId or get all of its office. */
export const useDocuments = (businessId?: string) =>
  useQuery({ queryKey: ["documents", "files", businessId ?? "all"], queryFn: () => api.documents.listDocuments(businessId) });
/** Contract[] with DocuSeal-like state (draft, sent, opened, signed, declined) and signers. */
export const useContracts = (businessId?: string) =>
  useQuery({ queryKey: ["documents", "contracts", businessId ?? "all"], queryFn: () => api.documents.listContracts(businessId) });
export const useUploadDocument = () =>
  useNetworkMutation((v: { documentId: string; file: DocumentUpload }) => api.documents.uploadDocument(v.documentId, v.file), ["documents", "leads"]);
/** FinancialSeries | null: months, revenue, margin %, cash and the before/now table. */
export const useFinancials = (businessId?: string) =>
  useQuery({ queryKey: ["financials", businessId ?? "own"], queryFn: () => api.financials.get(businessId) });
/** BusinessProfile | null: legal name, address, contact, years, employees. */
export const useBusinessProfile = (businessId?: string) =>
  useQuery({ queryKey: ["business-profile", "profile", businessId ?? "own"], queryFn: () => api.businessProfile.get(businessId) });
export const useUpdateBusinessProfile = () =>
  useNetworkMutation((patch: BusinessProfilePatch) => api.businessProfile.update(patch), ["business-profile"]);
/** ProfileChangeRequest[] of a business: the owner's asks to change verified data, newest first. */
export const useProfileChangeRequests = (businessId?: string) =>
  useQuery({ queryKey: ["business-profile", "changes", businessId ?? "own"], queryFn: () => api.businessProfile.listChangeRequests(businessId) });
export const useRequestProfileChange = () =>
  useNetworkMutation((input: ProfileChangeInput) => api.businessProfile.requestChange(input), ["business-profile"]);
export const useResolveProfileChange = () =>
  useNetworkMutation((v: { id: string; status: "applied" | "rejected"; note: string | null }) => api.businessProfile.resolveChangeRequest(v.id, v.status, v.note), ["business-profile"]);
/** TeamMember[] of a business (active or invited). */
export const useBusinessTeam = (businessId?: string) =>
  useQuery({ queryKey: ["business-profile", "team", businessId ?? "own"], queryFn: () => api.businessProfile.listTeam(businessId) });
export const useInviteTeamMember = () =>
  useNetworkMutation((input: InviteMemberInput) => api.businessProfile.inviteMember(input), ["business-profile"]);

// ---------- Business Bishop ----------
/** BishopPortfolio: { investments (invested, recovered, current share %, payback month, monthly recovery series), totals }. */
export const useBishopPortfolio = () => useQuery({ queryKey: ["bishop", "portfolio"], queryFn: api.bishop.getPortfolio });
/** BishopOpportunity[]: businesses SM presents to the Bishop, with decision none/interested/passed. */
export const useBishopOpportunities = () => useQuery({ queryKey: ["bishop", "opportunities"], queryFn: api.bishop.listOpportunities });
/** OpportunityDetail | null: opportunity plus the five-year projection (franchises, revenue, result, Bishop, SM) and the readiness checklist. */
export const useBishopOpportunity = (id: string | undefined) =>
  useQuery({ queryKey: ["bishop", "opportunities", id], queryFn: () => api.bishop.getOpportunity(id!), enabled: !!id });
/** First Bishop takes it; SM sees it on the lead. */
export const useAcceptOpportunity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.bishop.acceptOpportunity(id),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["bishop"] }), qc.invalidateQueries({ queryKey: ["leads"] })]),
  });
};
export const usePassOpportunity = () => useNetworkMutation((id: string) => api.bishop.pass(id), ["bishop"]);
/** Undo a pass. */
export const useClearOpportunityDecision = () => useNetworkMutation((id: string) => api.bishop.clearDecision(id), ["bishop"]);
/** BishopAgreement[]: equity agreement, NDA, drafts. */
export const useBishopAgreements = () => useQuery({ queryKey: ["bishop", "agreements"], queryFn: api.bishop.listAgreements });

// ---------- Franchisee ----------
/** FranchiseeHome: unit summary, franchisor, manual version and unread flag, compliance %, next report, open tasks. */
export const useFranchiseeHome = () => useQuery({ queryKey: ["franchisee", "home"], queryFn: api.franchisee.getHome });
/** ChecklistItem[]: standards (operating) or opening checklist (opening). */
export const useFranchiseeChecklist = () => useQuery({ queryKey: ["franchisee", "checklist"], queryFn: api.franchisee.listChecklist });
/** SupportTicket[] of the franchisee's unit, newest first. */
export const useFranchiseeTickets = () => useQuery({ queryKey: ["franchisee", "tickets"], queryFn: api.franchisee.listTickets });
export const useCreateTicket = () =>
  useNetworkMutation((v: { subject: string; body: string }) => api.franchisee.createTicket(v), ["franchisee", "franchises"]);
/** FranchiseTask[] of the franchisee's unit, soonest first. */
export const useFranchiseeTasks = () => useQuery({ queryKey: ["franchisee", "tasks"], queryFn: api.franchisee.listTasks });
export const useSetFranchiseeTaskDone = () =>
  useNetworkMutation((v: { taskId: string; done: boolean }) => api.franchisee.setTaskDone(v.taskId, v.done), ["franchisee"]);
/** TeamMember[] of the franchisee's unit. */
export const useFranchiseeTeam = () => useQuery({ queryKey: ["franchisee", "team"], queryFn: api.franchisee.listTeam });
