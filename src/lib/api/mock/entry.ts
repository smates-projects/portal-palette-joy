// Automatic entry of leads, zone routing, "Ya lo tenía" and the ficha del negocio, in the mock. It simulates the
// backend authorization: the SM team works on its own office, SM Global reads everything and edits the zones, the
// owner reads his own snapshot without the score, firms get nothing.
import { TODAY, nowIso } from "@/config/app";
import { ASSESSMENT_BLOCKS } from "../types";
import type {
  AssessmentSnapshot,
  BlockStatus,
  Business,
  BusinessEvent,
  Contract,
  Lead,
  LeadBand,
  LeadEvent,
  LeadIndustry,
  LeadMeetingItem,
  LeadWithComputed,
  MarginRange,
  NotificationKind,
  Organization,
  RevenueRange,
  RoutingRules,
  Task,
  TaskComment,
  TaskEvent,
  TaskWithComputed,
  TeamRange,
  User,
  Uuid,
  YearsRange,
  ZoneRule,
} from "../types";
import type { PlatformRules } from "../network-types";
import type { BusinessFileRepository, LeadsRepository, RoutingRepository, TasksRepository } from "../repositories";
import { meetingHeld, resolveOffice, validateZone } from "@/lib/leads/entry";
import { DEFAULT_ASSESSMENT_AREA_MAP, checkPreValidation, markPreValidation, strongAreas } from "@/lib/leads/prevalidation";
import { buildMilestones, buildSnapshot, ownerSnapshot } from "@/lib/business/file";

export interface EntryDb {
  leads: Lead[];
  leadEvents: LeadEvent[];
  users: User[];
  orgs: Organization[];
  businesses: Business[];
  businessEvents: BusinessEvent[];
  tasks: Task[];
  events: TaskEvent[];
  comments: TaskComment[];
  contracts: Contract[];
  rules: PlatformRules;
}

interface Deps {
  db: EntryDb;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(v: T) => Promise<T>;
  findLead: (id: Uuid) => Lead;
  /** Leads of the current SM team user's office (throws for anyone else). */
  visibleLeads: () => Lead[];
  withBooking: (l: Lead) => LeadWithComputed;
  findTask: (id: Uuid) => Task;
  computed: (t: Task) => TaskWithComputed;
  /** Bell notification to the lead's consultant (also when he caused it: the demo runs as him). */
  notifyConsultant: (l: Lead, kind: NotificationKind, extra: { place?: string; meeting_at?: string; actor_name?: string }) => void;
}

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Credible sample data for "Simular assessment" (demo only).
const SAMPLE_BUSINESSES: { name: string; industry: LeadIndustry; activity: string }[] = [
  { name: "Delicias Caribeñas", industry: "restaurant", activity: "Restaurante de comida dominicana" },
  { name: "Brillo Total Cleaning", industry: "cleaning", activity: "Limpieza de casas y oficinas" },
  { name: "Construcciones Herrera", industry: "construction", activity: "Construcción y ampliaciones" },
  { name: "Estética Valeria", industry: "salon", activity: "Salón de belleza y uñas" },
  { name: "Cocinas Modernas JR", industry: "remodeling", activity: "Remodelación de cocinas" },
  { name: "Taquería El Güero", industry: "restaurant", activity: "Taquería y comida para llevar" },
  { name: "Pisos y Acabados Luna", industry: "remodeling", activity: "Instalación de pisos y baños" },
  { name: "Barbería Los Compadres", industry: "salon", activity: "Barbería" },
];
const SAMPLE_OWNERS = ["Alejandra Ruiz", "Jorge Castro", "Mónica Paredes", "Ricardo Salinas", "Diana Morales", "Fernando Ibarra", "Carolina Vega", "Héctor Lozano"];
const SAMPLE_PLACES: { city: string; state: string }[] = [
  { city: "Miami", state: "FL" }, { city: "Hialeah", state: "FL" }, { city: "Orlando", state: "FL" }, { city: "Tampa", state: "FL" },
  { city: "Houston", state: "TX" }, { city: "San Antonio", state: "TX" }, { city: "Atlanta", state: "GA" }, { city: "Charlotte", state: "NC" },
  { city: "Newark", state: "NJ" }, { city: "Phoenix", state: "AZ" },
];
const SAMPLE_STRENGTHS = ["Clientes que vuelven y lo recomiendan", "Equipo estable", "Proceso de trabajo propio", "Buen margen por trabajo", "Marca conocida en su zona", "Recetas o métodos medidos y escritos"];
const SAMPLE_PRIORITIES = ["Números del negocio", "Procesos escritos", "Contratos y licencias", "Sistema de citas", "Marca y presencia local", "Costos por servicio"];
const BLOCK_STATUSES: BlockStatus[] = ["strong", "medium", "medium", "weak", "unknown"];

/** Band of a score for a business that meets the entry rule. */
const bandOf = (score: number): LeadBand => (score >= 78 ? "high" : score >= 60 ? "mid" : "low");
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);

export function createEntry(d: Deps) {
  const { db, me, newId, delay } = d;

  const routing: RoutingRules = { zones: [], default_office_id: "" };
  const snapshots: AssessmentSnapshot[] = [];
  /** Undo of "Ya lo tenía": the event and comment it added, by task. */
  const existingTrail = new Map<Uuid, { eventId: Uuid; commentId: Uuid }>();

  const smTeam = () => {
    if (me().role !== "sm_team") throw new Error("sm_only");
  };
  const officeOf = (id: Uuid) => db.orgs.find((o) => o.id === id);
  /** Consultant who gets the lead inside the office: the office manager (default consultant), else anyone of the team. */
  const defaultConsultant = (officeId: Uuid) => {
    const team = db.users.filter((u) => u.role === "sm_team" && u.organization_id === officeId);
    const manager = officeOf(officeId)?.manager_user_id;
    return team.find((u) => u.id === manager) ?? team[0] ?? null;
  };
  const autoEvent = (e: Omit<LeadEvent, "id" | "actor_user_id">) => {
    const full: LeadEvent = { id: newId(), actor_user_id: null, ...e };
    db.leadEvents.push(full);
    return full;
  };
  const businessInScope = (businessId: Uuid | undefined, opts: { owner: boolean }) => {
    const u = me();
    const id = u.role === "business_owner" ? u.business_id : businessId;
    const b = id ? db.businesses.find((x) => x.id === id) : undefined;
    if (!b) throw new Error("not_found");
    const sm = u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === b.office_id);
    const owner = opts.owner && u.role === "business_owner" && u.business_id === b.id;
    if (!sm && !owner) throw new Error("forbidden");
    return { b, asOwner: !sm };
  };

  /** Snapshot of the assessment when the lead enters the program. */
  const takeSnapshot = (l: Lead, businessId: Uuid, at: string) => {
    if (snapshots.some((s) => s.business_id === businessId)) return;
    snapshots.push(buildSnapshot(l, businessId, at));
  };
  /** "A validar" on the tasks of the areas the assessment rated strong (map from the rules SM Global edits). */
  const markBusiness = (l: Lead, businessId: Uuid) => {
    const areas = strongAreas(l.result.blocks, db.rules.assessment_area_map ?? DEFAULT_ASSESSMENT_AREA_MAP);
    for (const t of db.tasks.filter((x) => x.business_id === businessId)) {
      const [marked] = markPreValidation([t], areas);
      if (marked && marked.pre_validation !== t.pre_validation) t.pre_validation = marked.pre_validation ?? null;
    }
  };

  const seed = (defaultOfficeId: Uuid) => {
    // Today there is one office: every state goes to SM Miami. The FL zone shows how a zone looks.
    routing.default_office_id = defaultOfficeId;
    routing.zones.push({ id: newId(), state: "FL", city: null, office_id: defaultOfficeId });
    for (const l of db.leads) {
      const b = l.business_id ? db.businesses.find((x) => x.id === l.business_id) : undefined;
      if (l.stage !== "in_program" || !b || b.status === "onboarding") continue;
      takeSnapshot(l, b.id, l.stage_entered_at);
      // Programs still in the Diagnóstico (days 1-15) have their marks to review.
      if (b.program_day <= 15) markBusiness(l, b.id);
    }
  };

  // ---------- Leads: meeting note, calendar, simulation ----------
  const leads: Pick<LeadsRepository, "addMeetingNote" | "listMeetings" | "simulateAssessment" | "simulateBooking"> = {
    addMeetingNote: async (id, body) => {
      if (!body.trim()) throw new Error("note_required");
      const l = d.findLead(id);
      if (l.stage !== "meeting" || !l.meeting || !meetingHeld(l.meeting)) throw new Error("invalid_transition");
      l.meeting.notes_at = nowIso();
      l.last_contact_at = nowIso();
      const e: LeadEvent = { id: newId(), lead_id: id, kind: "meeting_note", actor_user_id: me().id, created_at: nowIso(), from: null, to: null, body: body.trim() };
      db.leadEvents.push(e);
      return delay(e);
    },
    listMeetings: async () => {
      const u = me();
      if (u.role !== "sm_team") return delay([]);
      const items: LeadMeetingItem[] = d.visibleLeads()
        .filter((l) => l.stage === "meeting" && l.meeting && l.consultant_user_id === u.id)
        .map((l) => ({ lead_id: l.id, business_name: l.business.name, owner_name: l.contact.name, city: l.contact.city, state: l.contact.state, meeting: l.meeting! }))
        .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
      return delay(items);
    },
    simulateAssessment: async () => {
      smTeam();
      const biz = pick(SAMPLE_BUSINESSES);
      const place = pick(SAMPLE_PLACES);
      const owner = pick(SAMPLE_OWNERS);
      const officeId = resolveOffice(routing, place);
      const consultant = defaultConsultant(officeId) ?? me();
      // Most businesses meet the entry rule; one in six is "Ya estás en camino" (under the years required).
      const track = Math.random() < 1 / 6;
      const score = track ? 40 + Math.floor(Math.random() * 20) : 52 + Math.floor(Math.random() * 41);
      const years: YearsRange = track ? "lt_2" : pick(["2_5", "5_10", "gt_10"] as const);
      const now = nowIso();
      const slug = biz.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
      const l: Lead = {
        id: newId(),
        office_id: officeId,
        source: "landing",
        summary_sent_at: now,
        meeting: null,
        stage: "evaluated",
        discarded_from: null,
        discard_reason: null,
        stage_entered_at: now,
        submitted_at: now,
        last_contact_at: null,
        consultant_user_id: consultant.id,
        business_id: null,
        contact: { name: owner, email: `${owner.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@${slug}.com`, phone: `+1 305 555 0${100 + Math.floor(Math.random() * 899)}`, city: place.city, state: place.state, hispanic_owner: true },
        business: {
          name: biz.name, industry: biz.industry, activity: biz.activity,
          revenue_range: pick(["250k_500k", "500k_1m", "1m_3m"] as RevenueRange[]),
          margin_range: pick(["10_20", "20_30", "gt_30"] as MarginRange[]),
          team_range: pick(["1_5", "6_15", "16_50"] as TeamRange[]),
          years_range: years, has_active_clients: true,
        },
        result: {
          band: track ? "track" : bandOf(score), score, eligible_program: !track, eligibility_gaps: track ? ["years"] : [],
          blocks: ASSESSMENT_BLOCKS.map((key) => ({ key, status: pick(BLOCK_STATUSES) })),
          strengths: shuffle(SAMPLE_STRENGTHS).slice(0, 2 + Math.floor(Math.random() * 2)),
          priorities: shuffle(SAMPLE_PRIORITIES).slice(0, 3),
        },
        know_how_example: null,
        bishop_user_id: null,
        bishop_accepted_at: null,
      };
      db.leads.push(l);
      autoEvent({ lead_id: l.id, kind: "submitted", created_at: now, from: null, to: "evaluated", body: null });
      autoEvent({ lead_id: l.id, kind: "summary_sent", created_at: now, from: null, to: null, body: null });
      d.notifyConsultant(l, "lead_assessment", { place: `${place.city}, ${place.state}`, actor_name: owner });
      return delay(d.withBooking(l));
    },
    simulateBooking: async (id) => {
      const l = d.findLead(id);
      if (l.stage !== "evaluated") throw new Error("invalid_transition");
      // As it comes from the consultant's calendar: within the next 7 days, 30 minutes, a Meet link.
      const day = addDays(TODAY, 1 + Math.floor(Math.random() * 7));
      const hour = 13 + Math.floor(Math.random() * 7);
      const now = nowIso();
      const code = () => Math.random().toString(36).slice(2, 5).padEnd(3, "x");
      l.meeting = {
        starts_at: `${day}T${pad(hour)}:${Math.random() < 0.5 ? "00" : "30"}:00Z`, duration_minutes: 30,
        meet_url: `https://meet.google.com/${code()}-${code()}${code().slice(0, 1)}-${code()}`,
        consultant_user_id: l.consultant_user_id, booked_at: now, notes_at: null,
      };
      // Automatic: SM did not contact the owner, so last_contact_at stays as it was.
      l.stage = "meeting";
      l.stage_entered_at = now;
      autoEvent({ lead_id: l.id, kind: "meeting_booked", created_at: now, from: "evaluated", to: "meeting", body: null });
      d.notifyConsultant(l, "meeting_booked", { meeting_at: l.meeting.starts_at, actor_name: l.contact.name });
      return delay(d.withBooking(l));
    },
  };

  // ---------- Zone routing ----------
  const routingRepo: RoutingRepository = {
    getRules: async () => {
      if (!["sm_team", "sm_global"].includes(me().role)) throw new Error("forbidden");
      return delay(routing);
    },
    setRule: async (input) => {
      if (me().role !== "sm_global") throw new Error("global_only");
      const city = input.city?.trim() ? input.city.trim() : null;
      const err = validateZone(routing, { id: input.id, state: input.state, city });
      if (err) throw new Error(err === "state" ? "invalid_state" : "duplicate_zone");
      const office = officeOf(input.office_id);
      if (!office || office.kind !== "sm") throw new Error("invalid_office");
      const rule: ZoneRule = { id: input.id ?? newId(), state: input.state.trim().toUpperCase(), city, office_id: input.office_id };
      const i = routing.zones.findIndex((z) => z.id === rule.id);
      if (i >= 0) routing.zones[i] = rule;
      else routing.zones.push(rule);
      return delay(rule);
    },
    removeRule: async (id) => {
      if (me().role !== "sm_global") throw new Error("global_only");
      routing.zones = routing.zones.filter((z) => z.id !== id);
      return delay(undefined);
    },
    setDefaultOffice: async (officeId) => {
      if (me().role !== "sm_global") throw new Error("global_only");
      if (officeOf(officeId)?.kind !== "sm") throw new Error("invalid_office");
      routing.default_office_id = officeId;
      return delay(routing);
    },
  };

  // ---------- Ficha del negocio ----------
  const at = (date: string) => (date.length === 10 ? `${date}T12:00:00Z` : date);
  const businessFile: BusinessFileRepository = {
    getSnapshot: async (businessId) => {
      const { b, asOwner } = businessInScope(businessId, { owner: true });
      const s = snapshots.find((x) => x.business_id === b.id) ?? null;
      return delay(s && asOwner ? ownerSnapshot(s) : s);
    },
    listMilestones: async (businessId) => {
      const { b } = businessInScope(businessId, { owner: false });
      const name = (id: Uuid | null) => (id ? db.users.find((u) => u.id === id)?.full_name ?? null : null);
      const lead = db.leads.find((l) => l.business_id === b.id);
      const toMeeting = lead && db.leadEvents.find((e) => e.lead_id === lead.id && e.to === "meeting");
      const tripartite = db.contracts.find((c) => c.business_id === b.id && c.kind === "tripartite" && c.state === "signed");
      const tasks = db.tasks.filter((t) => t.business_id === b.id);
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const required = new Set(db.rules.required_task_codes);
      return delay(buildMilestones({
        snapshot: snapshots.find((x) => x.business_id === b.id) ?? null,
        meeting_at: lead?.meeting?.starts_at ?? toMeeting?.created_at ?? null,
        contract_signed_at: tripartite?.signed_at ? at(tripartite.signed_at) : null,
        program_started_at: b.status === "onboarding" ? null : at(b.program_start_date),
        consultant_changes: db.businessEvents.filter((e) => e.business_id === b.id).map((e) => ({ id: e.id, at: e.created_at, from: name(e.from_user_id), to: name(e.to_user_id) ?? "" })),
        firm_changes: db.events.filter((e) => e.kind === "reassigned" && taskById.has(e.task_id) && e.change?.field === "assignee").map((e) => {
          const t = taskById.get(e.task_id)!;
          return { id: e.id, at: e.created_at, from: e.change?.from ?? null, to: e.change?.to ?? null, task_code: t.code, task_name: t.name };
        }),
        required_approved: tasks.filter((t) => required.has(t.code) && t.status === "accepted" && t.accepted_at).map((t) => ({ id: `req-${t.id}`, at: t.accepted_at!, task_code: t.code, task_name: t.name })),
      }));
    },
  };

  // ---------- "Ya lo tenía" ----------
  const resolvePreValidation: TasksRepository["resolvePreValidation"] = async (id, input) => {
    smTeam();
    const t = d.findTask(id);
    const err = checkPreValidation(t, input);
    if (err) throw new Error(err);
    if (input.decision === "existing") {
      // Approved without the firm: the evidence the owner showed stays as a comment on the task.
      const now = nowIso();
      t.status = "accepted";
      t.accepted_at = now;
      t.approval_source = "existing";
      t.pre_validation = "existing";
      t.updated_at = now;
      const eventId = newId();
      const commentId = newId();
      db.events.push({ id: eventId, task_id: t.id, kind: "approved", actor_user_id: me().id, version: null, comment_id: commentId, created_at: now });
      const body = [input.note.trim(), `(${input.evidence_file_name.trim()})`].filter(Boolean).join(" ");
      db.comments.push({ id: commentId, task_id: t.id, author_user_id: me().id, body, created_at: now, kind: "approval", file_id: null });
      existingTrail.set(t.id, { eventId, commentId });
    } else if (input.decision === "needed") {
      t.pre_validation = "needed";
    } else {
      // Undo: back to "A validar" and, for "Ya existía", the approval and its evidence go away.
      const trail = existingTrail.get(t.id);
      if (t.pre_validation === "existing") {
        t.status = "pending";
        t.accepted_at = null;
        t.approval_source = null;
        if (trail) {
          const ei = db.events.findIndex((e) => e.id === trail.eventId);
          if (ei >= 0) db.events.splice(ei, 1);
          const ci = db.comments.findIndex((c) => c.id === trail.commentId);
          if (ci >= 0) db.comments.splice(ci, 1);
          existingTrail.delete(t.id);
        }
      }
      t.pre_validation = "pending";
      t.updated_at = nowIso();
    }
    return delay(d.computed(t));
  };

  return { seed, takeSnapshot, markBusiness, leads, routing: routingRepo, businessFile, resolvePreValidation };
}
