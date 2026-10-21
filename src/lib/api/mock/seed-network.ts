// Seed for the SM network beyond SM Miami: the Orlando office, the Bimbo Remodelaciones franchise network,
// Business Bishop data and the owner screens (manual, documents, numbers, business).
// Replaceable sample data. Today is 2026-10-14. Money is in USD, dates are ISO.
import catalogJson from "@/data/catalogo_metodo180.json";
import { computeReportAmounts, nextMonth } from "@/lib/franchise/fees";
import { typedSignatureDataUrl } from "@/lib/contracts/signature";
import { addDaysIso, generateProgramTasks, type CatalogEntry } from "../program";
import { MANUAL_SECTION_TITLES, manualSectionContent } from "./seed-manual";
import type {
  AreaCode,
  Business,
  BishopAgreement,
  BusinessDocument,
  BusinessProfile,
  ChecklistItem,
  Contract,
  Franchise,
  FranchiseReport,
  FranchiseTask,
  FinancialSeries,
  ManualEvent,
  ManualSection,
  ManualVersion,
  Organization,
  RecoveryPoint,
  SupportTicket,
  Task,
  TaskEvent,
  TaskVersion,
  TeamMember,
  User,
} from "../types";
import {
  BIZ_BIMBO,
  BIZ_ENYERMY,
  BIZ_PRIME,
  BIZ_VOSSLER,
  ORG_GLOBAL,
  U_MARYLIN,
  U_ANA_VOSSLER,
  U_CARLA,
  U_DANIEL,
  U_ENYERMY,
  U_RODRIGO_BIMBO,
  businesses as miamiBusinesses,
} from "./seed";
import { at, blocks, buildLeads, uuid, type LeadSpec } from "./seed-leads";

// ---------- Ids ----------
export const ORG_ORLANDO = uuid("0a000000", 11);
export const ORG_ORL_ESTRATEGIA = uuid("0a000000", 12);
export const ORG_ORL_OPERACIONES = uuid("0a000000", 13);
export const ORG_ORL_FINANZAS = uuid("0a000000", 14);
export const ORG_ORL_TECNOLOGIA = uuid("0a000000", 15);
export const ORG_ORL_MARKETING = uuid("0a000000", 16);
export const ORG_ORL_LEGAL = uuid("0a000000", 17);
/** SM Tampa: an office in opening that already has everything its checklist asks for and waits for SM Global to activate it. */
export const ORG_TAMPA = uuid("0a000000", 30);
const TAMPA_FIRM_IDS: Record<AreaCode, string> = {
  B1: uuid("0a000000", 31), B2: uuid("0a000000", 32), B3: uuid("0a000000", 33), B4: uuid("0a000000", 34), B5: uuid("0a000000", 35), B6: uuid("0a000000", 36),
};
export const U_TAMPA_MANAGER = uuid("0c000000", 60);
/** A franchise unit is an Organization too: Franchise.id === its organization id. */
export const FRANCHISE_ORLANDO_SUR = uuid("0a000000", 20);
export const FRANCHISE_TAMPA = uuid("0a000000", 21);

export const BIZ_SUNSHINE = uuid("0b000000", 11);
export const BIZ_CASA_LIMPIA = uuid("0b000000", 12);

export const U_VALENTINA = uuid("0c000000", 45);
export const U_OSCAR = uuid("0c000000", 46);
export const U_MARTA = uuid("0c000000", 47);
export const U_JEFFERSON = uuid("0c000000", 40);
/** More sample Bishops: Laura signed the framework agreement, Diego not yet. */
export const U_LAURA = uuid("0c000000", 91);
export const U_DIEGO = uuid("0c000000", 92);
export const U_LUISA = uuid("0c000000", 41);
export const U_MARCO = uuid("0c000000", 42);
const U_ORL_ESTRATEGIA = uuid("0c000000", 50);
const U_ORL_OPERACIONES = uuid("0c000000", 51);
const U_ORL_FINANZAS = uuid("0c000000", 52);
const U_ORL_TECNOLOGIA = uuid("0c000000", 53);
const U_ORL_MARKETING = uuid("0c000000", 54);
export const U_ORL_LEGAL = uuid("0c000000", 55);


// ---------- SM Orlando: office, firms, people ----------
export const organizations: Organization[] = [
  { id: ORG_ORLANDO, name: "SM Orlando", kind: "sm", area: null, specialty: null, city: "Orlando, FL", email: "orlando@strategicmates.com", phone: null, default_booking_url: "https://strategicmates.com/orlando", parent_id: ORG_GLOBAL, status: "operating", opened_at: "2026-05-18", manager_user_id: U_VALENTINA },
  { id: ORG_ORL_ESTRATEGIA, name: "Meridian Estrategia", kind: "partner_firm", area: "B1", specialty: "Modelo de negocio replicable, plan a cinco años y territorios", city: "Orlando, FL", email: "hola@meridianestrategia.com", phone: "+1 407 555 0201", parent_id: ORG_ORLANDO },
  { id: ORG_ORL_OPERACIONES, name: "Proceso Pro", kind: "partner_firm", area: "B2", specialty: "Procesos, manuales operativos y capacitación del equipo", city: "Orlando, FL", email: "equipo@procesopro.co", phone: "+1 407 555 0202", parent_id: ORG_ORLANDO },
  { id: ORG_ORL_FINANZAS, name: "Contadores del Sol", kind: "partner_firm", area: "B3", specialty: "Contabilidad, modelos financieros y cumplimiento fiscal en Florida", city: "Winter Park, FL", email: "hola@contadoresdelsol.com", phone: "+1 407 555 0203", parent_id: ORG_ORLANDO },
  { id: ORG_ORL_TECNOLOGIA, name: "Nube Latina", kind: "partner_firm", area: "B4", specialty: "CRM, respaldos y tableros para negocios de servicios", city: "Orlando, FL", email: "soporte@nubelatina.io", phone: "+1 407 555 0204", parent_id: ORG_ORLANDO },
  { id: ORG_ORL_MARKETING, name: "Faro Marketing", kind: "partner_firm", area: "B5", specialty: "Marca, sitios web y posicionamiento local", city: "Kissimmee, FL", email: "hola@faromarketing.com", phone: "+1 407 555 0205", parent_id: ORG_ORLANDO },
  { id: ORG_ORL_LEGAL, name: "Bufete Ramos", kind: "partner_firm", area: "B6", specialty: "Contratos, licencias y propiedad intelectual para franquicias", city: "Orlando, FL", email: "contacto@bufeteramos.legal", phone: "+1 407 555 0206", parent_id: ORG_ORLANDO },
  { id: FRANCHISE_ORLANDO_SUR, name: "Bimbo Remodelaciones Orlando Sur", kind: "franchise", area: null, specialty: null, city: "Orlando, FL", email: "orlandosur@bimboremodelaciones.com", phone: "+1 407 555 0310", franchisor_business_id: BIZ_BIMBO },
  { id: FRANCHISE_TAMPA, name: "Bimbo Remodelaciones Tampa", kind: "franchise", area: null, specialty: null, city: "Tampa, FL", email: "tampa@bimboremodelaciones.com", phone: "+1 813 555 0311", franchisor_business_id: BIZ_BIMBO },
  { id: ORG_TAMPA, name: "SM Tampa", kind: "sm", area: null, specialty: null, city: "Tampa, FL", email: "tampa@strategicmates.com", phone: null, default_booking_url: "https://strategicmates.com/tampa", parent_id: ORG_GLOBAL, status: "opening", opened_at: "2026-11-02", manager_user_id: U_TAMPA_MANAGER },
  { id: TAMPA_FIRM_IDS.B1, name: "Bahía Estrategia", kind: "partner_firm", area: "B1", specialty: "Modelo de negocio replicable, plan a cinco años y territorios", city: "Tampa, FL", email: "hola@bahiaestrategia.com", phone: "+1 813 555 0401", parent_id: ORG_TAMPA },
  { id: TAMPA_FIRM_IDS.B2, name: "Flujo Operaciones", kind: "partner_firm", area: "B2", specialty: "Procesos, manuales operativos y capacitación del equipo", city: "Tampa, FL", email: "equipo@flujooperaciones.com", phone: "+1 813 555 0402", parent_id: ORG_TAMPA },
  { id: TAMPA_FIRM_IDS.B3, name: "Cifra Contadores", kind: "partner_firm", area: "B3", specialty: "Contabilidad, modelos financieros y cumplimiento fiscal en Florida", city: "Tampa, FL", email: "hola@cifracontadores.com", phone: "+1 813 555 0403", parent_id: ORG_TAMPA },
  { id: TAMPA_FIRM_IDS.B4, name: "Red Digital Tampa", kind: "partner_firm", area: "B4", specialty: "CRM, respaldos y tableros para negocios de servicios", city: "Tampa, FL", email: "soporte@reddigitaltampa.com", phone: "+1 813 555 0404", parent_id: ORG_TAMPA },
  { id: TAMPA_FIRM_IDS.B5, name: "Costa Marketing", kind: "partner_firm", area: "B5", specialty: "Marca, sitios web y posicionamiento local", city: "Tampa, FL", email: "hola@costamarketing.com", phone: "+1 813 555 0405", parent_id: ORG_TAMPA },
  { id: TAMPA_FIRM_IDS.B6, name: "Estudio Legal Ybor", kind: "partner_firm", area: "B6", specialty: "Contratos, licencias y propiedad intelectual para franquicias", city: "Tampa, FL", email: "contacto@estudioybor.legal", phone: "+1 813 555 0406", parent_id: ORG_TAMPA },
];

const person = (id: string, name: string, email: string, role: User["role"], organization_id: string | null, business_id: string | null, title: string | null, is_admin = false): User => ({
  id, full_name: name, email, role, organization_id, business_id, title, google_calendar_email: null, booking_url: null, is_admin, status: "active",
});

// Office managers and the partner of each firm are admins of their organization; owners are admins of their business.
export const users: User[] = [
  person(U_VALENTINA, "Valentina Ríos", "valentina@strategicmates.com", "sm_team", ORG_ORLANDO, null, "Consultora y directora de la oficina", true),
  person(U_OSCAR, "Óscar Medina", "oscar@sunshineroofing.com", "business_owner", null, BIZ_SUNSHINE, null, true),
  person(U_MARTA, "Marta Quintero", "marta@casalimpiaorlando.com", "business_owner", null, BIZ_CASA_LIMPIA, null, true),
  person(U_ORL_ESTRATEGIA, "Paola Giraldo", "paola@meridianestrategia.com", "partner_firm", ORG_ORL_ESTRATEGIA, null, "Socia", true),
  person(U_ORL_OPERACIONES, "Iván Cortés", "ivan@procesopro.co", "partner_firm", ORG_ORL_OPERACIONES, null, "Consultor de operaciones", true),
  person(U_ORL_FINANZAS, "Beatriz Núñez", "beatriz@contadoresdelsol.com", "partner_firm", ORG_ORL_FINANZAS, null, "Contadora socia", true),
  person(U_ORL_TECNOLOGIA, "Esteban Cardona", "esteban@nubelatina.io", "partner_firm", ORG_ORL_TECNOLOGIA, null, "Líder de implementación", true),
  person(U_ORL_MARKETING, "Diana Prieto", "diana@faromarketing.com", "partner_firm", ORG_ORL_MARKETING, null, "Directora de cuentas", true),
  person(U_ORL_LEGAL, "Héctor Ramos", "hector@bufeteramos.legal", "partner_firm", ORG_ORL_LEGAL, null, "Abogado socio", true),
  person(U_JEFFERSON, "Jefferson Paula", "jefferson@paulainvestments.com", "bishop", null, null, "Business Bishop"),
  person(U_LAURA, "Laura Ortega", "laura@ortegacapital.com", "bishop", null, null, "Business Bishop"),
  person(U_DIEGO, "Diego Rivas", "diego@rivasholdings.com", "bishop", null, null, "Business Bishop"),
  person(U_LUISA, "Luisa Paredes", "luisa@bimboremodelaciones.com", "franchisee", FRANCHISE_ORLANDO_SUR, null, "Dueña de la franquicia", true),
  person(U_MARCO, "Marco Ibáñez", "marco@bimboremodelaciones.com", "franchisee", FRANCHISE_TAMPA, null, "Dueño de la franquicia", true),
  person(U_TAMPA_MANAGER, "Natalia Escobar", "natalia@strategicmates.com", "sm_team", ORG_TAMPA, null, "Consultora y directora de la oficina", true),
];

export const businesses: Business[] = [
  { id: BIZ_SUNSHINE, name: "Sunshine Roofing", industry: "Techos y remodelaciones", city: "Orlando", state: "FL", owner_user_id: U_OSCAR, status: "in_program", program_start_date: "2026-07-06", program_day: 101, office_id: ORG_ORLANDO, consultant_id: U_VALENTINA },
  { id: BIZ_CASA_LIMPIA, name: "Casa Limpia Orlando", industry: "Limpieza de casas y oficinas", city: "Orlando", state: "FL", owner_user_id: U_MARTA, status: "in_program", program_start_date: "2026-09-21", program_day: 24, office_id: ORG_ORLANDO, consultant_id: U_VALENTINA },
];

// ---------- Orlando: tasks generated from the catalog ----------
const orlandoFirmFor = (area: AreaCode) =>
  ({
    B1: { organization_id: ORG_ORL_ESTRATEGIA, assignee_user_id: U_ORL_ESTRATEGIA },
    B2: { organization_id: ORG_ORL_OPERACIONES, assignee_user_id: U_ORL_OPERACIONES },
    B3: { organization_id: ORG_ORL_FINANZAS, assignee_user_id: U_ORL_FINANZAS },
    B4: { organization_id: ORG_ORL_TECNOLOGIA, assignee_user_id: U_ORL_TECNOLOGIA },
    B5: { organization_id: ORG_ORL_MARKETING, assignee_user_id: U_ORL_MARKETING },
    B6: { organization_id: ORG_ORL_LEGAL, assignee_user_id: U_ORL_LEGAL },
  })[area];

/**
 * Statuses by program day: a task that ended more than two days ago is approved, unless it is listed in `late`
 * (still in progress, so overdue); one that is running today is in progress; the rest has not started.
 */
function advance(list: Task[], today: string, late: string[]): Task[] {
  return list.map((t) => {
    const finished = t.due_date < addDaysIso(today, -2) && !late.includes(t.code);
    const running = t.start_date <= today && !finished;
    const status: Task["status"] = finished ? "accepted" : running ? "in_progress" : "pending";
    return { ...t, status, current_version: finished ? 1 : 0, updated_at: `${t.start_date}T14:00:00Z` };
  });
}

const generateFor = (b: Business, industry: "remodeling" | "cleaning", prefix: string, late: string[]) => {
  let n = 0;
  return advance(
    generateProgramTasks(catalogJson as CatalogEntry[], {
      business_id: b.id, industry, start_date: b.program_start_date, supervisor_user_id: U_VALENTINA,
      firmFor: orlandoFirmFor, newId: () => uuid(prefix, ++n), now: `${b.program_start_date}T13:00:00Z`,
    }),
    "2026-10-14",
    late,
  );
};

export const tasks: Task[] = [
  // Sunshine Roofing (day 101): finance and legal are late, which makes them network bottlenecks.
  ...generateFor(businesses[0]!, "remodeling", "0d200000", ["B3-01", "B6-01", "B2-01"]),
  ...generateFor(businesses[1]!, "cleaning", "0d300000", []),
];

/** Minimal history for Orlando tasks that already have a deliverable: submitted, then approved by the owner. */
export const versions: TaskVersion[] = [];
export const events: TaskEvent[] = [];
{
  let n = 0;
  const id = (prefix: string) => uuid(prefix, ++n);
  for (const t of tasks) {
    const owner = businesses.find((b) => b.id === t.business_id)!.owner_user_id;
    events.push({ id: id("2c000000"), task_id: t.id, kind: "assigned", actor_user_id: U_VALENTINA, version: null, comment_id: null, created_at: at(t.start_date, "13:00:00") });
    if (t.status === "pending") continue;
    events.push({ id: id("2c000000"), task_id: t.id, kind: "started", actor_user_id: t.assignee_user_id, version: null, comment_id: null, created_at: at(addDaysIso(t.start_date, 1), "14:30:00") });
    if (t.current_version < 1) continue;
    const submitted = addDaysIso(t.due_date, -3);
    versions.push({
      id: id("2e000000"), task_id: t.id, version: 1, submitted_by_user_id: t.assignee_user_id, submitted_at: at(submitted, "18:00:00"),
      note: "Primera versión para revisar.", files: [{ id: id("2d000000"), name: `${t.code}_v1.pdf`, size_kb: 540 }], status: "accepted", review_comment_id: null,
    });
    events.push({ id: id("2c000000"), task_id: t.id, kind: "submitted", actor_user_id: t.assignee_user_id, version: 1, comment_id: null, created_at: at(submitted, "18:00:00") });
    events.push({ id: id("2c000000"), task_id: t.id, kind: "approved", actor_user_id: owner, version: 1, comment_id: null, created_at: at(addDaysIso(submitted, 1), "12:00:00") });
  }
}

// ---------- Orlando: leads ----------
const orlandoSpecs: LeadSpec[] = [
  {
    path: [["submitted", "2026-06-10"], ["meeting", "2026-06-12"], ["documents", "2026-06-20"], ["accepted", "2026-06-27"], ["in_program", "2026-07-06"]],
    lead: {
      consultant_user_id: U_VALENTINA, business_id: BIZ_SUNSHINE,
      contact: { name: "Óscar Medina", email: "oscar@sunshineroofing.com", phone: "+1 407 555 0231", city: "Orlando", state: "FL", hispanic_owner: "yes" },
      business: { name: "Sunshine Roofing", industry: "remodeling", activity: "Techos y remodelaciones", revenue_range: "1m_2m", margin_range: "margin_21_40", team_range: "team_20_plus", years_range: "years_10_plus", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 82, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"), strengths: ["Más de diez años con clientes que repiten", "Cuadrillas con método propio"], priorities: ["Números por obra", "Contratos y licencias"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-08-27"], ["meeting", "2026-08-31"], ["documents", "2026-09-08"], ["accepted", "2026-09-14"], ["in_program", "2026-09-21"]],
    lead: {
      consultant_user_id: U_VALENTINA, business_id: BIZ_CASA_LIMPIA,
      contact: { name: "Marta Quintero", email: "marta@casalimpiaorlando.com", phone: "+1 407 555 0232", city: "Orlando", state: "FL", hispanic_owner: "yes" },
      business: { name: "Casa Limpia Orlando", industry: "cleaning", activity: "Limpieza de casas y oficinas", revenue_range: "750k_1m", margin_range: "margin_0_20", team_range: "team_11_20", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 67, eligible_program: true, eligibility_gaps: [], blocks: blocks("msmmmwm"), strengths: ["Lista de revisión de 40 puntos en cada limpieza", "Contratos mensuales con oficinas"], priorities: ["Margen por servicio", "Sistema de citas"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-12"]],
    lead: {
      consultant_user_id: U_VALENTINA, business_id: null,
      contact: { name: "Rafael Delgado", email: "rafael@pinturasdelvalle.com", phone: "+1 407 555 0241", city: "Winter Park", state: "FL", hispanic_owner: "yes" },
      business: { name: "Pinturas del Valle", industry: "construction", activity: "Pintura residencial y comercial", revenue_range: "500k_750k", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 69, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmmwsmm"), strengths: ["Acabados que el cliente reconoce", "Equipo estable"], priorities: ["Procesos escritos", "Presupuestos por obra"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-03"], ["meeting", "2026-10-07"]],
    contacted: true,
    notes: [["2026-10-07", "Quiere saber si puede seguir atendiendo las obras de sus dos talleres durante el programa."]],
    lead: {
      consultant_user_id: U_VALENTINA, business_id: null,
      contact: { name: "Yolanda Ortiz", email: "yolanda@ortizcarpinteria.com", phone: "+1 407 555 0242", city: "Orlando", state: "FL", hispanic_owner: "yes" },
      // A branch outside the five named ones: the assessment sends other_related with the owner's own words.
      business: { name: "Ortiz Carpintería", industry: "other_related", activity_other: "Carpintería y gabinetes a medida", activity: "Carpintería, gabinetes y clósets a medida", revenue_range: "1m_2m", margin_range: "margin_0_20", team_range: "team_20_plus", years_range: "years_10_plus", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 80, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"), strengths: ["Medidas y cortes con plantilla propia", "Dos talleres con el mismo catálogo de muebles"], priorities: ["Manual de operaciones", "Costos por proyecto"] },
      know_how_example: "Cada gabinete se arma siempre con la misma secuencia de seis pasos y plantillas de corte propias, así sale igual en los dos talleres.",
    },
  },
  {
    path: [["submitted", "2026-09-22"], ["meeting", "2026-09-25"], ["documents", "2026-10-02"], ["accepted", "2026-10-09"]],
    contacted: true,
    notes: [["2026-10-09", "Contrato enviado. Lo está revisando con su contador."]],
    lead: {
      consultant_user_id: U_VALENTINA, business_id: null,
      contact: { name: "Camilo Arango", email: "camilo@premierclean.com", phone: "+1 407 555 0243", city: "Kissimmee", state: "FL", hispanic_owner: "yes" },
      business: { name: "Limpieza Premier FL", industry: "cleaning", activity: "Limpieza de oficinas y áreas comunes", revenue_range: "750k_1m", margin_range: "margin_21_40", team_range: "team_20_plus", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 69, eligible_program: true, eligibility_gaps: [], blocks: blocks("smmmmsm"), strengths: ["Contratos recurrentes", "Procesos de limpieza escritos"], priorities: ["Contratos y seguros", "Tablero de calidad"] },
      know_how_example: null,
    },
  },
];
const orlandoLeads = buildLeads(orlandoSpecs, { office_id: ORG_ORLANDO, lead_prefix: "2e100000", event_prefix: "2f000000" });

// SM Tampa already received its first lead, which completes the last item of its opening checklist.
const tampaSpecs: LeadSpec[] = [
  {
    path: [["submitted", "2026-10-10"]],
    lead: {
      consultant_user_id: U_TAMPA_MANAGER, business_id: null,
      contact: { name: "Mariana Soler", email: "mariana@jardinessoler.com", phone: "+1 813 555 0421", city: "Tampa", state: "FL", hispanic_owner: "yes" },
      business: { name: "Jardines Soler", industry: "construction", activity: "Jardinería y paisajismo residencial", revenue_range: "500k_750k", margin_range: "margin_21_40", team_range: "team_11_20", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 68, eligible_program: true, eligibility_gaps: [], blocks: blocks("smmmsmm"), strengths: ["Clientes con contrato anual", "Cuadrillas con ruta fija"], priorities: ["Procesos escritos", "Precios por servicio"] },
      know_how_example: null,
    },
  },
];
const tampaLeads = buildLeads(tampaSpecs, { office_id: ORG_TAMPA, lead_prefix: "2e200000", event_prefix: "2f100000" });
export const leads = [...orlandoLeads.leads, ...tampaLeads.leads];
export const leadEvents = [...orlandoLeads.leadEvents, ...tampaLeads.leadEvents];

// ---------- Bimbo Remodelaciones franchise network ----------
export const franchises: Franchise[] = [
  { id: FRANCHISE_ORLANDO_SUR, franchisor_business_id: BIZ_BIMBO, name: "Bimbo Remodelaciones Orlando Sur", franchisee_user_id: U_LUISA, city: "Orlando", state: "FL", status: "operating", opening_date: "2026-04-15", manual_version: "v1.3" },
  { id: FRANCHISE_TAMPA, franchisor_business_id: BIZ_BIMBO, name: "Bimbo Remodelaciones Tampa", franchisee_user_id: U_MARCO, city: "Tampa", state: "FL", status: "opening", opening_date: "2026-11-20", manual_version: "v1.3" },
];

/** Monthly gross sales of Orlando Sur. Fees are computed from them, never typed. */
const ORLANDO_SUR_SALES: [string, number][] = [["2026-05", 61000], ["2026-06", 68000], ["2026-07", 72000], ["2026-08", 70500], ["2026-09", 75200]];

export const franchiseReports: FranchiseReport[] = [
  ...ORLANDO_SUR_SALES.map(([month, sales], i): FranchiseReport => {
    const due = `${nextMonth(month)}-05`;
    const submitted = `${nextMonth(month)}-03T15:00:00Z`;
    return {
      id: uuid("3d000000", i + 1), franchise_id: FRANCHISE_ORLANDO_SUR, month, due_date: due, status: "paid", gross_sales: sales,
      ...computeReportAmounts(sales), submitted_at: submitted, paid_at: `${nextMonth(month)}-10`,
    };
  }),
  // October: nothing submitted yet, due on November 5.
  { id: uuid("3d000000", 6), franchise_id: FRANCHISE_ORLANDO_SUR, month: "2026-10", due_date: "2026-11-05", status: "due", gross_sales: null, royalty_amount: null, marketing_fund_amount: null, total_due: null, submitted_at: null, paid_at: null },
];

const check = (franchise_id: string, kind: ChecklistItem["kind"], items: [string, boolean][], n0: number): ChecklistItem[] =>
  items.map(([item, ok], i) => ({ id: uuid("3e000000", n0 + i), franchise_id, kind, item, ok }));

export const checklist: ChecklistItem[] = [
  ...check(FRANCHISE_ORLANDO_SUR, "standard", [
    ["Obras según el manual", true], ["Uniforme y presentación", true], ["Obra limpia y ordenada al final de cada día", true], ["Presupuestos entregados en menos de 48 horas", false],
    ["Señalética de marca en camionetas y carteles de obra", true], ["Registro fotográfico diario de cada obra", false], ["Atención al cliente según protocolo", true], ["Control de inventario semanal", true],
  ], 1),
  ...check(FRANCHISE_TAMPA, "opening", [
    ["Contrato de franquicia firmado", true], ["Oficina y depósito aprobados por SM", true], ["Licencia de contratista del condado", true],
    ["Camioneta y herramientas equipadas", false], ["Capacitación del equipo (40 h)", false], ["Auditoría de apertura", false],
  ], 20),
];

export const tickets: SupportTicket[] = [
  { id: uuid("3f000000", 118), code: "T-118", franchise_id: FRANCHISE_ORLANDO_SUR, subject: "Proveedor de cerámica sin stock", body: "El proveedor nuevo no entregó esta semana. Tenemos cerámica para dos obras. ¿Hay otro proveedor aprobado?", state: "open", created_by_user_id: U_LUISA, created_at: "2026-10-07T14:10:00Z", response: null },
  { id: uuid("3f000000", 112), code: "T-112", franchise_id: FRANCHISE_ORLANDO_SUR, subject: "Duda sobre promoción de octubre", body: "¿La promoción de octubre aplica también a los pedidos que llegan por plataformas de terceros?", state: "answered", created_by_user_id: U_LUISA, created_at: "2026-10-02T16:40:00Z", response: "Aplica solo a los pedidos por teléfono y por la web propia. En plataformas de terceros no se ofrece." },
  { id: uuid("3f000000", 104), code: "T-104", franchise_id: FRANCHISE_ORLANDO_SUR, subject: "Falla en el sistema de presupuestos", body: "El sistema dejó de generar los presupuestos en PDF desde la mañana.", state: "closed", created_by_user_id: U_LUISA, created_at: "2026-09-21T13:05:00Z", response: "Cierra sesión y actualiza la plantilla de presupuestos. Quedó resuelto con soporte de TecnoPyme." },
  { id: uuid("3f000000", 120), code: "T-120", franchise_id: FRANCHISE_TAMPA, subject: "Planos tipo para la licencia del condado", body: "Necesito los planos tipo de una remodelación de baño para presentarlos con la licencia del condado.", state: "open", created_by_user_id: U_MARCO, created_at: "2026-10-08T15:30:00Z", response: null },
];

export const franchiseTasks: FranchiseTask[] = [
  { id: uuid("4a000000", 1), franchise_id: FRANCHISE_ORLANDO_SUR, kind: "report", title: "Enviar el reporte de ventas de octubre", due_date: "2026-11-05", done: false },
  { id: uuid("4a000000", 2), franchise_id: FRANCHISE_ORLANDO_SUR, kind: "audit", title: "Preparar la auditoría de estándares del 22 de octubre", due_date: "2026-10-22", done: false },
  { id: uuid("4a000000", 3), franchise_id: FRANCHISE_ORLANDO_SUR, kind: "manual_read", title: "Leer el manual v1.3, sección Compras (cambió el 28 de septiembre)", due_date: "2026-10-15", done: false },
  { id: uuid("4a000000", 4), franchise_id: FRANCHISE_TAMPA, kind: "other", title: "Entregar los planos tipo para la licencia del condado", due_date: "2026-10-30", done: false },
  { id: uuid("4a000000", 5), franchise_id: FRANCHISE_TAMPA, kind: "other", title: "Completar la capacitación del equipo (40 h)", due_date: "2026-11-13", done: false },
];

// ---------- Manual ----------
const SECTION_TITLES = MANUAL_SECTION_TITLES;

const sections = (businessId: string, prefix: string, rows: [number, ManualSection["status"], string | null][]): ManualSection[] =>
  rows.map(([pct, status, published_in], i) => ({
    id: uuid(prefix, i + 1), business_id: businessId, title: SECTION_TITLES[i]!, pct, status, updated_at: status === "not_started" ? "2026-10-09" : "2026-10-06", published_in,
    ...manualSectionContent(SECTION_TITLES[i]!, status),
  }));

export const manualSections: ManualSection[] = [
  ...sections(BIZ_VOSSLER, "5a000000", [[80, "approved", null], [55, "in_review", null], [30, "drafting", null], [65, "in_review", null], [45, "drafting", null], [20, "drafting", null]]),
  ...sections(BIZ_PRIME, "5b000000", [[20, "drafting", null], [14, "drafting", null], [8, "drafting", null], [16, "drafting", null], [11, "drafting", null], [5, "drafting", null]]),
  ...sections(BIZ_ENYERMY, "5c000000", [[5, "drafting", null], [0, "not_started", null], [0, "not_started", null], [0, "not_started", null], [0, "not_started", null], [0, "not_started", null]]),
  ...sections(BIZ_BIMBO, "5d000000", [[100, "approved", "v1.0"], [100, "approved", "v1.1"], [100, "approved", "v1.3"], [100, "approved", "v1.2"], [100, "approved", "v1.0"], [100, "approved", "v1.0"]]),
  ...sections(BIZ_SUNSHINE, "5e000000", [[90, "approved", null], [70, "in_review", null], [60, "in_review", null], [55, "drafting", null], [40, "drafting", null], [30, "drafting", null]]),
  ...sections(BIZ_CASA_LIMPIA, "5f000000", [[10, "drafting", null], [5, "drafting", null], [0, "not_started", null], [0, "not_started", null], [0, "not_started", null], [0, "not_started", null]]),
];

export const manualVersions: ManualVersion[] = [
  { id: uuid("6a000000", 4), business_id: BIZ_BIMBO, version: "v1.3", published_at: "2026-09-28", note: "Compras: nuevo proveedor de cerámica y control de inventario semanal", published_by_user_id: U_RODRIGO_BIMBO, section_titles: ["Compras"] },
  { id: uuid("6a000000", 3), business_id: BIZ_BIMBO, version: "v1.2", published_at: "2026-07-10", note: "Atención al cliente: protocolo de reclamos", published_by_user_id: U_RODRIGO_BIMBO, section_titles: ["Atención al cliente"] },
  { id: uuid("6a000000", 2), business_id: BIZ_BIMBO, version: "v1.1", published_at: "2026-05-20", note: "Operación: plazos de presupuesto y registro fotográfico de obra", published_by_user_id: U_RODRIGO_BIMBO, section_titles: ["Operación"] },
  { id: uuid("6a000000", 1), business_id: BIZ_BIMBO, version: "v1.0", published_at: "2026-04-01", note: "Primera versión entregada a Orlando Sur", published_by_user_id: U_RODRIGO_BIMBO, section_titles: [...SECTION_TITLES] },
];

/** Every section that is approved in the seed has its approval in the activity, signed by the business owner. */
export const manualEvents: ManualEvent[] = manualSections
  .filter((s) => s.status === "approved")
  .map((s, i): ManualEvent => ({
    id: uuid("5e100000", i + 1), business_id: s.business_id, section_id: s.id, section_title: s.title, kind: "approved",
    actor_user_id: [...miamiBusinesses, ...businesses].find((b) => b.id === s.business_id)!.owner_user_id, created_at: at(s.updated_at, "12:00:00"),
  }));

// ---------- Documents and contracts ----------
const doc = (n: number, business_id: string, area: BusinessDocument["area"], name: string, state: BusinessDocument["state"], requested_at: string, received_at: string | null): BusinessDocument => ({
  id: uuid("7a000000", n), business_id, area, name, state, requested_at, received_at, file_name: received_at ? `${name.replace(/\s+/g, "_")}.pdf` : null,
});

export const documents: BusinessDocument[] = [
  doc(1, BIZ_VOSSLER, "B3", "Estados financieros 2025", "reviewed", "2026-07-28", "2026-08-02"),
  doc(2, BIZ_VOSSLER, "B6", "Licencia de contratista FL", "reviewed", "2026-07-28", "2026-08-03"),
  doc(3, BIZ_VOSSLER, "B2", "Contratos con proveedores", "received", "2026-09-10", "2026-09-18"),
  doc(4, BIZ_VOSSLER, "B3", "Estados de cuenta de agosto", "requested", "2026-09-20", null),
  doc(5, BIZ_VOSSLER, "B6", "Póliza de seguro general", "requested", "2026-10-01", null),
  doc(6, BIZ_PRIME, "B6", "Licencia de contratista", "requested", "2026-09-23", null),
  doc(7, BIZ_BIMBO, "closing", "Documento de divulgación a franquiciados (FDD)", "reviewed", "2025-08-01", "2025-08-20"),
  doc(8, BIZ_BIMBO, "B6", "Registro de la marca Bimbo Remodelaciones", "reviewed", "2025-04-10", "2025-04-28"),
  doc(9, BIZ_SUNSHINE, "B6", "Licencia de techista del condado de Orange", "received", "2026-07-08", "2026-07-15"),
  doc(10, BIZ_CASA_LIMPIA, "B3", "Estados de cuenta de los últimos 12 meses", "requested", "2026-09-22", null),
];

const signer = (name: string, role: string, signed_at: string | null) => ({ name, role, signed_at });
const contract = (n: number, business_id: string, area: Contract["area"], name: string, state: Contract["state"], sent_at: string | null, signed_at: string | null, signers: Contract["signers"]): Contract => ({
  id: uuid("7b000000", n), business_id, area, name, state, sent_at, signed_at, signers,
});

export const contracts: Contract[] = [
  contract(1, BIZ_VOSSLER, "diagnosis", "NDA", "signed", "2026-07-17", "2026-07-20", [signer("Carla Méndez", "Dueña", "2026-07-20"), signer("SM Miami", "SM", "2026-07-20")]),
  contract(2, BIZ_VOSSLER, "diagnosis", "MOU del programa de 180 días", "signed", "2026-07-24", "2026-08-02", [signer("Carla Méndez", "Dueña", "2026-08-02"), signer("SM Miami", "SM", "2026-07-30")]),
  contract(3, BIZ_VOSSLER, "B6", "NDA del equipo clave", "sent", "2026-09-29", null, [signer("Ana Vossler", "Administración", null), signer("Luis Prado", "Jefe de obra", null), signer("SM Miami", "SM", "2026-09-29")]),
  contract(4, BIZ_VOSSLER, "closing", "Acuerdo con Business Bishop", "draft", null, null, [signer("Carla Méndez", "Dueña", null), signer("Business Bishop", "Inversionista", null), signer("SM Miami", "SM", null)]),
  contract(5, BIZ_PRIME, "diagnosis", "MOU del programa de 180 días", "opened", "2026-09-08", null, [signer("Daniel Ortiz", "Dueño", null), signer("SM Miami", "SM", "2026-09-08")]),
  contract(6, BIZ_BIMBO, "diagnosis", "MOU del programa de 180 días", "signed", "2025-02-25", "2025-03-02", [signer("Rodrigo Bimbo", "Dueño", "2025-03-02"), signer("SM Miami", "SM", "2025-02-28")]),
  contract(7, BIZ_BIMBO, "closing", "Acuerdo de participación con Jefferson Paula", "signed", "2025-11-10", "2025-11-14", [signer("Rodrigo Bimbo", "Dueño", "2025-11-12"), signer("Jefferson Paula", "Business Bishop", "2025-11-14"), signer("SM Miami", "SM", "2025-11-10")]),
  contract(8, BIZ_BIMBO, "closing", "Contrato de franquicia: Orlando Sur", "signed", "2026-02-14", "2026-02-20", [signer("Rodrigo Bimbo", "Franquiciador", "2026-02-14"), signer("Luisa Paredes", "Franquiciada", "2026-02-20")]),
  contract(9, BIZ_BIMBO, "closing", "Contrato de franquicia: Tampa", "signed", "2026-09-08", "2026-09-14", [signer("Rodrigo Bimbo", "Franquiciador", "2026-09-08"), signer("Marco Ibáñez", "Franquiciado", "2026-09-14")]),
  contract(10, BIZ_SUNSHINE, "diagnosis", "MOU del programa de 180 días", "signed", "2026-06-27", "2026-07-06", [signer("Óscar Medina", "Dueño", "2026-07-06"), signer("SM Orlando", "SM", "2026-06-30")]),
];

// ---------- Financials (owner "Mis números") ----------
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const septemberRoyalty = computeReportAmounts(75200).royalty_amount;

export const financials: FinancialSeries[] = [
  {
    business_id: BIZ_BIMBO, months: MONTHS, revenue: [98000, 104000, 109000, 112000, 118000], margin_pct: [18, 19, 19, 21, 22], cash: [84000, 91000, 97000, 103000, 112000],
    changes: [
      { metric: "Margen neto", before: "9%", now: "22%" },
      { metric: "Cuadrillas propias", before: "1", now: "2" },
      { metric: "Franquicias", before: "0", now: "1 operando y 1 en apertura" },
      { metric: "Regalías cobradas en septiembre", before: usd(0), now: usd(septemberRoyalty) },
      { metric: "Horas semanales del dueño en obra", before: "60", now: "12" },
    ],
  },
  {
    business_id: BIZ_VOSSLER, months: MONTHS, revenue: [142000, 151000, 148000, 163000, 171000], margin_pct: [11, 12, 12, 14, 16], cash: [38000, 41000, 36000, 52000, 61000],
    changes: [
      { metric: "Margen neto", before: "11%", now: "16%" },
      { metric: "Cuentas separadas", before: "No", now: "Sí" },
      { metric: "Días de cobro", before: "54", now: "38" },
      { metric: "Horas semanales del dueño en obra", before: "52", now: "34" },
      { metric: "Procesos documentados", before: "0 de 6", now: "2 de 6" },
    ],
  },
];

// ---------- Business profile and team ----------
export const profiles: BusinessProfile[] = [
  { business_id: BIZ_VOSSLER, legal_name: "Vossler Construction LLC", industry: "Construcción residencial", address: "4821 Curry Ford Rd", city: "Orlando", state: "FL", phone: "+1 407 555 0110", email: "carla@vossler.com", website: "https://vosslerbuild.com", years_operating: 11, employees: 14 },
  { business_id: BIZ_PRIME, legal_name: "Prime 10 Solutions Inc.", industry: "Remodelaciones", address: "2210 W Kennedy Blvd", city: "Tampa", state: "FL", phone: "+1 813 555 0133", email: "daniel@prime10solutions.com", website: null, years_operating: 6, employees: 9 },
  { business_id: BIZ_ENYERMY, legal_name: "Enyermy Clean Pro LLC", industry: "Limpieza post-obra y mantenimiento de edificios", address: "1140 SW 8th St", city: "Miami", state: "FL", phone: "+1 305 555 0187", email: "enyermy@enyermycleanpro.com", website: "https://enyermycleanpro.com", years_operating: 7, employees: 8 },
  { business_id: BIZ_BIMBO, legal_name: "Bimbo Remodelaciones Franchising LLC", industry: "Remodelación residencial", address: "900 Brickell Ave", city: "Miami", state: "FL", phone: "+1 305 555 0300", email: "rodrigo@bimboremodelaciones.com", website: "https://bimboremodelaciones.com", years_operating: 9, employees: 31 },
  { business_id: BIZ_SUNSHINE, legal_name: "Sunshine Roofing Corp.", industry: "Techos y remodelaciones", address: "5300 S Orange Ave", city: "Orlando", state: "FL", phone: "+1 407 555 0231", email: "oscar@sunshineroofing.com", website: "https://sunshineroofing.com", years_operating: 12, employees: 22 },
  { business_id: BIZ_CASA_LIMPIA, legal_name: "Casa Limpia Orlando LLC", industry: "Limpieza de casas y oficinas", address: "3100 E Colonial Dr", city: "Orlando", state: "FL", phone: "+1 407 555 0232", email: "marta@casalimpiaorlando.com", website: null, years_operating: 8, employees: 24 },
];

const member = (n: number, owner_id: string, name: string, role: string, email: string | null, state: TeamMember["state"], user_id: string | null = null): TeamMember => ({ id: uuid("8a000000", n), owner_id, name, role, email, state, user_id });

/** Members with a user_id have an account in the portal (the owner and the people invited through it). */
export const teamMembers: TeamMember[] = [
  member(1, BIZ_VOSSLER, "Carla Méndez", "Dueña", "carla@vossler.com", "active", U_CARLA),
  member(2, BIZ_VOSSLER, "Ana Vossler", "Administración", "ana@vosslerbuild.com", "active", U_ANA_VOSSLER),
  member(3, BIZ_VOSSLER, "Luis Prado", "Jefe de obra", "luis@vosslerbuild.com", "invited"),
  member(4, BIZ_PRIME, "Daniel Ortiz", "Dueño", "daniel@prime10solutions.com", "active", U_DANIEL),
  member(5, BIZ_ENYERMY, "Enyermy Rivas", "Dueña", "enyermy@enyermycleanpro.com", "active", U_ENYERMY),
  member(6, BIZ_BIMBO, "Rodrigo Bimbo", "Dueño", "rodrigo@bimboremodelaciones.com", "active", U_RODRIGO_BIMBO),
  member(7, BIZ_BIMBO, "Carla Bimbo", "Operaciones y franquicias", "carla@bimboremodelaciones.com", "active"),
  member(8, BIZ_BIMBO, "Esteban Ruiz", "Jefe de obra de Miami", "esteban@bimboremodelaciones.com", "active"),
  member(9, BIZ_SUNSHINE, "Óscar Medina", "Dueño", "oscar@sunshineroofing.com", "active", U_OSCAR),
  member(10, BIZ_CASA_LIMPIA, "Marta Quintero", "Dueña", "marta@casalimpiaorlando.com", "active", U_MARTA),
  member(11, FRANCHISE_ORLANDO_SUR, "Luisa Paredes", "Dueña", "luisa@bimboremodelaciones.com", "active", U_LUISA),
  member(12, FRANCHISE_ORLANDO_SUR, "Tomás Reyes", "Jefe de cuadrilla", "tomas@bimboremodelaciones.com", "active"),
  member(13, FRANCHISE_ORLANDO_SUR, "Cuadrilla de obra", "Operación", null, "invited"),
  member(14, FRANCHISE_TAMPA, "Marco Ibáñez", "Dueño", "marco@bimboremodelaciones.com", "active", U_MARCO),
];

// ---------- Business Bishop ----------
/** Cumulative recovery of Jefferson's investment in Bimbo Remodelaciones, monthly. Projected comes from the agreement. */
const RECOVERY_MONTHS = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
const PROJECTED = [0, 3000, 6000, 9500, 13000, 17000, 21000, 25500, 30000, 35000, 40000, 45500, 51000, 57000, 63000, 69500, 76000];
const ACTUAL = [0, 2600, 5200, 9000, 12800, 17600, 22400, 27250, 32100, 36950, 41800];

export const recovery: RecoveryPoint[] = RECOVERY_MONTHS.map((month, i) => ({ month, projected: PROJECTED[i]!, actual: ACTUAL[i] ?? null }));

export const bishopInvestment = {
  id: uuid("9a000000", 1),
  bishop_user_id: U_JEFFERSON,
  business_id: BIZ_BIMBO,
  invested: 150000,
  invested_at: "2025-11-14",
};

/** Framework agreement with SM (confidentiality, non-circumvention), signed through DocuSeal. Diego has not signed. */
const framework = (n: number, user: string, name: string, signedOn: string | null): Contract => ({
  id: uuid("9c000000", n), business_id: "", area: "intake", kind: "framework",
  name: "Acuerdo marco con Strategic Mates (confidencialidad y no circunvención)",
  state: signedOn ? "signed" : "sent", sent_at: "2025-10-28", signed_at: signedOn,
  signers: [
    { name, role: "bishop", party: "bishop", user_id: user, status: signedOn ? "signed" : "sent", signed_at: signedOn, decline_reason: null,
      history: signedOn ? [{ status: "sent", at: "2025-10-28" }, { status: "signed", at: signedOn }] : [{ status: "sent", at: "2026-10-12" }],
      signature: signedOn ? { kind: "typed", image_url: typedSignatureDataUrl(name) } : null },
    // Corporate countersigns through its CEO: "Firmado por Marilyn Boraei en nombre de Strategic Mates Corporate". Diego's
    // is still waiting for her (and for him).
    { name: "Marilyn Boraei", role: "sm", party: "sm", user_id: U_MARYLIN, status: signedOn ? "signed" : "sent", signed_at: signedOn ? "2025-10-28" : null, decline_reason: null,
      history: signedOn ? [{ status: "signed", at: "2025-10-28" }] : [{ status: "sent", at: "2026-10-12" }], sm_entity: "corporate",
      signature: signedOn ? { kind: "typed", image_url: typedSignatureDataUrl("Marilyn Boraei") } : null },
  ],
});
export const frameworkContracts: Contract[] = [
  framework(1, U_JEFFERSON, "Jefferson Paula", "2025-10-30"),
  framework(2, U_LAURA, "Laura Ortega", "2026-03-02"),
  framework(3, U_DIEGO, "Diego Rivas", null),
];

export const agreements: BishopAgreement[] = [
  { id: uuid("9b000000", 1), bishop_user_id: U_JEFFERSON, business_id: BIZ_BIMBO, name: "Acuerdo de participación: Bimbo Remodelaciones", counterparties: "Rodrigo Bimbo, Strategic Mates", state: "signed", signed_at: "2025-11-14", has_file: true, file_name: "Acuerdo_participacion_Bimbo_Remodelaciones.pdf" },
  // The draft is still with SM's lawyers: no file to open yet.
  { id: uuid("9b000000", 3), bishop_user_id: U_JEFFERSON, business_id: BIZ_VOSSLER, name: "Acuerdo de participación: Vossler", counterparties: "Carla Méndez, Strategic Mates", state: "draft", signed_at: null, has_file: false, file_name: null },
];
