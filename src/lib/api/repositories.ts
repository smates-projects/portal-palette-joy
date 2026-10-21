import type {
  AcceptInvitationInput,
  InvitationPreview,
  LoginInput,
  ResetPasswordInput,
  SetPasswordInput,
  BishopFunds,
  Distribution,
  DistributionLineInput,
  FundPaymentInput,
  MarkPaidInput,
  AreaBottleneck,
  BishopAgreement,
  BishopPortfolio,
  BusinessDocument,
  BusinessProfile,
  BusinessProfilePatch,
  CatalogAdminItem,
  CatalogChange,
  CatalogItemInput,
  ChecklistItem,
  Contract,
  ContractSignature,
  CreateOfficeInput,
  FinancialSeries,
  FranchiseDetail,
  FranchiseReport,
  FranchiseSummary,
  FranchiseTask,
  FranchiseeHome,
  FranchisorSummary,
  InviteMemberInput,
  ManualOverview,
  ManualSection,
  ManualVersion,
  NetworkFunnel,
  NetworkSummary,
  OfficeDetail,
  OfficeSummary,
  OpportunityDetail,
  BishopOpportunity,
  LeadInvestors,
  PlatformRules,
  ProfileChangeInput,
  ProfileChangeRequest,
  PublishManualInput,
  RulesChange,
  StructureTree,
  SubmitReportInput,
  SupportTicket,
  TeamMember,
  IntakeSummary,
  Lead,
  LeadEvent,
  LeadStage,
  LeadWithComputed,
  AppNotification,
  AccountEvent,
  AreaCode,
  IsoDate,
  BrandEvent,
  BrandPalette,
  BrandProposal,
  Business,
  BusinessBrand,
  BusinessEvent,
  CreateFirmInput,
  FirmEvent,
  FirmPatch,
  Franchisability,
  InviteUserInput,
  ManualLeadInput,
  OpenTasksPolicy,
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
  AssessmentSnapshot,
  BusinessMilestone,
  LeadMeetingItem,
  PreValidationInput,
  RoutingRules,
  ZoneRule,
  ZoneRuleInput,
  MeetingOutcomeInput,
  MouAcknowledgmentPoint,
  Availability,
  AvailabilityInput,
  CalendarConnection,
  IsoDateTime,
  PortalMeeting,
  RescheduleMeetingInput,
  ScheduleMeetingInput,
  EntryContractRule,
  EntryContractRuleChange,
  EntryContractRuleInput,
  SigningEntitiesInput,
  ValidationInput,
} from "./types";

import type { RecoveryCodes, SignInResult, TwoFactorSetup, TwoFactorVerifyInput } from "./auth-types";

/**
 * The signed-in person. Every other repository answers "unauthenticated" while there is no session.
 * Tokens (invitation, magic link, entry link, reset) always travel in the body, never in the API URL.
 */
export interface SessionRepository {
  /** Rejects with "unauthenticated" when nobody is signed in. */
  getCurrentUser(): Promise<User>;
  getViewAsOptions(): Promise<ViewAsOption[]>;
  setViewAs(userId: Uuid): Promise<User>;
  /** Synchronous read for the route guard: is there a session right now? */
  isAuthenticated(): boolean;
  /**
   * "invalid_credentials" for a wrong email or password (never says which); "account_inactive" for a deactivated
   * person. Only a User starts the session; a two-factor answer (SignInResult) means one more step.
   */
  login(input: LoginInput): Promise<SignInResult>;
  logout(): Promise<void>;
  /** "Cerrar sesión en todos lados": revokes every session of the current person. */
  logoutAll(): Promise<void>;
  /** Always resolves, whether the email has an account or not. The link lasts 15 minutes and works once. */
  requestMagicLink(email: string): Promise<void>;
  /** Starts the session (or answers a two-factor step). token_invalid | token_expired | token_used | account_inactive. */
  exchangeMagicLink(token: string): Promise<SignInResult>;
  /**
   * Entry link of a business owner (sent when the meeting is booked, opens "Tu ingreso"). Same answers and codes as
   * the magic link. POST /auth/entry-link/exchange { token }.
   */
  exchangeEntryLink(token: string): Promise<SignInResult>;
  /** Reads the invitation without using it. token_invalid | token_expired | token_used. */
  exchangeInvitation(token: string): Promise<InvitationPreview>;
  /** Sets name and password, activates the account and starts the session (or answers a two-factor step). Also name_required | weak_password | terms_required. */
  acceptInvitation(input: AcceptInvitationInput): Promise<SignInResult>;
  /** Second step with the 6-digit TOTP code: starts the session. invalid_code | challenge_invalid | challenge_expired. */
  verifyTwoFactor(input: TwoFactorVerifyInput): Promise<User>;
  /** Same as verifyTwoFactor with one of the recovery codes (each works once). */
  recoverTwoFactor(input: TwoFactorVerifyInput): Promise<User>;
  /**
   * Starts turning TOTP on: signed in (no token) or with the setup token of a 202 setup-required sign-in.
   * setup_token_invalid | two_factor_already_enabled.
   */
  setupTwoFactor(setupToken?: string | null): Promise<TwoFactorSetup>;
  /**
   * Turns TOTP on with the first code from the app and answers the recovery codes (shown once). With a setup token
   * no session starts: the token is used up and the next login asks for the code. invalid_code | setup_token_invalid.
   */
  confirmTwoFactor(code: string, setupToken?: string | null): Promise<RecoveryCodes>;
  /** Signed in: turns TOTP off with a current code. invalid_code. */
  disableTwoFactor(code: string): Promise<void>;
  /** Always resolves, whether the email has an account or not. The reset link lasts 1 hour. */
  forgotPassword(email: string): Promise<void>;
  /** Sets a new password. Does not start a session: the person signs in again. token_* | weak_password. */
  resetPassword(input: ResetPasswordInput): Promise<void>;
  /**
   * Signed in: creates the password of an account that entered through email links, or changes the current one
   * (current_password required then). POST /me/password, 204. current_password_required | invalid_credentials |
   * weak_password. Afterwards GET /me answers has_password true and password_setup_required false.
   */
  setPassword(input: SetPasswordInput): Promise<void>;
}

export interface OrganizationsRepository {
  /** Inactive (replaced) firms are included: screens decide whether to show them. */
  list(): Promise<Organization[]>;
  get(id: Uuid): Promise<Organization | null>;
  /**
   * Office admin (or SM Global): adds a partner firm to the office with its first person (partner_firm, is_admin,
   * invited). One active firm per area: with one already there, use replaceFirm. The first person's invitation is
   * simulated like any other.
   */
  createFirm(input: CreateFirmInput): Promise<Organization>;
  /** Office admin (or SM Global): contact data of a firm of the office. */
  updateFirm(id: Uuid, patch: FirmPatch): Promise<Organization>;
  /**
   * Office admin (or SM Global): the new firm takes the area; the old one becomes inactive with its history (never
   * deleted). Open tasks of the old firm either move to the new firm's first person ("transfer") or finish with the
   * old firm ("keep"). Logged on both firms and on every moved task.
   */
  replaceFirm(id: Uuid, input: CreateFirmInput, openTasks: OpenTasksPolicy): Promise<Organization>;
  /** Office admin (or SM Global): retires a firm with a reason; the area shows "Sin firma". Open tasks finish with it. */
  deactivateFirm(id: Uuid, reason: string): Promise<Organization>;
  /** History of one firm or of every firm in scope, newest first. */
  listFirmEvents(organizationId?: Uuid): Promise<FirmEvent[]>;
}

export interface BusinessesRepository {
  list(): Promise<Business[]>;
  getFranchisability(businessId: Uuid): Promise<Franchisability>;
  /** Business activity, newest first. SM only. */
  listEvents(businessId: Uuid): Promise<BusinessEvent[]>;
  /** SM only: change the assigned consultant (an SM person of the same office, or anyone of SM Global); logged in the activity. */
  setConsultant(businessId: Uuid, userId: Uuid): Promise<Business>;
  /**
   * POST /businesses/{id}/transfer { office_id, consultant_user_id? }: "Derivar a oficina". SM Global and the admin
   * of the source office. The consultant must belong to the target office or to SM Global (invalid_consultant);
   * without one the business keeps its consultant only when that person is SM Global, otherwise the target office's
   * manager takes it. same_office when nothing changes.
   */
  transfer(businessId: Uuid, input: TransferInput): Promise<Business>;
}

/** "Derivar a oficina": the target office and who follows the lead or business there. */
export interface TransferInput {
  office_id: Uuid;
  consultant_user_id?: Uuid | null | undefined;
}

/** POST /me/calendar/connect: where to send the person to grant the calendar access. */
export interface CalendarConsent {
  consent_url: string;
}

export const isCalendarConsent = (value: unknown): value is CalendarConsent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["consent_url"] === "string";

/**
 * Calendar v2. Every role connects Google Calendar with read and write access: the portal reads free time to offer
 * common slots and creates the meetings (with the Meet link) in the organizer's calendar. A meeting where the
 * organizer or a guest is not connected stays "proposed" until they confirm. Error codes: participant_not_visible,
 * slot_unavailable, calendar_write_scope_required, meeting_in_past, too_many_participants.
 */
export interface CalendarRepository {
  /** GET /me/calendar. */
  getConnection(): Promise<CalendarConnection>;
  /** POST /me/calendar/connect: Google's consent URL (real API) or the connection itself (mock, at once). */
  connect(): Promise<CalendarConsent | CalendarConnection>;
  /** DELETE /me/calendar. */
  disconnect(): Promise<CalendarConnection>;
  /** SM: GET /users/{id}/calendar-status. */
  getUserStatus(userId: Uuid): Promise<CalendarConnection>;
  /** POST /calendar/availability: common free slots (30-minute grid inside meeting_hours) and who could not be read. */
  availability(input: AvailabilityInput): Promise<Availability>;
  /** POST /meetings (Idempotency-Key). Confirmed and in Google when everyone is connected, proposed otherwise. */
  schedule(input: ScheduleMeetingInput): Promise<PortalMeeting>;
  /** PATCH /meetings/{id} with If-Match ("Mover"). Organizer or SM. */
  reschedule(id: Uuid, input: RescheduleMeetingInput): Promise<PortalMeeting>;
  /** DELETE /meetings/{id} with If-Match, optional reason. Organizer or SM. */
  cancel(id: Uuid, reason?: string | null): Promise<void>;
  /** GET /me/meetings?from&to: meetings the current user organizes or joins, every kind, soonest first. */
  listMyMeetings(from: IsoDateTime, to: IsoDateTime): Promise<PortalMeeting[]>;
  /** GET /meetings/{id}; null when it does not exist or is not visible. */
  getMeeting(id: Uuid): Promise<PortalMeeting | null>;
}

export interface UsersRepository {
  /** People in the current user's scope. Deactivated people are left out unless include_inactive. */
  list(opts?: { include_inactive?: boolean }): Promise<User[]>;
  /**
   * Creates the account as "invited" (the mail is simulated). Who may invite whom lives in
   * src/lib/accounts/permissions.ts (canInvite) and is enforced here: "forbidden" otherwise.
   */
  invite(input: InviteUserInput): Promise<User>;
  /** Demo only: the person accepts the invitation and becomes active. Anyone who manages the account may trigger it. */
  simulateAcceptance(userId: Uuid): Promise<User>;
  /** Deactivates with a required reason. Nobody is deleted; the history keeps it. Never yourself. */
  deactivate(userId: Uuid, reason: string): Promise<User>;
  reactivate(userId: Uuid): Promise<User>;
  /** SM Global only: grants or removes the admin flag inside the person's organization. */
  setAdmin(userId: Uuid, isAdmin: boolean): Promise<User>;
  /** Account history of one person (or of everyone in scope), newest first. */
  listAccountEvents(userId?: Uuid): Promise<AccountEvent[]>;
  /**
   * Connect (with an account email) or disconnect (null) the current user's Google Calendar. The mock connects at
   * once and answers the User. The real API answers connecting with Google's consent screen (CalendarConsent): the
   * caller sends the person there, and Google comes back to /perfil?calendar=connected|denied|error.
   */
  setGoogleCalendar(email: string | null): Promise<User | CalendarConsent>;
  /** Current user's Google Calendar events; empty when not connected. */
  listCalendarEvents(): Promise<ExternalCalendarEvent[]>;
  /** SM team: set or clear the current user's booking link. */
  setBookingUrl(url: string | null): Promise<User>;
  /**
   * SM Global only: whether an SM person may sign for SM Square (PATCH /users/{id}/signing-entities). invalid_user for
   * anyone who is not SM.
   */
  setSigningEntities(userId: Uuid, input: SigningEntitiesInput): Promise<User>;
}

export interface LeadIntake {
  summary: IntakeSummary;
  contracts: Contract[];
  documents: BusinessDocument[];
}

export interface LeadDetail {
  lead: LeadWithComputed;
  events: LeadEvent[];
}

/**
 * SM team: its own office, full access. SM Global: reads the leads of every office (optionally one office)
 * but never changes them; every write is SM team only.
 */
export interface LeadsRepository {
  list(opts?: { office_id?: Uuid }): Promise<LeadWithComputed[]>;
  get(id: Uuid): Promise<LeadDetail | null>;
  /** One step back, Evaluado → Reunión, or reactivate a discarded lead to evaluated (see resolveLeadMove). */
  move(id: Uuid, to: Exclude<LeadStage, "discarded" | "in_program">): Promise<LeadWithComputed>;
  /** Required reason. Not allowed once in program. */
  discard(id: Uuid, reason: string): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/reactivate: SM Global brings back a lead the API discarded by itself (reason mou_not_signed when
   * the meeting was held without the MOU signed). Back to the stage it was in. invalid_transition when not discarded.
   */
  reactivate(id: Uuid): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/transfer { office_id, consultant_user_id }: "Derivar a oficina". SM Global and the admin of the
   * source office. The consultant must be of the target office or SM Global (invalid_consultant); same_office when
   * the office does not change. Logged as "transferred" with the office name.
   */
  transfer(id: Uuid, input: TransferInput): Promise<LeadWithComputed>;
  addNote(id: Uuid, body: string): Promise<LeadEvent>;
  /**
   * POST /leads/{id}/send-nda. The booking already does it by itself; SM uses it for a lead moved to Reunión by hand:
   * owner account (no password, entry link), business in onboarding and the mutual NDA, Strategic Mates pre-signed
   * when the rule says so. invalid_state when the NDA already exists.
   */
  sendNda(id: Uuid): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/send-mou. "Se hizo" on the initial meeting does it by itself; SM uses it when there was no
   * booked meeting. Reunión → Documentación: the MOU (with the four points to confirm) and the entry documents,
   * locked until the owner signs the MOU. invalid_state without the NDA or with the MOU already sent.
   */
  sendMou(id: Uuid): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/meetings/{meetingId}/outcome (If-Match on the lead), the answer to "¿Se hizo?". held on the
   * initial meeting sends the MOU; held on the expansion meeting sets expansion_meeting_held_at. no_show and
   * reschedule wait for a new booking. outcome_already_set once answered; invalid_transition before the meeting started
   * (except reschedule).
   */
  setMeetingOutcome(leadId: Uuid, meetingId: Uuid, input: MeetingOutcomeInput): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/present-to-bishops { bishop_user_ids }: SM picks which Bishops see the approved business (with
   * the rule "presented" only they see it). Accepted leads only; Bishops with the framework signed. Each one is told.
   */
  presentToBishops(id: Uuid, bishopUserIds: Uuid[]): Promise<LeadInvestors>;
  /** Entry checklist. SM team of the office and SM Global. */
  getIntake(id: Uuid): Promise<LeadIntake | null>;
  /** Any SM person of the office. The verified fact is what the Bishop sees. */
  acceptDocument(id: Uuid, documentId: Uuid, verifiedFact: string): Promise<BusinessDocument>;
  /** Any SM person of the office; comment required. Pauses the review clock. */
  requestDocument(id: Uuid, documentId: Uuid, comment: string): Promise<BusinessDocument>;
  /** After 3 days without signing. */
  resendContract(id: Uuid, contractId: Uuid): Promise<Contract>;
  /** documents → accepted. Only the office admin or an SM Global admin, with everything signed and accepted. */
  approveDocuments(id: Uuid): Promise<LeadWithComputed>;
  /**
   * accepted → in_program, only with the tripartite contract signed by the three and the Bishop funds complete
   * (readyToStart). Day 1 is the proposed date (whichever happened last) or a later one SM picks. The business
   * goes from onboarding to in_program and its tasks are generated from the catalog. SM team of the office.
   */
  confirmProgramStart(id: Uuid, day1: string): Promise<{ lead: Lead; business_id: Uuid; task_count: number }>;
  /**
   * @deprecated Old "Marcar contrato firmado" step, kept only for older tests: it starts the program without
   * checking the tripartite contract or the funds. Screens use confirmProgramStart.
   */
  startProgram(id: Uuid, day1: string): Promise<{ lead: Lead; business_id: Uuid; task_count: number }>;
  /** "No aprobar": discards the lead with a reason. */
  rejectDocuments(id: Uuid, reason: string): Promise<LeadWithComputed>;
  /** Who saw the opportunity, who passed, who accepted, and the tripartite contract. SM team and SM Global. */
  getInvestors(id: Uuid): Promise<LeadInvestors | null>;
  /** Gives the opportunity back to every Bishop (reason required). Drops an unsigned tripartite contract. */
  releaseOpportunity(id: Uuid, reason: string): Promise<LeadWithComputed>;
  /**
   * "Enviar Operating Agreement": accepted with a Bishop, signed by owner, SM and Bishop, each from his own portal.
   * expansion_meeting_required while the expansion meeting was not held (rule require_expansion_meeting). Nobody signs
   * it before oa_waiting_days from the day it went out (waiting_period).
   */
  sendTripartite(id: Uuid): Promise<Contract>;
  /**
   * SM team of the office: a business that did not come through the assessment (referral, event). Enters Evaluado
   * with source "manual", no result and the current user as consultant.
   */
  createManual(input: ManualLeadInput): Promise<LeadWithComputed>;
  /** SM team: sends the assessment link to a manual lead (simulated); it shows "Assessment pendiente" until the result arrives. */
  sendAssessment(id: Uuid): Promise<LeadWithComputed>;
  /** Booked meetings of the current SM person's leads (consultant), soonest first. */
  listMeetings(): Promise<LeadMeetingItem[]>;
  /**
   * Demo only (in production these come by webhook). SM team. A new assessment with credible data, routed by zone,
   * in Evaluado with no email sent; and a booking on an evaluated lead, which moves it to Reunión by itself, creates
   * the owner account with the NDA (Strategic Mates pre-signed) and sends the summary email with the meeting. On a lead
   * in Reunión whose meeting was answered "No se presentó" or "Reagendar" it books again; on an accepted lead it books
   * the expansion meeting.
   */
  simulateAssessment(): Promise<LeadWithComputed>;
  simulateBooking(id: Uuid): Promise<LeadWithComputed>;
  /**
   * PUT /leads/{id}/validation: the definitive percentages (a draft may leave fields empty). SM team of the office,
   * accepted leads only (invalid_state). invalid_split when a percentage leaves its range (50-75, 15-40, SM Square 10)
   * or the three do not add up to 100; sm_square_signer_required when the holder cannot sign for SM Square.
   * invalid_state once closed.
   */
  saveValidation(id: Uuid, input: ValidationInput): Promise<LeadWithComputed>;
  /**
   * POST /leads/{id}/validation/close: admin of the office or SM Global admin (admin_only). Needs the three percentages,
   * the SM Square center and its holder (invalid_split, validation_incomplete). Tells the owner, the Bishop and SM
   * (validation_closed) and lets the Operating Agreement be created.
   */
  closeValidation(id: Uuid): Promise<LeadWithComputed>;
}

/** Which office gets a new lead. Everyone in SM reads it; only SM Global changes it. */
export interface RoutingRepository {
  getRules(): Promise<RoutingRules>;
  /** Adds or updates a zone (state, or city inside a state) → office. */
  setRule(input: ZoneRuleInput): Promise<ZoneRule>;
  removeRule(id: Uuid): Promise<void>;
  setDefaultOffice(officeId: Uuid): Promise<RoutingRules>;
}

/**
 * Ficha del negocio. The SM team of its office and SM Global read everything; the owner reads his own snapshot
 * without the score; partner firms, Bishops and franchisees get nothing.
 */
export interface BusinessFileRepository {
  /** Null when the business entered before the assessment existed. Owner: own business (businessId optional). */
  getSnapshot(businessId?: Uuid): Promise<AssessmentSnapshot | null>;
  /** Milestones newest first. SM only. */
  listMilestones(businessId: Uuid): Promise<BusinessMilestone[]>;
}

export interface TaskDetail {
  task: TaskWithComputed;
  versions: TaskVersion[];
  comments: TaskComment[];
  owner_requests: OwnerRequest[];
  meetings: Meeting[];
  events: TaskEvent[];
}

/**
 * The brand of B5-13 as the capture produces it: the proposal plus the Files picked for the manual and the logo.
 * The mock keeps only the names; the HTTP adapter uploads the Files (a logo given only as a data URL is uploaded too).
 */
export interface BrandProposalUpload extends BrandProposal {
  manual_file?: File | null | undefined;
  logo_file?: File | null | undefined;
}

export interface SubmitVersionInput {
  note: string;
  /** Names of every file of the deliverable, the brand's manual and logo included (what the mock stores). */
  file_names: string[];
  /**
   * The Files picked for the deliverable (without the brand's, which travel in `brand`). The HTTP adapter uploads
   * them in this order; names without their File are refused there with "invalid_file". The mock ignores them.
   */
  files?: File[] | undefined;
  /** B5-13 only: the brand read from the manual. Applied to the business when the owner approves this version. */
  brand?: BrandProposalUpload | null | undefined;
}

/** Optional filters of TasksRepository.list. The HTTP adapter sends them to GET /tasks; the mock applies the same. */
export interface TaskListOptions {
  /** Cancelled tasks are left out unless true. */
  include_cancelled?: boolean | undefined;
  business_id?: Uuid | undefined;
  area?: AreaCode[] | undefined;
  status?: TaskStatus[] | undefined;
  assignee_user_id?: Uuid | undefined;
  /** Due window, both ends included (YYYY-MM-DD). */
  due_from?: IsoDate | undefined;
  due_to?: IsoDate | undefined;
  /** Searches name and acceptance criteria, accents and case ignored (2 characters at least). */
  q?: string | undefined;
}

export interface TasksRepository {
  /** Visible tasks. Cancelled ones are left out unless include_cancelled. */
  list(opts?: TaskListOptions): Promise<TaskWithComputed[]>;
  /** SM only: reassign, change due date or step on one or many tasks. Logged and notified to the firm. */
  update(ids: Uuid[], patch: TaskPatch): Promise<TaskWithComputed[]>;
  /** SM only: cancel with a required reason. The task stays, as cancelled. */
  cancel(ids: Uuid[], reason: string): Promise<TaskWithComputed[]>;
  get(id: Uuid): Promise<TaskDetail | null>;
  updateStatus(id: Uuid, status: TaskStatus): Promise<TaskWithComputed>;
  start(id: Uuid): Promise<TaskWithComputed>;
  submitVersion(id: Uuid, input: SubmitVersionInput): Promise<TaskVersion>;
  /** file_id: a file of the task the comment is about. file: a new File to attach (uploaded by the HTTP adapter). */
  addComment(id: Uuid, input: { body: string; file_id: Uuid | null; file?: File | null | undefined }): Promise<TaskComment>;
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
  /**
   * Owner only: answer a request with a file and an optional note. The mock keeps file_name; the HTTP adapter uploads
   * `file` and refuses a name without its File ("invalid_file").
   */
  answerOwnerRequest(requestId: Uuid, input: { file_name: string; note: string; file?: File | null | undefined }): Promise<OwnerRequest>;
  /** Owner only: confirm a meeting proposed by a firm. */
  confirmMeeting(meetingId: Uuid): Promise<Meeting>;
  /**
   * SM team: decide a task marked "A validar". existing = approved as "Ya existía" without the firm; needed = normal
   * flow; pending = undo of either.
   */
  resolvePreValidation(id: Uuid, input: PreValidationInput): Promise<TaskWithComputed>;
}

export interface NotificationsRepository {
  /** Current user's notifications for kinds enabled "in app", newest first. Due ones are generated from dates. */
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  getPreferences(): Promise<NotificationPreference[]>;
  setPreference(kind: NotificationKind, channel: NotificationChannel, enabled: boolean): Promise<NotificationPreference[]>;
}

/** SM Global: the whole network. SM office team: only its own office. */
export interface NetworkRepository {
  /** SM Global only. */
  getSummary(): Promise<NetworkSummary>;
  /** SM Global: every office. SM team: only its own. */
  listOffices(): Promise<OfficeSummary[]>;
  getOffice(id: Uuid): Promise<OfficeDetail | null>;
  /** SM Global only: global, offices, businesses, franchises, and the firms of each office. */
  getStructure(): Promise<StructureTree>;
  /** SM Global only: for each of the six areas, where the network is stuck. Most overdue first. */
  listBottlenecks(): Promise<AreaBottleneck[]>;
  /** SM Global only: leads by stage, overall and per office. */
  getFunnel(): Promise<NetworkFunnel>;
  /** SM Global only: opens an office in "opening" with its manager and the opening checklist. */
  createOffice(input: CreateOfficeInput): Promise<OfficeSummary>;
  /** SM Global only: pauses an operating office. The reason is required. */
  pauseOffice(officeId: Uuid, reason: string): Promise<OfficeSummary>;
  /** SM Global only: an office in opening goes live only with its checklist complete; a paused one resumes. */
  activateOffice(officeId: Uuid): Promise<OfficeSummary>;
  /**
   * "Firma de la oficina" (PNG): the signature the NDA and the MOU go out pre-signed with. SM Global, or the admin of
   * that office. The HTTP adapter uploads the File first, waits until the API verified it (GET /files/{id} ready) and
   * then PATCH /offices/{id}/signature { file_id }; the answer carries signature_file_name. The mock keeps the name.
   * file_rejected when the verification refuses the file; file_verification_timeout when it takes too long.
   */
  setOfficeSignature(officeId: Uuid, file: DocumentUpload, options?: UploadProgress): Promise<Organization>;
}

/** What an upload is doing: the bytes go out, then the API verifies them (magic bytes, scanner). */
export type UploadPhase = "uploading" | "verifying";

/** Optional progress of a write that uploads a file first (the screen shows "Verificando el archivo"). */
export interface UploadProgress {
  onProgress?: ((phase: UploadPhase) => void) | undefined;
}

/** Platform rules. Everyone reads them; only SM Global changes them, and every change is logged. */
export interface RulesRepository {
  get(): Promise<PlatformRules>;
  update(patch: Partial<PlatformRules>, note?: string | null): Promise<PlatformRules>;
  /** Newest first. SM Global only. */
  listHistory(): Promise<RulesChange[]>;
}

/**
 * Entry contracts as rules (GET /entry-contract-rules). Every SM person reads them; only SM Global (Corporate) writes.
 * A rule says which contract a business entering gets, when (trigger, delay_days), how long it has to be signed
 * (deadline_days), who signs and for which SM company, and what waits for it. Codes: rule_in_use (another rule waits
 * for this one), precondition_failed (stale version), name_required, invalid_trigger, signers_required,
 * sm_entity_required, invalid_days, code_taken.
 */
export interface ContractRulesRepository {
  /** Every rule, archived ones included (active false), in position order. */
  list(): Promise<EntryContractRule[]>;
  add(input: EntryContractRuleInput): Promise<EntryContractRule>;
  /** PATCH /entry-contract-rules/{code} with If-Match: the version the editor started from. */
  update(code: string, patch: Partial<EntryContractRuleInput>, version: number, note?: string | null): Promise<EntryContractRule>;
  /** Contracts already created stay; new businesses no longer get it. */
  archive(code: string, reason?: string | null): Promise<EntryContractRule>;
  restore(code: string): Promise<EntryContractRule>;
  /** Newest first. SM Global only. */
  listHistory(): Promise<EntryContractRuleChange[]>;
}

/** Official Método 180 catalog. Everyone reads active entries; only SM Global edits. Edits apply to new programs only. */
export interface CatalogRepository {
  list(opts?: { include_archived?: boolean }): Promise<CatalogAdminItem[]>;
  add(input: CatalogItemInput): Promise<CatalogAdminItem>;
  update(code: string, patch: Partial<CatalogItemInput>, note?: string | null): Promise<CatalogAdminItem>;
  archive(code: string, reason: string): Promise<CatalogAdminItem>;
  restore(code: string): Promise<CatalogAdminItem>;
  /** Newest first, one entry or all. SM Global only. */
  listHistory(code?: string): Promise<CatalogChange[]>;
}

export interface FranchisesRepository {
  /** Franchisor owner: its own units. SM: those of its office. SM Global: all. Franchisee: only its unit. */
  list(franchisorBusinessId?: Uuid): Promise<FranchiseSummary[]>;
  get(id: Uuid): Promise<FranchiseDetail | null>;
  /** Franchisor owner: its own numbers (businessId optional). SM and SM Global: any franchisor in scope. */
  getFranchisorSummary(businessId?: Uuid): Promise<FranchisorSummary>;
  /** Reports of the units in scope, newest month first; a franchisee only gets its own. */
  listReports(franchiseId?: Uuid): Promise<FranchiseReport[]>;
  /** Franchisee only, own unit, a month that is due. Royalty and marketing fund are computed from gross sales. */
  submitReport(franchiseId: Uuid, input: SubmitReportInput): Promise<FranchiseReport>;
  /** Tickets from the franchises in scope, newest first. */
  listTickets(): Promise<SupportTicket[]>;
}

export interface ManualRepository {
  /** Owner: own manual. Franchisee: its franchisor manual (read). SM: office businesses. SM Global: any. */
  get(businessId?: Uuid): Promise<ManualOverview>;
  /** Franchisor owner only: publishes the next version; every franchise follows it and gets a task to read it. */
  publish(businessId: Uuid, input: PublishManualInput): Promise<ManualVersion>;
  /** Owner only, own business: approves a section once every catalog task that feeds it is approved. Logged in the activity. */
  approveSection(sectionId: Uuid): Promise<ManualSection>;
}

/**
 * What the owner uploads: the File picked in the input. The mock only keeps its name, so `{ name }` is enough there;
 * the HTTP adapter needs the real File (it sends the bytes) and rejects anything else with "invalid_file".
 */
export type DocumentUpload = File | { name: string };

/**
 * Where the current signer signs (meta.signing of POST /contracts/{id}/open). With the real DocuSeal driver the
 * portal embeds the signer's own form at embed_src; "simulated" (and the mock, which sends none) keeps the portal's
 * own signature screen.
 */
export interface SigningSession {
  provider: "simulated" | "docuseal";
  embed_src: string | null;
  slug: string | null;
}

/** The contract as opening it answers: plus the signing session when the API sends one. */
export interface OpenedContract extends Contract {
  signing?: SigningSession | null | undefined;
}

export interface DocumentsRepository {
  listDocuments(businessId?: Uuid): Promise<BusinessDocument[]>;
  listContracts(businessId?: Uuid): Promise<Contract[]>;
  /** Owner only: answers a requested document with a file. */
  uploadDocument(documentId: Uuid, file: DocumentUpload): Promise<BusinessDocument>;
  /** Entry checklist of a business in onboarding (owner: own). Null when it has none. */
  getIntake(businessId?: Uuid): Promise<IntakeSummary | null>;
  /**
   * DocuSeal: the current user's signer opens, signs or declines (reason required). Owner signs as owner; any SM
   * person of the office signs as Strategic Mates. Opening again only answers the contract (and the embed) again.
   */
  openContract(contractId: Uuid): Promise<OpenedContract>;
  /**
   * The signature the person drew, typed or uploaded (DocuSeal collects it in production). A MOU needs the owner's
   * four points first (acknowledgment_required); the Operating Agreement waits oa_waiting_days from the day it went
   * out (waiting_period, the date in the error's detail).
   */
  signContract(contractId: Uuid, signature?: ContractSignature): Promise<Contract>;
  declineContract(contractId: Uuid, reason: string): Promise<Contract>;
  /** Owner, MOU: the four points confirmed with "Entendí" (POST /contracts/{id}/acknowledge). All four, or invalid_points. */
  acknowledge(contractId: Uuid, points: MouAcknowledgmentPoint[]): Promise<Contract>;
}

export interface FinancialsRepository {
  /** Owner: own business. SM: office businesses. SM Global: any. Null if the business has no series yet. */
  get(businessId?: Uuid): Promise<FinancialSeries | null>;
}

export interface BusinessProfileRepository {
  get(businessId?: Uuid): Promise<BusinessProfile | null>;
  /** Owner only, own business. Verified fields (VERIFIED_PROFILE_FIELDS) reject with "locked_field" once past onboarding. */
  update(patch: BusinessProfilePatch): Promise<BusinessProfile>;
  /** Owner only: asks SM to change a verified field. */
  requestChange(input: ProfileChangeInput): Promise<ProfileChangeRequest>;
  /** Owner (own business) or SM (office): requests, newest first. */
  listChangeRequests(businessId?: Uuid): Promise<ProfileChangeRequest[]>;
  /** SM only: "applied" updates the profile, "rejected" keeps it; the note goes to the owner. */
  resolveChangeRequest(id: Uuid, status: "applied" | "rejected", note: string | null): Promise<ProfileChangeRequest>;
  listTeam(businessId?: Uuid): Promise<TeamMember[]>;
  /** Owner only, own business: adds a person as invited, with an account (business_owner, not admin) behind it. */
  inviteMember(input: InviteMemberInput): Promise<TeamMember>;
  /** Owner only: hands the business over to an active member with an account. The previous owner stays in the team. */
  makeOwner(memberId: Uuid): Promise<TeamMember>;
}

/**
 * What SM loads by hand: the palette, plus the Files when they were just picked. The HTTP adapter uploads the logo
 * (logo_file, or logo_url when it is a data URL) and the manual PDF. A logo or manual left unchanged travels as the
 * stored file id the brand already had (logo_file_id, manual_file_id), or not at all: the API keeps the current
 * file. The mock keeps the palette only.
 */
export interface SetBrandInput extends BrandPalette {
  logo_file?: File | null | undefined;
  manual_file?: File | null | undefined;
  logo_file_id?: Uuid | null | undefined;
  manual_file_id?: Uuid | null | undefined;
}

/**
 * Brand of a business (white label). Read by the owner and the team (own business), the franchisor and its
 * franchises (inherited), SM team (office) and SM Global. Firms and Bishops get "forbidden": they keep the SM brand.
 */
export interface BrandRepository {
  /** Null = Strategic Mates brand. Owner: own business. Franchisee: its franchisor's. SM: any business in scope. */
  get(businessId?: Uuid): Promise<BusinessBrand | null>;
  /** The brand the current user's portal shows: null for SM, firms, Bishops and businesses without a brand. */
  getMine(): Promise<BusinessBrand | null>;
  /** SM team of the office (or SM Global): loads the brand by hand when the business already had one. */
  set(businessId: Uuid, palette: SetBrandInput): Promise<BusinessBrand>;
  /** "Volver a la marca de Strategic Mates": the owner (own business) or SM. Franchises cannot. */
  reset(businessId: Uuid): Promise<void>;
  /** Newest first. Same scope as get. */
  listEvents(businessId: Uuid): Promise<BrandEvent[]>;
}

/** Business Bishop: sees only his own portfolio, opportunities and agreements. */
export interface BishopRepository {
  getPortfolio(): Promise<BishopPortfolio>;
  listOpportunities(): Promise<BishopOpportunity[]>;
  getOpportunity(id: Uuid): Promise<OpportunityDetail | null>;
  /** Only "available" and with the framework agreement signed; the first Bishop takes it. */
  acceptOpportunity(id: Uuid): Promise<BishopOpportunity>;
  /** "No me interesa". */
  pass(id: Uuid): Promise<BishopOpportunity>;
  /** Undo a pass. */
  clearDecision(id: Uuid): Promise<BishopOpportunity>;
  /** Framework agreement first, then tripartite contracts, then the rest. */
  listAgreements(): Promise<BishopAgreement[]>;
}

/**
 * Money the Bishop pays SM for one program (paid outside the app; the app only records it). Keyed by business.
 * SM team of the office and SM Global read; only the SM team writes. The Bishop reads his own and reports his
 * receipt. Owners, firms and franchisees never get an answer (forbidden).
 */
export interface FundsRepository {
  /** Null before the tripartite contract is signed by the three. */
  get(businessId: Uuid): Promise<BishopFunds | null>;
  /** Bishop: the funds of every business he funds, newest first. */
  listMine(): Promise<BishopFunds[]>;
  /** SM team: a payment received, confirmed at once. Cannot go over the program amount. */
  recordPayment(businessId: Uuid, input: FundPaymentInput): Promise<BishopFunds>;
  /** Bishop: uploads his receipt; it counts once SM confirms it. */
  reportPayment(businessId: Uuid, input: FundPaymentInput): Promise<BishopFunds>;
  /** SM team: confirms a payment the Bishop reported. */
  confirmPayment(businessId: Uuid, paymentId: Uuid): Promise<BishopFunds>;
  /** SM team: removes a payment recorded by mistake (undo), only before the program started. */
  removePayment(businessId: Uuid, paymentId: Uuid): Promise<BishopFunds>;
}

/**
 * How SM distributes the funds of one business: one line per partner firm plus Strategic Mates (orchestration).
 * SM team writes, SM Global reads, the Bishop of that business reads. Owners and firms: forbidden.
 */
export interface DistributionRepository {
  /** Null while the business has no funds record. */
  get(businessId: Uuid): Promise<Distribution | null>;
  /** Creates or replaces the plan of one line. Not allowed once a payment of that line is paid. */
  saveLine(businessId: Uuid, input: DistributionLineInput): Promise<Distribution>;
  /** Clears a line with no paid payments. */
  clearLine(businessId: Uuid, organizationId: Uuid | null): Promise<Distribution>;
  markPaid(businessId: Uuid, paymentId: Uuid, input: MarkPaidInput): Promise<Distribution>;
  /** Undo of markPaid. */
  markPending(businessId: Uuid, paymentId: Uuid): Promise<Distribution>;
}

/** Franchisee: sees only its own unit. */
export interface FranchiseeRepository {
  getHome(): Promise<FranchiseeHome>;
  /** Standards (operating) or opening checklist (opening). */
  listChecklist(): Promise<ChecklistItem[]>;
  listTickets(): Promise<SupportTicket[]>;
  createTicket(input: { subject: string; body: string }): Promise<SupportTicket>;
  listTasks(): Promise<FranchiseTask[]>;
  setTaskDone(taskId: Uuid, done: boolean): Promise<FranchiseTask>;
  listTeam(): Promise<TeamMember[]>;
}

export interface ApiClient {
  network: NetworkRepository;
  rules: RulesRepository;
  contractRules: ContractRulesRepository;
  catalog: CatalogRepository;
  franchises: FranchisesRepository;
  manual: ManualRepository;
  documents: DocumentsRepository;
  financials: FinancialsRepository;
  businessProfile: BusinessProfileRepository;
  bishop: BishopRepository;
  franchisee: FranchiseeRepository;
  notifications: NotificationsRepository;
  session: SessionRepository;
  organizations: OrganizationsRepository;
  businesses: BusinessesRepository;
  users: UsersRepository;
  calendar: CalendarRepository;
  tasks: TasksRepository;
  leads: LeadsRepository;
  funds: FundsRepository;
  distribution: DistributionRepository;
  brand: BrandRepository;
  routing: RoutingRepository;
  businessFile: BusinessFileRepository;
}
