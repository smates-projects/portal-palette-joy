import type {
  Business,
  Meeting,
  Organization,
  OwnerRequest,
  Task,
  TaskComment,
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
  { id: ORG_SM, name: "Strategic Mates", kind: "sm", area: null },
  { id: ORG_PEREZ, name: "Estudio Pérez Legal", kind: "partner_firm", area: "B6" },
  { id: ORG_XYZ, name: "Agencia XYZ", kind: "partner_firm", area: "B5" },
];

// Businesses
export const BIZ_VOSSLER = uuid("0b000000", 1);
export const BIZ_PRIME = uuid("0b000000", 2);
export const BIZ_ENYERMY = uuid("0b000000", 3);

// Users
export const U_LUCIA = uuid("0c000000", 1);
export const U_TOMAS = uuid("0c000000", 2);
export const U_CARLA = uuid("0c000000", 3);
export const U_DANIEL = uuid("0c000000", 4);
export const U_ENYERMY = uuid("0c000000", 5);
export const U_MARYLIN = uuid("0c000000", 6);
export const U_NICOLAS = uuid("0c000000", 7);

export const users: User[] = [
  { id: U_LUCIA, full_name: "Lucía Pérez", email: "lucia@estudioperez.legal", role: "partner_firm", organization_id: ORG_PEREZ, business_id: null, title: "Socia" },
  { id: U_TOMAS, full_name: "Tomás Herrera", email: "tomas@agenciaxyz.com", role: "partner_firm", organization_id: ORG_XYZ, business_id: null, title: "Director de cuentas" },
  { id: U_CARLA, full_name: "Carla Méndez", email: "carla@vossler.com", role: "business_owner", organization_id: null, business_id: BIZ_VOSSLER, title: null },
  { id: U_DANIEL, full_name: "Daniel Ortiz", email: "daniel@prime10solutions.com", role: "business_owner", organization_id: null, business_id: BIZ_PRIME, title: null },
  { id: U_ENYERMY, full_name: "Enyermy Rivas", email: "enyermy@enyermyhair.com", role: "business_owner", organization_id: null, business_id: BIZ_ENYERMY, title: null },
  { id: U_MARYLIN, full_name: "Marylin Boraei", email: "marylin@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Directora" },
  { id: U_NICOLAS, full_name: "Nicolás García", email: "nicolas@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Consultor" },
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
  const n = bizIndex[bizId] * 100 + catalog.findIndex((c) => c.code === code) + 1;
  return uuid("0d000000", n);
};

export const TASK_B602_VOSSLER = taskId(BIZ_VOSSLER, "B6-02");

export const tasks: Task[] = businesses.flatMap((b) =>
  catalog.map((c) => {
    const p = plans[b.id][c.code];
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

// Main example: B6-02 at Vossler.
export const versions: TaskVersion[] = [
  { id: uuid("0e000000", 1), task_id: TASK_B602_VOSSLER, version: 1, submitted_by_user_id: U_LUCIA, submitted_at: "2026-09-29T16:20:00Z", note: "Te dejo el memo con las dos opciones (LLC con elección S-Corp vs. Corporation). Mi recomendación está en la página 4.", file_name: "Vossler_memo_estructura_v1.pdf" },
  { id: uuid("0e000000", 2), task_id: TASK_B602_VOSSLER, version: 2, submitted_by_user_id: U_LUCIA, submitted_at: "2026-10-12T19:05:00Z", note: "Versión 2 con el acta constitutiva incorporada y el análisis actualizado. Cambié la sección 3 según lo que hablamos.", file_name: "Vossler_memo_estructura_v2.pdf" },
];

export const comments: TaskComment[] = [
  { id: uuid("0f000000", 1), task_id: TASK_B602_VOSSLER, author_user_id: U_CARLA, kind: "changes_requested", created_at: "2026-10-01T13:42:00Z", body: "Lucía, gracias. Lo leí con mi contador y nos gusta la opción LLC, pero falta el acta constitutiva. Sin eso no puedo firmar nada. ¿La podés sumar?" },
  { id: uuid("0f000000", 2), task_id: TASK_B602_VOSSLER, author_user_id: U_LUCIA, kind: "comment", created_at: "2026-10-01T15:10:00Z", body: "Tenés razón, Carla. No la tengo en el data room. Te dejo un pedido para que me la subas y la incorporo esta semana." },
  { id: uuid("0f000000", 3), task_id: TASK_B602_VOSSLER, author_user_id: U_NICOLAS, kind: "comment", created_at: "2026-10-02T12:00:00Z", body: "Ojo que la fecha de entrega es el 9. Si el acta llega tarde, avisen así lo reprogramamos." },
  { id: uuid("0f000000", 4), task_id: TASK_B602_VOSSLER, author_user_id: U_LUCIA, kind: "comment", created_at: "2026-10-12T19:06:00Z", body: "Listo, subí la v2. Propuse una llamada corta para repasar la sección 3 antes de que la apruebes." },
];

export const ownerRequests: OwnerRequest[] = [
  { id: uuid("1a000000", 1), task_id: TASK_B602_VOSSLER, requested_by_user_id: U_LUCIA, question: "Necesito copia del acta constitutiva (Articles of Organization) de Vossler, con la última enmienda si la hay.", answer: "Ahí la subí. La enmienda de 2023 está en la última página del mismo PDF.", status: "resolved", created_at: "2026-10-01T15:12:00Z", resolved_at: "2026-10-07T21:30:00Z" },
];

export const meetings: Meeting[] = [
  { id: uuid("1b000000", 1), task_id: TASK_B602_VOSSLER, proposed_by_user_id: U_LUCIA, topic: "Repaso de la sección 3 del memo (elección S-Corp)", starts_at: "2026-10-16T15:00:00Z", duration_minutes: 30, status: "proposed" },
];
