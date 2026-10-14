import type { ExternalCalendarEvent,
  Business,
  Meeting,
  Organization,
  OwnerRequest,
  Task,
  TaskComment,
  TaskEvent,
  TaskStatus,
  TaskStep,
  TaskVersion,
  User,
} from "../types";

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Organizations
export const ORG_SM = uuid("0a000000", 1);
export const ORG_PEREZ = uuid("0a000000", 2);
export const ORG_XYZ = uuid("0a000000", 3);

export const organizations: Organization[] = [
  { id: ORG_SM, name: "Strategic Mates", kind: "sm", area: null, specialty: null, city: "Orlando, FL", email: "hola@strategicmates.com", phone: null },
  { id: ORG_PEREZ, name: "Estudio Pérez Legal", kind: "partner_firm", area: "B6", specialty: "Derecho corporativo, licencias y contratos para franquicias en Florida", city: "Miami, FL", email: "contacto@estudioperez.legal", phone: "+1 305 555 0142" },
  { id: ORG_XYZ, name: "Agencia XYZ", kind: "partner_firm", area: "B5", specialty: "Posicionamiento, SEO local y sitios de conversión para negocios de servicios", city: "Tampa, FL", email: "hola@agenciaxyz.com", phone: "+1 813 555 0198" },
];

// Businesses
export const BIZ_VOSSLER = uuid("0b000000", 1);
export const BIZ_PRIME = uuid("0b000000", 2);
export const BIZ_ENYERMY = uuid("0b000000", 3);

// Users
export const U_LUCIA = uuid("0c000000", 1);
export const U_JULIAN = uuid("0c000000", 20);
export const U_SOFIA = uuid("0c000000", 21);
export const U_TOMAS = uuid("0c000000", 2);
export const U_CARLA = uuid("0c000000", 3);
export const U_DANIEL = uuid("0c000000", 4);
export const U_ENYERMY = uuid("0c000000", 5);
export const U_MARYLIN = uuid("0c000000", 6);
export const U_NICOLAS = uuid("0c000000", 7);

export const users: User[] = [
  { id: U_JULIAN, full_name: "Julián Ferreyra", email: "julian@estudioperez.legal", role: "partner_firm", organization_id: ORG_PEREZ, business_id: null, title: "Abogado asociado", google_calendar_email: null },
  { id: U_SOFIA, full_name: "Sofía Lagos", email: "sofia@agenciaxyz.com", role: "partner_firm", organization_id: ORG_XYZ, business_id: null, title: "Especialista SEO", google_calendar_email: null },
  { id: U_LUCIA, full_name: "Lucía Pérez", email: "lucia@estudioperez.legal", role: "partner_firm", organization_id: ORG_PEREZ, business_id: null, title: "Socia", google_calendar_email: "lucia.perez@gmail.com" },
  { id: U_TOMAS, full_name: "Tomás Herrera", email: "tomas@agenciaxyz.com", role: "partner_firm", organization_id: ORG_XYZ, business_id: null, title: "Director de cuentas", google_calendar_email: null },
  { id: U_CARLA, full_name: "Carla Méndez", email: "carla@vossler.com", role: "business_owner", organization_id: null, business_id: BIZ_VOSSLER, title: null, google_calendar_email: null },
  { id: U_DANIEL, full_name: "Daniel Ortiz", email: "daniel@prime10solutions.com", role: "business_owner", organization_id: null, business_id: BIZ_PRIME, title: null, google_calendar_email: null },
  { id: U_ENYERMY, full_name: "Enyermy Rivas", email: "enyermy@enyermyhair.com", role: "business_owner", organization_id: null, business_id: BIZ_ENYERMY, title: null, google_calendar_email: null },
  { id: U_MARYLIN, full_name: "Marylin Boraei", email: "marylin@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Directora", google_calendar_email: null },
  { id: U_NICOLAS, full_name: "Nicolás García", email: "nicolas@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Consultor", google_calendar_email: null },
];

export const businesses: Business[] = [
  { id: BIZ_VOSSLER, name: "Vossler", industry: "Construcción residencial", city: "Orlando", state: "FL", owner_user_id: U_CARLA, program_start_date: "2026-08-02", program_day: 74 },
  { id: BIZ_PRIME, name: "Prime 10 Solutions", industry: "Remodelaciones", city: "Tampa", state: "FL", owner_user_id: U_DANIEL, program_start_date: "2026-09-14", program_day: 31 },
  { id: BIZ_ENYERMY, name: "Enyermy Hair Studio", industry: "Salón de belleza", city: "Miami", state: "FL", owner_user_id: U_ENYERMY, program_start_date: "2026-10-09", program_day: 6 },
];

// Official Método 180 catalog entries (code, name and criteria verbatim).
interface CatalogItem {
  code: string;
  name: string;
  criteria: string;
  step: TaskStep;
  depends_on?: string;
  org: string;
  assignee: string;
}

const catalog: CatalogItem[] = [
  { code: "B6-01", name: "Data Room legal/corporativo + matriz de readiness", criteria: "Inventario de documentos, licencias, seguros, contratos, registros, riesgos, pendientes, owner y destino de cada documento.", step: "survey", org: ORG_PEREZ, assignee: U_LUCIA },
  { code: "B6-02", name: "Evaluación inicial de estructura societaria y fiscal", criteria: "Memo de opciones y decisión documentada sobre LLC o Corporation y, cuando corresponda, elección tributaria S-Corp, con validación profesional aplicable.", step: "design", depends_on: "B6-01", org: ORG_PEREZ, assignee: U_LUCIA },
  { code: "B6-03", name: "Mapa regulatorio de licencias, permisos y tiempos de habilitación", criteria: "Mapa por oficio y territorio con licencias, permisos y autorizaciones aplicables; entidad emisora, requisitos, responsable, dependencias, fees, renovación y tiempo estimado.", step: "survey", org: ORG_PEREZ, assignee: U_LUCIA },
  { code: "B6-04", name: "Plantillas estandarizadas de contratos operativos", criteria: "Biblioteca base para proposal/scope, customer agreement, subcontractor, work order, change order, warranty y otros documentos definidos por el flujo.", step: "implement", depends_on: "B6-02", org: ORG_PEREZ, assignee: U_LUCIA },
  { code: "B6-05", name: "Plantillas de NDA, confidencialidad, uso de datos y privacidad", criteria: "Plantillas estandarizadas con variables de negocio definidas y revisión jurídica para la jurisdicción aplicable.", step: "implement", org: ORG_PEREZ, assignee: U_LUCIA },
  { code: "B5-01", name: "Posicionamiento + propuesta de valor", criteria: "Mensajes, diferenciadores y pruebas de valor alineados con servicios rentables y capacidad real.", step: "design", org: ORG_XYZ, assignee: U_TOMAS },
  { code: "B5-02", name: "Perfil de Google y posicionamiento local", criteria: "Perfil, categorías, servicios, señales locales y arquitectura SEO local optimizados con tracking básico.", step: "implement", org: ORG_XYZ, assignee: U_TOMAS },
  { code: "B5-03", name: "Posicionamiento en buscadores de IA (AI Search / GEO)", criteria: "Optimización y medición inicial de presencia de la empresa en motores de respuesta/IA.", step: "implement", org: ORG_XYZ, assignee: U_TOMAS },
  { code: "B5-04", name: "Sistema de reseñas, reputación y referidos", criteria: "Flujo para solicitar, responder, escalar y reutilizar reseñas verificables, con métricas.", step: "design", depends_on: "B5-02", org: ORG_XYZ, assignee: U_TOMAS },
  { code: "B5-05", name: "Website / landing orientado a conversión", criteria: "Arquitectura, mensajes, CTA, formularios, tracking y ownership definidos; alcance acotado.", step: "implement", depends_on: "B5-01", org: ORG_XYZ, assignee: U_TOMAS },
];

type Plan = Record<string, { status: TaskStatus; start: string; due: string; version?: number }>;

// Statuses follow each business's progress through the program (today = 2026-10-14).
const plans: Record<string, Plan> = {
  [BIZ_VOSSLER]: {
    "B6-01": { status: "accepted", start: "2026-08-17", due: "2026-09-04", version: 1 },
    "B6-02": { status: "submitted", start: "2026-09-07", due: "2026-10-09", version: 2 },
    "B6-03": { status: "in_progress", start: "2026-09-14", due: "2026-10-10" },
    "B6-04": { status: "pending", start: "2026-10-19", due: "2026-11-20" },
    "B6-05": { status: "accepted", start: "2026-08-24", due: "2026-09-25", version: 1 },
    "B5-01": { status: "accepted", start: "2026-08-17", due: "2026-09-11", version: 1 },
    "B5-02": { status: "changes_requested", start: "2026-09-08", due: "2026-10-17", version: 1 },
    "B5-03": { status: "in_progress", start: "2026-10-01", due: "2026-10-30" },
    "B5-04": { status: "pending", start: "2026-10-26", due: "2026-11-27" },
    "B5-05": { status: "submitted", start: "2026-09-14", due: "2026-10-16", version: 1 },
  },
  [BIZ_PRIME]: {
    "B6-01": { status: "changes_requested", start: "2026-09-29", due: "2026-10-16", version: 1 },
    "B6-02": { status: "pending", start: "2026-10-19", due: "2026-11-13" },
    "B6-03": { status: "in_progress", start: "2026-09-29", due: "2026-10-08" },
    "B6-04": { status: "pending", start: "2026-11-16", due: "2026-12-18" },
    "B6-05": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B5-01": { status: "in_progress", start: "2026-09-29", due: "2026-10-15" },
    "B5-02": { status: "submitted", start: "2026-09-29", due: "2026-10-20", version: 1 },
    "B5-03": { status: "pending", start: "2026-10-26", due: "2026-11-25" },
    "B5-04": { status: "pending", start: "2026-11-02", due: "2026-12-04" },
    "B5-05": { status: "pending", start: "2026-10-19", due: "2026-11-27" },
  },
  [BIZ_ENYERMY]: {
    "B6-01": { status: "in_progress", start: "2026-10-12", due: "2026-10-30" },
    "B6-02": { status: "pending", start: "2026-11-02", due: "2026-11-27" },
    "B6-03": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B6-04": { status: "pending", start: "2026-11-30", due: "2027-01-08" },
    "B6-05": { status: "pending", start: "2026-11-09", due: "2026-12-11" },
    "B5-01": { status: "in_progress", start: "2026-10-12", due: "2026-11-06" },
    "B5-02": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B5-03": { status: "pending", start: "2026-11-16", due: "2026-12-18" },
    "B5-04": { status: "pending", start: "2026-11-23", due: "2026-12-23" },
    "B5-05": { status: "pending", start: "2026-11-09", due: "2026-12-18" },
  },
};

const bizIndex: Record<string, number> = { [BIZ_VOSSLER]: 1, [BIZ_PRIME]: 2, [BIZ_ENYERMY]: 3 };
const taskId = (bizId: string, code: string) => {
  const n = bizIndex[bizId]! * 100 + catalog.findIndex((c) => c.code === code) + 1;
  return uuid("0d000000", n);
};

export const TASK_B602_VOSSLER = taskId(BIZ_VOSSLER, "B6-02");

export const tasks: Task[] = businesses.flatMap((b) =>
  catalog.map((c) => {
    const p = plans[b.id]![c.code]!;
    return {
      id: taskId(b.id, c.code),
      code: c.code,
      name: c.name,
      acceptance_criteria: c.criteria,
      area: c.code.slice(0, 2) as Task["area"],
      step: c.step,
      status: p.status,
      business_id: b.id,
      organization_id: c.org,
      assignee_user_id: c.assignee,
      depends_on_task_ids: c.depends_on ? [taskId(b.id, c.depends_on)] : [],
      start_date: p.start,
      due_date: p.due,
      current_version: p.version ?? 0,
      updated_at: `${p.start}T14:00:00Z`,
    };
  }),
);

// ---------- Activity ----------
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const minDate = (a: string, b: string) => (a < b ? a : b);
const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const at = (date: string, time = "15:00:00") => `${date}T${time}Z`;
const SEED_TODAY = "2026-10-14";
const ownerOf = (bizId: string) => businesses.find((b) => b.id === bizId)!.owner_user_id;
const slug = (bizId: string) => businesses.find((b) => b.id === bizId)!.name.replace(/\s+/g, "_");

export const TASK_B603_VOSSLER = taskId(BIZ_VOSSLER, "B6-03");
const TASK_B502_VOSSLER = taskId(BIZ_VOSSLER, "B5-02");
const TASK_B601_PRIME = taskId(BIZ_PRIME, "B6-01");

let n = 0;
const next = (prefix: string) => uuid(prefix, ++n);

export const versions: TaskVersion[] = [];
export const comments: TaskComment[] = [];
export const events: TaskEvent[] = [];
export const ownerRequests: OwnerRequest[] = [];
export const meetings: Meeting[] = [];

/** Simulated Google Calendar events of the users who connected it. */
export const calendarEvents: ExternalCalendarEvent[] = [
  { id: uuid("1e000000", 1), user_id: U_LUCIA, title: "Audiencia — caso Ramírez", starts_at: "2026-10-14T13:00:00Z", duration_minutes: 90 },
  { id: uuid("1e000000", 2), user_id: U_LUCIA, title: "Almuerzo con socios del estudio", starts_at: "2026-10-15T16:30:00Z", duration_minutes: 60 },
  { id: uuid("1e000000", 3), user_id: U_LUCIA, title: "Firma de escritura — cliente particular", starts_at: "2026-10-20T14:00:00Z", duration_minutes: 60 },
  { id: uuid("1e000000", 4), user_id: U_LUCIA, title: "Dentista", starts_at: "2026-10-22T21:00:00Z", duration_minutes: 45 },
  { id: uuid("1e000000", 5), user_id: U_LUCIA, title: "Capacitación Colegio de Abogados", starts_at: "2026-10-28T13:00:00Z", duration_minutes: 180 },
];

const changesText: Record<string, string> = {
  [TASK_B502_VOSSLER]:
    "Tomás, el perfil quedó bien pero pusiste Kissimmee como zona de servicio y no trabajamos ahí. Sacala y agregá Winter Park, que es donde más obras tenemos.",
  [TASK_B601_PRIME]:
    "Lucía, en el inventario faltan los seguros de las camionetas y la licencia de contratista del condado de Hillsborough. Te los mando hoy por mail, ¿los sumás?",
};

// Generic history for every task except the main example.
for (const t of tasks) {
  if (t.id === TASK_B602_VOSSLER) continue;
  const owner = ownerOf(t.business_id);
  events.push({ id: next("1c000000"), task_id: t.id, kind: "assigned", actor_user_id: U_NICOLAS, version: null, comment_id: null, created_at: at(t.start_date, "13:00:00") });
  if (t.status === "pending") continue;
  events.push({ id: next("1c000000"), task_id: t.id, kind: "started", actor_user_id: t.assignee_user_id, version: null, comment_id: null, created_at: at(addDays(t.start_date, 1), "14:30:00") });
  if (t.current_version < 1) continue;
  const end = minDate(t.due_date, SEED_TODAY);
  let sub = addDays(t.start_date, Math.max(2, Math.floor(span(t.start_date, end) * 0.6)));
  sub = minDate(sub, addDays(SEED_TODAY, -3));
  const review = minDate(addDays(sub, 2), addDays(SEED_TODAY, -1));
  let reviewComment: string | null = null;
  if (t.status === "changes_requested") {
    reviewComment = next("0f000000");
    comments.push({ id: reviewComment, task_id: t.id, author_user_id: owner, body: changesText[t.id] ?? "", created_at: at(review, "12:10:00"), kind: "changes_requested", file_id: null });
  }
  versions.push({
    id: next("0e000000"), task_id: t.id, version: 1, submitted_by_user_id: t.assignee_user_id, submitted_at: at(sub, "18:00:00"),
    note: "Primera versión para revisar.", files: [{ id: next("1d000000"), name: `${t.code}_${slug(t.business_id)}_v1.pdf`, size_kb: 640 }],
    status: t.status === "accepted" ? "accepted" : t.status === "changes_requested" ? "changes_requested" : "submitted",
    review_comment_id: reviewComment,
  });
  events.push({ id: next("1c000000"), task_id: t.id, kind: "submitted", actor_user_id: t.assignee_user_id, version: 1, comment_id: null, created_at: at(sub, "18:00:00") });
  if (t.status === "accepted")
    events.push({ id: next("1c000000"), task_id: t.id, kind: "approved", actor_user_id: owner, version: 1, comment_id: null, created_at: at(review, "11:20:00") });
  if (t.status === "changes_requested")
    events.push({ id: next("1c000000"), task_id: t.id, kind: "changes_requested", actor_user_id: owner, version: 1, comment_id: reviewComment, created_at: at(review, "12:10:00") });
}

// Main example: B6-02 at Vossler.
const T = TASK_B602_VOSSLER;
const C_CHANGES = uuid("0f000000", 901);
const F_MEMO_V2 = uuid("1d000000", 902);
versions.push(
  {
    id: uuid("0e000000", 901), task_id: T, version: 1, submitted_by_user_id: U_LUCIA, submitted_at: "2026-09-29T16:20:00Z",
    note: "Te dejo el memo con las dos opciones (LLC con elección S-Corp vs. Corporation). Mi recomendación está en la página 4.",
    files: [
      { id: uuid("1d000000", 900), name: "Vossler_memo_estructura_v1.pdf", size_kb: 812 },
      { id: uuid("1d000000", 901), name: "Comparativo_LLC_vs_Corp.xlsx", size_kb: 96 },
    ],
    status: "changes_requested", review_comment_id: C_CHANGES,
  },
  {
    id: uuid("0e000000", 902), task_id: T, version: 2, submitted_by_user_id: U_LUCIA, submitted_at: "2026-10-12T19:05:00Z",
    note: "Versión 2 con el acta constitutiva incorporada y el análisis actualizado. Cambié la sección 3 según lo que hablamos.",
    files: [
      { id: F_MEMO_V2, name: "Vossler_memo_estructura_v2.pdf", size_kb: 1024 },
      { id: uuid("1d000000", 903), name: "Acta_constitutiva_Vossler.pdf", size_kb: 2310 },
    ],
    status: "submitted", review_comment_id: null,
  },
);
comments.push(
  { id: C_CHANGES, task_id: T, author_user_id: U_CARLA, kind: "changes_requested", file_id: null, created_at: "2026-10-01T13:42:00Z", body: "Lucía, gracias. Lo leí con mi contador y nos gusta la opción LLC, pero falta el acta constitutiva. Sin eso no puedo firmar nada. ¿La podés sumar?" },
  { id: uuid("0f000000", 902), task_id: T, author_user_id: U_LUCIA, kind: "comment", file_id: null, created_at: "2026-10-01T15:10:00Z", body: "Tenés razón, Carla. No la tengo en el data room. Te dejo un pedido para que me la subas y la incorporo esta semana." },
  { id: uuid("0f000000", 903), task_id: T, author_user_id: U_NICOLAS, kind: "comment", file_id: null, created_at: "2026-10-02T12:00:00Z", body: "Ojo que la fecha de entrega es el 9. Si el acta llega tarde, avisen así lo reprogramamos. @Marylin Boraei para que lo tengas en el radar." },
  { id: uuid("0f000000", 904), task_id: T, author_user_id: U_LUCIA, kind: "comment", file_id: null, created_at: "2026-10-12T19:06:00Z", body: "Listo, subí la v2. Propuse una llamada corta para repasar la sección 3 antes de que la apruebes, @Carla Méndez." },
  { id: uuid("0f000000", 905), task_id: T, author_user_id: U_NICOLAS, kind: "comment", file_id: F_MEMO_V2, created_at: "2026-10-13T10:15:00Z", body: "@Lucía Pérez en la página 6 citás la sección 1362, pero creo que es la 1361. ¿Lo revisás?" },
  { id: uuid("0f000000", 906), task_id: T, author_user_id: U_LUCIA, kind: "comment", file_id: F_MEMO_V2, created_at: "2026-10-13T11:02:00Z", body: "Bien visto, @Nicolás García. Es la 1361; lo corrijo si Carla pide otra vuelta o en la versión final." },
);
events.push(
  { id: uuid("1c000000", 901), task_id: T, kind: "assigned", actor_user_id: U_NICOLAS, version: null, comment_id: null, created_at: "2026-09-07T13:00:00Z" },
  { id: uuid("1c000000", 902), task_id: T, kind: "started", actor_user_id: U_LUCIA, version: null, comment_id: null, created_at: "2026-09-08T14:30:00Z" },
  { id: uuid("1c000000", 903), task_id: T, kind: "submitted", actor_user_id: U_LUCIA, version: 1, comment_id: null, created_at: "2026-09-29T16:20:00Z" },
  { id: uuid("1c000000", 904), task_id: T, kind: "changes_requested", actor_user_id: U_CARLA, version: 1, comment_id: C_CHANGES, created_at: "2026-10-01T13:42:00Z" },
  { id: uuid("1c000000", 905), task_id: T, kind: "submitted", actor_user_id: U_LUCIA, version: 2, comment_id: null, created_at: "2026-10-12T19:05:00Z" },
);
ownerRequests.push(
  { id: uuid("1a000000", 901), task_id: T, requested_by_user_id: U_LUCIA, question: "Necesito copia del acta constitutiva (Articles of Organization) de Vossler, con la última enmienda si la hay.", due_date: "2026-10-06", answer: "Ahí la subí. La enmienda de 2023 está en la última página del mismo PDF.", status: "resolved", created_at: "2026-10-01T15:12:00Z", resolved_at: "2026-10-07T21:30:00Z" },
  { id: uuid("1a000000", 902), task_id: TASK_B603_VOSSLER, requested_by_user_id: U_LUCIA, question: "Copia de la licencia de contratista estatal (CGC) vigente.", due_date: "2026-10-16", answer: null, status: "open", created_at: "2026-10-06T14:00:00Z", resolved_at: null },
  { id: uuid("1a000000", 903), task_id: TASK_B603_VOSSLER, requested_by_user_id: U_LUCIA, question: "Lista de condados donde querés operar en los próximos dos años.", due_date: "2026-10-17", answer: null, status: "open", created_at: "2026-10-06T14:02:00Z", resolved_at: null },
);
meetings.push(
  { id: uuid("1b000000", 901), task_id: T, proposed_by_user_id: U_LUCIA, topic: "Arranque: opciones de estructura societaria", starts_at: "2026-09-10T15:00:00Z", duration_minutes: 45, status: "confirmed" },
  { id: uuid("1b000000", 902), task_id: T, proposed_by_user_id: U_LUCIA, topic: "Repaso de la sección 3 del memo (elección S-Corp)", starts_at: "2026-10-16T15:00:00Z", duration_minutes: 30, status: "proposed" },
);
