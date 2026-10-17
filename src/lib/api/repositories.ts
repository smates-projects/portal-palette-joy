import type {
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
  Business,
  BusinessEvent,
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
  AssessmentSnapshot,
  BusinessMilestone,
  LeadMeetingItem,
  PreValidationInput,
  RoutingRules,
  ZoneRule,
  ZoneRuleInput,
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
  /** Business activity, newest first. SM only. */
  listEvents(businessId: Uuid): Promise<BusinessEvent[]>;
  /** SM only: change the assigned consultant (an SM person of the same office); logged in the activity. */
  setConsultant(businessId: Uuid, userId: Uuid): Promise<Business>;
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
  addNote(id: Uuid, body: string): Promise<LeadEvent>;
  /** meeting → documents: owner account (invite), business in onboarding, NDA + MOU sent, documents requested. */
  sendNdaMou(id: Uuid): Promise<LeadWithComputed>;
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
  /** accepted with a Bishop: contract signed by owner, SM and Bishop, each from his own portal. */
  sendTripartite(id: Uuid): Promise<Contract>;
  /** After the meeting: the consultant's note. Next step: Enviar NDA y MOU (accept) or Descartar. */
  addMeetingNote(id: Uuid, body: string): Promise<LeadEvent>;
  /** Booked meetings of the current SM person's leads (consultant), soonest first. */
  listMeetings(): Promise<LeadMeetingItem[]>;
  /**
   * Demo only (in production these come by webhook). SM team. A new assessment with credible data, routed by zone,
   * in Evaluado with the summary sent; and a booking on an evaluated lead, which moves it to Reunión by itself.
   */
  simulateAssessment(): Promise<LeadWithComputed>;
  simulateBooking(id: Uuid): Promise<LeadWithComputed>;
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
}

/** Platform rules. Everyone reads them; only SM Global changes them, and every change is logged. */
export interface RulesRepository {
  get(): Promise<PlatformRules>;
  update(patch: Partial<PlatformRules>, note?: string | null): Promise<PlatformRules>;
  /** Newest first. SM Global only. */
  listHistory(): Promise<RulesChange[]>;
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

export interface DocumentsRepository {
  listDocuments(businessId?: Uuid): Promise<BusinessDocument[]>;
  listContracts(businessId?: Uuid): Promise<Contract[]>;
  /** Owner only: answers a requested document with a file (simulated). */
  uploadDocument(documentId: Uuid, fileName: string): Promise<BusinessDocument>;
  /** Entry checklist of a business in onboarding (owner: own). Null when it has none. */
  getIntake(businessId?: Uuid): Promise<IntakeSummary | null>;
  /**
   * DocuSeal (simulated today): the current user's signer opens, signs or declines (reason required).
   * Owner signs as owner; any SM person of the office signs as Strategic Mates.
   */
  openContract(contractId: Uuid): Promise<Contract>;
  signContract(contractId: Uuid): Promise<Contract>;
  declineContract(contractId: Uuid, reason: string): Promise<Contract>;
}

export interface FinancialsRepository {
  /** Owner: own business. SM: office businesses. SM Global: any. Null if the business has no series yet. */
  get(businessId?: Uuid): Promise<FinancialSeries | null>;
}

export interface BusinessProfileRepository {
  get(businessId?: Uuid): Promise<BusinessProfile | null>;
  /** Owner only, own business. */
  update(patch: BusinessProfilePatch): Promise<BusinessProfile>;
  listTeam(businessId?: Uuid): Promise<TeamMember[]>;
  /** Owner only, own business: adds a person as invited. */
  inviteMember(input: InviteMemberInput): Promise<TeamMember>;
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
  tasks: TasksRepository;
  leads: LeadsRepository;
  funds: FundsRepository;
  distribution: DistributionRepository;
  routing: RoutingRepository;
  businessFile: BusinessFileRepository;
}
