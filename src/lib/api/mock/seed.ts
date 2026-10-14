import type { ExternalCalendarEvent, NotificationKind, TaskChange,
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

import catalogJson from "@/data/catalogo_metodo180.json";
import { generateProgramTasks, type CatalogEntry } from "../program";

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
export const U_RODRIGO = uuid("0c000000", 30);
export const U_MARIANA = uuid("0c000000", 31);
export const U_ANDRES = uuid("0c000000", 32);
export const U_CAMILA = uuid("0c000000", 33);
export const U_RODRIGO_BIMBO = uuid("0c000000", 43);

// Organizations
export const ORG_SM = uuid("0a000000", 1);
export const ORG_PEREZ = uuid("0a000000", 2);
export const ORG_XYZ = uuid("0a000000", 3);
export const ORG_DELTA = uuid("0a000000", 4);
export const ORG_TECNO = uuid("0a000000", 5);
export const ORG_OPSLAB = uuid("0a000000", 6);
/** SM Global: headquarters, parent of every SM office. */
export const ORG_GLOBAL = uuid("0a000000", 10);

export const organizations: Organization[] = [
  { id: ORG_GLOBAL, name: "SM Global", kind: "sm_global", area: null, specialty: null, city: "Miami, FL", email: "global@strategicmates.com", phone: null, parent_id: null },
  { id: ORG_SM, name: "SM Miami", kind: "sm", area: null, specialty: null, city: "Miami, FL", email: "hola@strategicmates.com", phone: null, default_booking_url: "https://strategicmates.com/MarilynBoraei", parent_id: ORG_GLOBAL, status: "operating", opened_at: "2024-06-03", manager_user_id: U_NICOLAS },
  { id: ORG_PEREZ, name: "Estudio Pérez Legal", kind: "partner_firm", area: "B6", specialty: "Derecho corporativo, licencias y contratos para franquicias en Florida", city: "Miami, FL", email: "contacto@estudioperez.legal", phone: "+1 305 555 0142", parent_id: ORG_SM },
  { id: ORG_DELTA, name: "Delta Contadores", kind: "partner_firm", area: "B3", specialty: "Contabilidad, finanzas y fiscal para pymes que se preparan para franquiciar", city: "Miami, FL", email: "hola@deltacontadores.com", phone: "+1 305 555 0171", parent_id: ORG_SM },
  { id: ORG_TECNO, name: "TecnoPyme", kind: "partner_firm", area: "B4", specialty: "CRM, órdenes de servicio y tableros para negocios de servicios", city: "Orlando, FL", email: "equipo@tecnopyme.io", phone: "+1 407 555 0123", parent_id: ORG_SM },
  { id: ORG_OPSLAB, name: "OpsLab Consulting", kind: "partner_firm", area: "B2", specialty: "Procesos, manuales operativos y estándares de servicio", city: "Miami, FL", email: "hola@opslab.co", phone: "+1 305 555 0165", parent_id: ORG_SM },
  { id: ORG_XYZ, name: "Agencia XYZ", kind: "partner_firm", area: "B5", specialty: "Posicionamiento, SEO local y sitios de conversión para negocios de servicios", city: "Tampa, FL", email: "hola@agenciaxyz.com", phone: "+1 813 555 0198", parent_id: ORG_SM },
];

// Businesses
export const BIZ_BIMBO = uuid("0b000000", 10);
export const BIZ_VOSSLER = uuid("0b000000", 1);
export const BIZ_PRIME = uuid("0b000000", 2);
export const BIZ_ENYERMY = uuid("0b000000", 3);


export const users: User[] = [
  { id: U_JULIAN, full_name: "Julián Ferreyra", email: "julian@estudioperez.legal", role: "partner_firm", organization_id: ORG_PEREZ, business_id: null, title: "Abogado asociado", google_calendar_email: null, booking_url: null },
  { id: U_SOFIA, full_name: "Sofía Lagos", email: "sofia@agenciaxyz.com", role: "partner_firm", organization_id: ORG_XYZ, business_id: null, title: "Especialista SEO", google_calendar_email: null, booking_url: null },
  { id: U_LUCIA, full_name: "Lucía Pérez", email: "lucia@estudioperez.legal", role: "partner_firm", organization_id: ORG_PEREZ, business_id: null, title: "Socia", google_calendar_email: "lucia.perez@gmail.com", booking_url: null },
  { id: U_TOMAS, full_name: "Tomás Herrera", email: "tomas@agenciaxyz.com", role: "partner_firm", organization_id: ORG_XYZ, business_id: null, title: "Director de cuentas", google_calendar_email: null, booking_url: null },
  { id: U_CARLA, full_name: "Carla Méndez", email: "carla@vossler.com", role: "business_owner", organization_id: null, business_id: BIZ_VOSSLER, title: null, google_calendar_email: null, booking_url: null },
  { id: U_DANIEL, full_name: "Daniel Ortiz", email: "daniel@prime10solutions.com", role: "business_owner", organization_id: null, business_id: BIZ_PRIME, title: null, google_calendar_email: null, booking_url: null },
  { id: U_ENYERMY, full_name: "Enyermy Rivas", email: "enyermy@enyermyhair.com", role: "business_owner", organization_id: null, business_id: BIZ_ENYERMY, title: null, google_calendar_email: null, booking_url: null },
  { id: U_RODRIGO, full_name: "Rodrigo Salas", email: "rodrigo@deltacontadores.com", role: "partner_firm", organization_id: ORG_DELTA, business_id: null, title: "Contador socio", google_calendar_email: null, booking_url: null },
  { id: U_MARIANA, full_name: "Mariana Ruiz", email: "mariana@tecnopyme.io", role: "partner_firm", organization_id: ORG_TECNO, business_id: null, title: "Líder de implementación", google_calendar_email: null, booking_url: null },
  { id: U_ANDRES, full_name: "Andrés Molina", email: "andres@opslab.co", role: "partner_firm", organization_id: ORG_OPSLAB, business_id: null, title: "Consultor de operaciones", google_calendar_email: null, booking_url: null },
  { id: U_MARYLIN, full_name: "Marilyn Boraei", email: "marilyn@strategicmates.com", role: "sm_global", organization_id: ORG_GLOBAL, business_id: null, title: "Directora", google_calendar_email: null, booking_url: null },
  { id: U_CAMILA, full_name: "Camila Soto", email: "camila@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Consultora", google_calendar_email: null, booking_url: null },
  { id: U_RODRIGO_BIMBO, full_name: "Rodrigo Bimbo", email: "rodrigo@bimbotacos.com", role: "business_owner", organization_id: null, business_id: BIZ_BIMBO, title: "Fundador de Bimbo Tacos", google_calendar_email: null, booking_url: null },
  { id: U_NICOLAS, full_name: "Nicolás García", email: "nicolas@strategicmates.com", role: "sm_team", organization_id: ORG_SM, business_id: null, title: "Consultor", google_calendar_email: null, booking_url: null },
];

export const businesses: Business[] = [
  { id: BIZ_VOSSLER, name: "Vossler", industry: "Construcción residencial", city: "Orlando", state: "FL", owner_user_id: U_CARLA, status: "in_program", program_start_date: "2026-08-02", program_day: 74, office_id: ORG_SM, consultant_id: U_NICOLAS },
  { id: BIZ_PRIME, name: "Prime 10 Solutions", industry: "Remodelaciones", city: "Tampa", state: "FL", owner_user_id: U_DANIEL, status: "in_program", program_start_date: "2026-09-14", program_day: 31, office_id: ORG_SM, consultant_id: U_CAMILA },
  /** Franchisor: finished the program (day 180) and reached franchisability. Its tasks are generated below. */
  { id: BIZ_BIMBO, name: "Bimbo Tacos", industry: "Restaurante", city: "Miami", state: "FL", owner_user_id: U_RODRIGO_BIMBO, status: "franchisor", program_start_date: "2025-03-02", program_day: 180, office_id: ORG_SM, consultant_id: U_NICOLAS },
  { id: BIZ_ENYERMY, name: "Enyermy Hair Studio", industry: "Salón de belleza", city: "Miami", state: "FL", owner_user_id: U_ENYERMY, status: "in_program", program_start_date: "2026-10-09", program_day: 6, office_id: ORG_SM, consultant_id: U_NICOLAS },
];

// Seed tasks take name and acceptance from the official catalog file (src/data/catalogo_metodo180.json), never typed by hand.
interface CatalogItem {
  code: string;
  name: string;
  criteria: string;
  step: TaskStep;
  depends_on?: string;
  org: string;
  /** A person id, or "supervisor": the business's SM consultant (area B1 is done by SM's own team). */
  assignee: string;
}

const fromCatalog = (code: string, step: TaskStep, org: string, assignee: string, depends_on?: string): CatalogItem => {
  const e = (catalogJson as { code: string; name: string; acceptance: string }[]).find((x) => x.code === code);
  if (!e) throw new Error(`catalog code not found: ${code}`);
  return { code, name: e.name, criteria: e.acceptance, step, org, assignee, ...(depends_on ? { depends_on } : {}) };
};

const catalog: CatalogItem[] = [
  // B6 Legal
  fromCatalog("B6-01", "survey", ORG_PEREZ, U_LUCIA),
  fromCatalog("B6-02", "design", ORG_PEREZ, U_LUCIA, "B6-01"),
  fromCatalog("B6-03", "survey", ORG_PEREZ, U_LUCIA),
  fromCatalog("B6-04", "implement", ORG_PEREZ, U_LUCIA, "B6-02"),
  fromCatalog("B6-06", "implement", ORG_PEREZ, U_LUCIA),
  // B5 Marketing y ventas
  fromCatalog("B5-01", "design", ORG_XYZ, U_TOMAS),
  fromCatalog("B5-15", "implement", ORG_XYZ, U_TOMAS),
  fromCatalog("B5-06", "design", ORG_XYZ, U_TOMAS),
  fromCatalog("B5-14", "design", ORG_XYZ, U_TOMAS, "B5-13"),
  fromCatalog("B5-13", "implement", ORG_XYZ, U_TOMAS, "B5-01"),
  // B3 Finanzas
  fromCatalog("B3-01", "survey", ORG_DELTA, U_RODRIGO),
  fromCatalog("B3-02", "implement", ORG_DELTA, U_RODRIGO),
  fromCatalog("B3-03", "design", ORG_DELTA, U_RODRIGO, "B3-01"),
  fromCatalog("B3-04", "design", ORG_DELTA, U_RODRIGO, "B3-03"),
  fromCatalog("B3-05", "design", ORG_DELTA, U_RODRIGO, "B3-04"),
  fromCatalog("B3-06", "design", ORG_DELTA, U_RODRIGO, "B3-04"),
  fromCatalog("B3-07", "design", ORG_DELTA, U_RODRIGO, "B3-04"),
  fromCatalog("B3-08", "validate", ORG_DELTA, U_RODRIGO, "B3-05"),
  fromCatalog("B3-11", "survey", ORG_DELTA, U_RODRIGO),
  // B4 Tecnología
  fromCatalog("B4-01", "survey", ORG_TECNO, U_MARIANA),
  fromCatalog("B4-02", "implement", ORG_TECNO, U_MARIANA, "B4-01"),
  fromCatalog("B4-03", "implement", ORG_TECNO, U_MARIANA, "B4-01"),
  fromCatalog("B4-04", "implement", ORG_TECNO, U_MARIANA, "B4-01"),
  fromCatalog("B4-06", "design", ORG_TECNO, U_MARIANA, "B4-02"),
  fromCatalog("B4-08", "implement", ORG_TECNO, U_MARIANA),
  // B1 Estrategia (SM's own team)
  fromCatalog("B1-01", "design", ORG_SM, "supervisor"),
  fromCatalog("B1-02", "design", ORG_SM, "supervisor", "B1-01"),
  fromCatalog("B1-03", "survey", ORG_SM, "supervisor"),
  // B2 Operaciones
  fromCatalog("B2-01", "survey", ORG_OPSLAB, U_ANDRES),
  fromCatalog("B2-02", "design", ORG_OPSLAB, U_ANDRES, "B2-01"),
  fromCatalog("B2-03", "implement", ORG_OPSLAB, U_ANDRES, "B2-02"),
  fromCatalog("B2-05", "design", ORG_OPSLAB, U_ANDRES),
];
type Plan = Record<string, { status: TaskStatus; start: string; due: string; version?: number }>;

// Statuses follow each business's progress through the program (today = 2026-10-14).
const plans: Record<string, Plan> = {
  [BIZ_VOSSLER]: {
    "B6-01": { status: "accepted", start: "2026-08-17", due: "2026-09-04", version: 1 },
    "B6-02": { status: "submitted", start: "2026-09-07", due: "2026-10-09", version: 2 },
    "B6-03": { status: "in_progress", start: "2026-09-14", due: "2026-10-10" },
    "B6-04": { status: "pending", start: "2026-10-19", due: "2026-11-20" },
    "B6-06": { status: "accepted", start: "2026-08-24", due: "2026-09-25", version: 1 },
    "B5-01": { status: "accepted", start: "2026-08-17", due: "2026-09-11", version: 1 },
    "B5-15": { status: "changes_requested", start: "2026-09-08", due: "2026-10-17", version: 1 },
    "B5-06": { status: "in_progress", start: "2026-10-01", due: "2026-10-30" },
    "B5-14": { status: "pending", start: "2026-10-26", due: "2026-11-27" },
    "B5-13": { status: "submitted", start: "2026-09-14", due: "2026-10-16", version: 1 },
    // Construction business that keeps materials: B3-02 and B4-03 apply. B3-15/B3-16 wait for the new entity; B4-05 waits for reliable data.
    "B3-01": { status: "accepted", start: "2026-08-10", due: "2026-09-11", version: 1 },
    "B3-02": { status: "submitted", start: "2026-09-01", due: "2026-10-16", version: 1 },
    "B3-03": { status: "in_progress", start: "2026-09-14", due: "2026-10-23" },
    "B3-04": { status: "pending", start: "2026-10-26", due: "2026-11-27" },
    "B3-05": { status: "pending", start: "2026-11-30", due: "2027-01-08" },
    "B3-06": { status: "pending", start: "2026-11-30", due: "2026-12-23" },
    "B3-07": { status: "pending", start: "2026-11-30", due: "2027-01-15" },
    "B3-08": { status: "pending", start: "2027-01-11", due: "2027-01-22" },
    "B3-11": { status: "accepted", start: "2026-08-10", due: "2026-09-04", version: 1 },
    "B4-01": { status: "accepted", start: "2026-08-10", due: "2026-09-11", version: 1 },
    "B4-02": { status: "in_progress", start: "2026-09-14", due: "2026-10-15" },
    "B4-03": { status: "changes_requested", start: "2026-09-21", due: "2026-10-21", version: 1 },
    "B4-04": { status: "submitted", start: "2026-09-21", due: "2026-10-23", version: 1 },
    "B4-06": { status: "pending", start: "2026-10-19", due: "2026-11-20" },
    "B4-08": { status: "in_progress", start: "2026-10-05", due: "2026-10-28" },
    // Strategy (SM) and Operations (OpsLab).
    "B1-01": { status: "submitted", start: "2026-08-17", due: "2026-10-16", version: 1 },
    "B1-02": { status: "pending", start: "2026-10-19", due: "2026-11-27" },
    "B1-03": { status: "accepted", start: "2026-08-17", due: "2026-09-18", version: 1 },
    "B2-01": { status: "accepted", start: "2026-08-17", due: "2026-09-25", version: 1 },
    "B2-02": { status: "in_progress", start: "2026-09-28", due: "2026-10-30" },
    "B2-03": { status: "pending", start: "2026-11-02", due: "2026-12-11" },
    "B2-05": { status: "in_progress", start: "2026-09-21", due: "2026-10-28" },
  },
  [BIZ_PRIME]: {
    "B6-01": { status: "changes_requested", start: "2026-09-29", due: "2026-10-16", version: 1 },
    "B6-02": { status: "pending", start: "2026-10-19", due: "2026-11-13" },
    "B6-03": { status: "accepted", start: "2026-09-29", due: "2026-10-08", version: 1 },
    "B6-04": { status: "pending", start: "2026-11-16", due: "2026-12-18" },
    "B6-06": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B5-01": { status: "in_progress", start: "2026-09-29", due: "2026-10-15" },
    "B5-15": { status: "submitted", start: "2026-09-29", due: "2026-10-20", version: 1 },
    "B5-06": { status: "pending", start: "2026-10-26", due: "2026-11-25" },
    "B5-14": { status: "pending", start: "2026-11-02", due: "2026-12-04" },
    "B5-13": { status: "pending", start: "2026-10-19", due: "2026-11-27" },
    "B1-01": { status: "in_progress", start: "2026-09-29", due: "2026-10-30" },
    "B1-02": { status: "pending", start: "2026-11-02", due: "2026-12-04" },
    "B1-03": { status: "submitted", start: "2026-09-29", due: "2026-10-21", version: 1 },
    "B2-01": { status: "in_progress", start: "2026-09-29", due: "2026-11-06" },
    "B2-02": { status: "pending", start: "2026-11-09", due: "2026-12-11" },
    "B2-03": { status: "pending", start: "2026-12-14", due: "2027-01-22" },
    "B2-05": { status: "pending", start: "2026-11-16", due: "2026-12-18" },
  },
  [BIZ_ENYERMY]: {
    "B6-01": { status: "in_progress", start: "2026-10-12", due: "2026-10-30" },
    "B6-02": { status: "pending", start: "2026-11-02", due: "2026-11-27" },
    "B6-03": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B6-04": { status: "pending", start: "2026-11-30", due: "2027-01-08" },
    "B6-06": { status: "pending", start: "2026-11-09", due: "2026-12-11" },
    "B5-01": { status: "accepted", start: "2026-10-09", due: "2026-10-13", version: 1 },
    "B5-15": { status: "pending", start: "2026-10-26", due: "2026-11-20" },
    "B5-06": { status: "pending", start: "2026-11-16", due: "2026-12-18" },
    "B5-14": { status: "pending", start: "2026-11-23", due: "2026-12-23" },
    "B5-13": { status: "pending", start: "2026-11-09", due: "2026-12-18" },
    "B1-01": { status: "pending", start: "2026-10-26", due: "2026-11-27" },
    "B1-02": { status: "pending", start: "2026-11-30", due: "2027-01-08" },
    "B1-03": { status: "in_progress", start: "2026-10-12", due: "2026-11-06" },
    "B2-01": { status: "pending", start: "2026-10-26", due: "2026-11-27" },
    "B2-02": { status: "pending", start: "2026-11-30", due: "2027-01-08" },
    "B2-03": { status: "pending", start: "2027-01-11", due: "2027-02-12" },
    "B2-05": { status: "pending", start: "2026-11-30", due: "2026-12-23" },
  },
};

const bizIndex: Record<string, number> = { [BIZ_VOSSLER]: 1, [BIZ_PRIME]: 2, [BIZ_ENYERMY]: 3 };
const taskId = (bizId: string, code: string) => {
  const n = bizIndex[bizId]! * 100 + catalog.findIndex((c) => c.code === code) + 1;
  return uuid("0d000000", n);
};

/** SM supervisor per business (sample assignment). */
const supervisorOf: Record<string, string> = { [BIZ_VOSSLER]: U_NICOLAS, [BIZ_ENYERMY]: U_NICOLAS, [BIZ_PRIME]: U_CAMILA, [BIZ_BIMBO]: U_NICOLAS };

export const TASK_B602_VOSSLER = taskId(BIZ_VOSSLER, "B6-02");

const programTasks: Task[] = businesses.flatMap((b) =>
  catalog.flatMap((c) => {
    const p = plans[b.id]?.[c.code];
    if (!p) return [];
    return [{
      id: taskId(b.id, c.code),
      code: c.code,
      name: c.name,
      acceptance_criteria: c.criteria,
      area: c.code.slice(0, 2) as Task["area"],
      step: c.step,
      status: p.status,
      business_id: b.id,
      organization_id: c.org,
      assignee_user_id: c.assignee === "supervisor" ? supervisorOf[b.id]! : c.assignee,
      supervisor_user_id: supervisorOf[b.id]!,
      depends_on_task_ids: c.depends_on ? [taskId(b.id, c.depends_on)] : [],
      start_date: p.start,
      due_date: p.due,
      current_version: p.version ?? 0,
      updated_at: `${p.start}T14:00:00Z`,
    }];
  }),
);

/** Assignee firm and person per area, for programs generated straight from the catalog (SM Miami). */
export const miamiFirmFor = (area: Task["area"]) =>
  ({
    B1: { organization_id: ORG_SM, assignee_user_id: U_NICOLAS },
    B2: { organization_id: ORG_OPSLAB, assignee_user_id: U_ANDRES },
    B3: { organization_id: ORG_DELTA, assignee_user_id: U_RODRIGO },
    B4: { organization_id: ORG_TECNO, assignee_user_id: U_MARIANA },
    B5: { organization_id: ORG_XYZ, assignee_user_id: U_TOMAS },
    B6: { organization_id: ORG_PEREZ, assignee_user_id: U_LUCIA },
  })[area];

// Bimbo Tacos finished its program: every task generated from the catalog is approved, so franchisability is reached.
let bimboTaskCount = 0;
const bimboTasks: Task[] = generateProgramTasks(catalogJson as CatalogEntry[], {
  business_id: BIZ_BIMBO,
  industry: "restaurant",
  start_date: "2025-03-02",
  supervisor_user_id: U_NICOLAS,
  firmFor: miamiFirmFor,
  newId: () => uuid("0d100000", ++bimboTaskCount),
  now: "2025-03-02T13:00:00Z",
}).map((t) => ({ ...t, status: "accepted", current_version: 1, updated_at: `${t.due_date}T14:00:00Z` }));

export const tasks: Task[] = [...programTasks, ...bimboTasks];

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
const TASK_B515_VOSSLER = taskId(BIZ_VOSSLER, "B5-15");
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
  [TASK_B515_VOSSLER]:
    "Tomás, la landing quedó bien pero pusiste Kissimmee como zona de servicio y no trabajamos ahí. Sácala y agrega Winter Park, que es donde más obras tenemos.",
  [TASK_B601_PRIME]:
    "Lucía, en el inventario faltan los seguros de las camionetas y la licencia de contratista del condado de Hillsborough. Te los mando hoy por mail, ¿los sumas?",
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
  { id: C_CHANGES, task_id: T, author_user_id: U_CARLA, kind: "changes_requested", file_id: null, created_at: "2026-10-01T13:42:00Z", body: "Lucía, gracias. Lo leí con mi contador y nos gusta la opción LLC, pero falta el acta constitutiva. Sin eso no puedo firmar nada. ¿La puedes sumar?" },
  { id: uuid("0f000000", 902), task_id: T, author_user_id: U_LUCIA, kind: "comment", file_id: null, created_at: "2026-10-01T15:10:00Z", body: "Tienes razón, Carla. No la tengo en el data room. Te dejo un pedido para que me la subas y la incorporo esta semana." },
  { id: uuid("0f000000", 903), task_id: T, author_user_id: U_NICOLAS, kind: "comment", file_id: null, created_at: "2026-10-02T12:00:00Z", body: "Ojo que la fecha de entrega es el 9. Si el acta llega tarde, avísennos para reprogramarlo. @Marilyn Boraei para que lo tengas en el radar." },
  { id: uuid("0f000000", 904), task_id: T, author_user_id: U_LUCIA, kind: "comment", file_id: null, created_at: "2026-10-12T19:06:00Z", body: "Listo, subí la v2. Propuse una llamada corta para repasar la sección 3 antes de que la apruebes, @Carla Méndez." },
  { id: uuid("0f000000", 905), task_id: T, author_user_id: U_NICOLAS, kind: "comment", file_id: F_MEMO_V2, created_at: "2026-10-13T10:15:00Z", body: "@Lucía Pérez en la página 6 citas la sección 1362, pero creo que es la 1361. ¿Lo revisas?" },
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
  { id: uuid("1a000000", 903), task_id: TASK_B603_VOSSLER, requested_by_user_id: U_LUCIA, question: "Lista de condados donde quieres operar en los próximos dos años.", due_date: "2026-10-17", answer: null, status: "open", created_at: "2026-10-06T14:02:00Z", resolved_at: null },
);
meetings.push(
  { id: uuid("1b000000", 901), task_id: T, proposed_by_user_id: U_LUCIA, topic: "Arranque: opciones de estructura societaria", starts_at: "2026-09-10T15:00:00Z", duration_minutes: 45, status: "confirmed" },
  { id: uuid("1b000000", 902), task_id: T, proposed_by_user_id: U_LUCIA, topic: "Repaso de la sección 3 del memo (elección S-Corp)", starts_at: "2026-10-16T15:00:00Z", duration_minutes: 30, status: "proposed" },
);

// Extra meeting the owner proposed to the firm (shows in notifications and calendar).
meetings.push({ id: uuid("1b000000", 903), task_id: TASK_B603_VOSSLER, proposed_by_user_id: U_CARLA, topic: "Licencia CGC y condados donde operar", starts_at: "2026-10-19T16:00:00Z", duration_minutes: 30, status: "proposed" });

/** Stored (event-driven) notifications. Due-date ones are generated from TODAY, not stored. */
export const notifications: { id: string; user_id: string; kind: NotificationKind; task_id: string; actor_user_id: string | null; created_at: string; read: boolean; change?: TaskChange | null }[] = [
  { id: uuid("1f000000", 1), user_id: U_LUCIA, kind: "mentioned", task_id: TASK_B603_VOSSLER, actor_user_id: U_CARLA, created_at: "2026-10-14T13:20:00Z", read: false },
  { id: uuid("1f000000", 2), user_id: U_LUCIA, kind: "meeting_proposed", task_id: TASK_B603_VOSSLER, actor_user_id: U_CARLA, created_at: "2026-10-14T12:05:00Z", read: false },
  { id: uuid("1f000000", 3), user_id: U_LUCIA, kind: "changes_requested", task_id: TASK_B601_PRIME, actor_user_id: U_DANIEL, created_at: "2026-10-13T16:40:00Z", read: false },
  { id: uuid("1f000000", 4), user_id: U_LUCIA, kind: "changes_requested", task_id: TASK_B602_VOSSLER, actor_user_id: U_CARLA, created_at: "2026-10-01T13:42:00Z", read: true },
  { id: uuid("1f000000", 5), user_id: U_LUCIA, kind: "meeting_confirmed", task_id: TASK_B602_VOSSLER, actor_user_id: U_CARLA, created_at: "2026-09-08T14:00:00Z", read: true },
  { id: uuid("1f000000", 6), user_id: U_LUCIA, kind: "unblocked", task_id: TASK_B602_VOSSLER, actor_user_id: null, created_at: "2026-09-05T15:00:00Z", read: true },
];

// Owner side for Vossler: requests from the new firms, a meeting to confirm, and what the owner was notified.
const TASK_B302_VOSSLER = taskId(BIZ_VOSSLER, "B3-02");
const TASK_B303_VOSSLER = taskId(BIZ_VOSSLER, "B3-03");
const TASK_B402_VOSSLER = taskId(BIZ_VOSSLER, "B4-02");
const TASK_B404_VOSSLER = taskId(BIZ_VOSSLER, "B4-04");
const TASK_B513_VOSSLER = taskId(BIZ_VOSSLER, "B5-13");
ownerRequests.push(
  { id: uuid("1a000000", 910), task_id: TASK_B303_VOSSLER, requested_by_user_id: U_RODRIGO, question: "Estados de cuenta bancarios de enero 2024 a septiembre 2026, en PDF.", due_date: "2026-10-17", answer: null, status: "open", created_at: "2026-10-09T15:00:00Z", resolved_at: null },
  { id: uuid("1a000000", 911), task_id: TASK_B402_VOSSLER, requested_by_user_id: U_MARIANA, question: "Exportación de clientes y trabajos de tu sistema actual (Excel o CSV).", due_date: "2026-10-15", answer: null, status: "open", created_at: "2026-10-10T13:30:00Z", resolved_at: null },
);
meetings.push({ id: uuid("1b000000", 910), task_id: TASK_B402_VOSSLER, proposed_by_user_id: U_MARIANA, topic: "Demo del CRM con tus etapas de venta", starts_at: "2026-10-16T18:00:00Z", duration_minutes: 45, status: "proposed" });
notifications.push(
  { id: uuid("1f000000", 20), user_id: U_CARLA, kind: "submitted_for_approval", task_id: TASK_B302_VOSSLER, actor_user_id: U_RODRIGO, created_at: "2026-10-13T20:10:00Z", read: false },
  { id: uuid("1f000000", 21), user_id: U_CARLA, kind: "meeting_proposed", task_id: TASK_B402_VOSSLER, actor_user_id: U_MARIANA, created_at: "2026-10-13T16:00:00Z", read: false },
  { id: uuid("1f000000", 22), user_id: U_CARLA, kind: "submitted_for_approval", task_id: TASK_B404_VOSSLER, actor_user_id: U_MARIANA, created_at: "2026-10-12T19:30:00Z", read: false },
  { id: uuid("1f000000", 23), user_id: U_CARLA, kind: "submitted_for_approval", task_id: TASK_B602_VOSSLER, actor_user_id: U_LUCIA, created_at: "2026-10-12T19:05:00Z", read: true },
  { id: uuid("1f000000", 24), user_id: U_CARLA, kind: "submitted_for_approval", task_id: TASK_B513_VOSSLER, actor_user_id: U_TOMAS, created_at: "2026-10-08T17:00:00Z", read: true },
);

// Sample SM change: Nicolás moved the due date of B4-02 at Vossler; the firm was told.
const SAMPLE_CHANGE: TaskChange = { field: "due_date", from: "2026-10-08", to: "2026-10-15" };
events.push({ id: uuid("1c000000", 990), task_id: TASK_B402_VOSSLER, kind: "due_changed", actor_user_id: U_NICOLAS, version: null, comment_id: null, created_at: "2026-10-06T14:10:00Z", change: SAMPLE_CHANGE });
notifications.push({ id: uuid("1f000000", 990), user_id: U_MARIANA, kind: "task_updated", task_id: TASK_B402_VOSSLER, actor_user_id: U_NICOLAS, created_at: "2026-10-06T14:10:00Z", read: true, change: SAMPLE_CHANGE });
