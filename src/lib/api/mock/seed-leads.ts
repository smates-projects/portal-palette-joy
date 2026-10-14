// Sample leads for SM Miami (replaceable). They mimic what the external readiness assessment sends.
import type { AssessmentBlock, BlockStatus, Lead, LeadEvent, LeadStage } from "../types";
import { ASSESSMENT_BLOCKS } from "../types";
import { BIZ_ENYERMY, BIZ_PRIME, BIZ_VOSSLER, ORG_SM, U_MARYLIN, U_NICOLAS } from "./seed";

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (date: string, time = "15:00:00") => `${date}T${time}Z`;
const blocks = (s: string): Lead["result"]["blocks"] => {
  const map: Record<string, BlockStatus> = { s: "strong", m: "medium", w: "weak", u: "unknown" };
  return ASSESSMENT_BLOCKS.map((key: AssessmentBlock, i) => ({ key, status: map[s[i]!]! }));
};

interface Spec {
  lead: Omit<Lead, "id" | "office_id" | "stage" | "stage_entered_at" | "submitted_at" | "discarded_from" | "discard_reason" | "last_contact_at"> & { discard_reason?: string };
  /** First entry: submission date. Then each stage reached, with its date. */
  path: [LeadStage | "submitted", string][];
  contacted?: boolean;
  notes?: [string, string][];
}

const specs: Spec[] = [
  {
    path: [["submitted", "2026-07-08"], ["meeting", "2026-07-10"], ["accepted", "2026-07-17"], ["contract", "2026-07-24"], ["in_program", "2026-08-02"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: BIZ_VOSSLER,
      contact: { name: "Carla Méndez", email: "carla@vossler.com", phone: "+1 407 555 0110", city: "Orlando", state: "FL", hispanic_owner: true },
      business: { name: "Vossler", industry: "construction", activity: "Construcción residencial", revenue_range: "1m_3m", margin_range: "20_30", team_range: "16_50", years_range: "gt_10", has_active_clients: true },
      result: { band: "high", score: 86, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"),
        strengths: ["Proceso de obra probado en más de 200 casas", "Margen estable en los últimos tres años"], priorities: ["Documentar el método de obra", "Ordenar contratos y licencias"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-08-20"], ["meeting", "2026-08-24"], ["accepted", "2026-08-31"], ["contract", "2026-09-04"], ["in_program", "2026-09-14"]],
    lead: {
      consultant_user_id: U_MARYLIN, business_id: BIZ_PRIME,
      contact: { name: "Daniel Ortiz", email: "daniel@prime10solutions.com", phone: "+1 813 555 0133", city: "Tampa", state: "FL", hispanic_owner: true },
      business: { name: "Prime 10 Solutions", industry: "remodeling", activity: "Remodelaciones de cocinas y baños", revenue_range: "500k_1m", margin_range: "20_30", team_range: "6_15", years_range: "5_10", has_active_clients: true },
      result: { band: "mid", score: 74, eligible_program: true, eligibility_gaps: [], blocks: blocks("smmwmwm"),
        strengths: ["Clientes que vuelven y lo recomiendan", "Equipo estable"], priorities: ["Sistema de presupuestos", "Marca y presencia local"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-09-21"], ["meeting", "2026-09-23"], ["accepted", "2026-09-28"], ["contract", "2026-10-02"], ["in_program", "2026-10-09"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: BIZ_ENYERMY,
      contact: { name: "Enyermy Rivas", email: "enyermy@enyermyhair.com", phone: "+1 305 555 0187", city: "Miami", state: "FL", hispanic_owner: true },
      business: { name: "Enyermy Hair Studio", industry: "salon", activity: "Salón de belleza y color", revenue_range: "250k_500k", margin_range: "20_30", team_range: "6_15", years_range: "5_10", has_active_clients: true },
      result: { band: "mid", score: 68, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmwwsmm"),
        strengths: ["Marca reconocida en el barrio", "Técnica de color propia"], priorities: ["Números del negocio", "Agenda y sistema de citas"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-09-25"], ["meeting", "2026-09-29"], ["accepted", "2026-10-03"], ["contract", "2026-10-07"]],
    contacted: true,
    notes: [["2026-10-08", "Le mandé el contrato. Quiere revisarlo con su contador antes de firmar."]],
    lead: {
      consultant_user_id: U_MARYLIN, business_id: null,
      contact: { name: "Gabriela Fuentes", email: "gaby@brisaclean.com", phone: "+1 786 555 0144", city: "Kendall", state: "FL", hispanic_owner: true },
      business: { name: "Brisa Clean Services", industry: "cleaning", activity: "Limpieza de oficinas y casas", revenue_range: "500k_1m", margin_range: "10_20", team_range: "16_50", years_range: "5_10", has_active_clients: true },
      result: { band: "mid", score: 71, eligible_program: true, eligibility_gaps: [], blocks: blocks("msmmmwm"),
        strengths: ["Procesos de limpieza escritos", "Contratos recurrentes con oficinas"], priorities: ["Margen por servicio", "Contratos y seguros"] },
      know_how_example: "Tenemos una lista de 42 puntos para cada limpieza y el cliente la firma al final. Casi no recibimos quejas.",
    },
  },
  {
    path: [["submitted", "2026-10-01"], ["meeting", "2026-10-03"], ["accepted", "2026-10-09"]],
    contacted: true,
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Ramón Castillo", email: "ramon@sazoncriollo.com", phone: "+1 305 555 0161", city: "Hialeah", state: "FL", hispanic_owner: true },
      business: { name: "Sazón Criollo", industry: "restaurant", activity: "Restaurante de comida cubana", revenue_range: "1m_3m", margin_range: "10_20", team_range: "16_50", years_range: "gt_10", has_active_clients: true },
      result: { band: "high", score: 84, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"),
        strengths: ["Recetas estandarizadas", "Dos locales funcionando con el mismo menú"], priorities: ["Manual de operaciones", "Control de costos por plato"] },
      know_how_example: "Nuestro sofrito lo preparamos cada mañana con la receta de mi abuela y lo medimos por gramos. Así el sabor es igual todos los días, en los dos locales.",
    },
  },
  {
    path: [["submitted", "2026-10-02"], ["meeting", "2026-10-06"]],
    contacted: true,
    notes: [["2026-10-06", "Reunión agendada para el jueves. Quiere entender cuánto tiempo le va a pedir el programa."]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Javier Rivera", email: "javier@riveraroofing.com", phone: "+1 954 555 0129", city: "Fort Lauderdale", state: "FL", hispanic_owner: true },
      business: { name: "Rivera Roofing & Remodel", industry: "remodeling", activity: "Techos y remodelaciones", revenue_range: "500k_1m", margin_range: "20_30", team_range: "6_15", years_range: "5_10", has_active_clients: true },
      result: { band: "mid", score: 66, eligible_program: true, eligibility_gaps: [], blocks: blocks("msmwmwm"),
        strengths: ["Método de trabajo propio", "Garantía que el cliente valora"], priorities: ["Números por obra", "Licencias por condado"] },
      know_how_example: "Usamos un sellador propio en las juntas que evita filtraciones y nos ahorra volver a la obra.",
    },
  },
  {
    path: [["submitted", "2026-10-05"], ["meeting", "2026-10-07"]],
    contacted: true,
    lead: {
      consultant_user_id: U_MARYLIN, business_id: null,
      contact: { name: "Yesenia Morales", email: "yesenia@glownails.com", phone: "+1 407 555 0176", city: "Kissimmee", state: "FL", hispanic_owner: true },
      business: { name: "Glow Nails & Spa", industry: "salon", activity: "Uñas y spa", revenue_range: "250k_500k", margin_range: "20_30", team_range: "6_15", years_range: "2_5", has_active_clients: true },
      result: { band: "mid", score: 62, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmwmsww"),
        strengths: ["Clientela fiel", "Buena presencia en redes"], priorities: ["Procesos escritos", "Equipo y roles"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-09"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Luis Torres", email: "luis@torresconcrete.com", phone: "+1 863 555 0102", city: "Lakeland", state: "FL", hispanic_owner: true },
      business: { name: "Torres Concrete", industry: "construction", activity: "Concreto y fundaciones", revenue_range: "250k_500k", margin_range: "lt_10", team_range: "6_15", years_range: "5_10", has_active_clients: true },
      result: { band: "low", score: 52, eligible_program: true, eligibility_gaps: [], blocks: blocks("wmwwwmm"),
        strengths: ["Experiencia técnica del dueño"], priorities: ["Margen y precios", "Procesos escritos", "Herramientas para el equipo"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-13"]],
    lead: {
      consultant_user_id: U_MARYLIN, business_id: null,
      contact: { name: "Patricia Gómez", email: "patricia@limpiezatotal.com", phone: "+1 407 555 0158", city: "Orlando", state: "FL", hispanic_owner: true },
      business: { name: "Limpieza Total Orlando", industry: "cleaning", activity: "Limpieza de casas y Airbnb", revenue_range: "250k_500k", margin_range: "10_20", team_range: "6_15", years_range: "2_5", has_active_clients: true },
      result: { band: "mid", score: 63, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmuuumu"),
        strengths: ["Crecimiento constante de clientes"], priorities: ["Conocer sus números", "Herramientas", "Contratos"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-12"]],
    lead: {
      consultant_user_id: U_MARYLIN, business_id: null,
      contact: { name: "Lucy Peña", email: "lucy@fondamamalucy.com", phone: "+1 305 555 0119", city: "Doral", state: "FL", hispanic_owner: true },
      business: { name: "La Fonda de Mamá Lucy", industry: "restaurant", activity: "Fonda de comida venezolana", revenue_range: "250k_500k", margin_range: "10_20", team_range: "6_15", years_range: "lt_2", has_active_clients: true },
      result: { band: "track", score: 58, eligible_program: false, eligibility_gaps: ["years"], blocks: blocks("mmwwmwm"),
        strengths: ["Producto que la gente busca"], priorities: ["Sumar tiempo operando", "Ordenar las finanzas"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-10"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Andrés Quispe", email: "andres@andespainting.com", phone: "+1 321 555 0147", city: "Sanford", state: "FL", hispanic_owner: true },
      business: { name: "Andes Painting", industry: "construction", activity: "Pintura residencial", revenue_range: "lt_250k", margin_range: "20_30", team_range: "1_5", years_range: "2_5", has_active_clients: true },
      result: { band: "track", score: 48, eligible_program: false, eligibility_gaps: ["revenue"], blocks: blocks("wmwwmwm"),
        strengths: ["Buen margen por trabajo"], priorities: ["Crecer en ventas", "Sumar equipo"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-09-15"], ["meeting", "2026-09-18"], ["discarded", "2026-09-26"]],
    contacted: true,
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null, discard_reason: "El dueño decidió vender el negocio este año.",
      contact: { name: "Miguel Ángel Soto", email: "miguel@cafearoma.com", phone: "+1 305 555 0193", city: "Coral Gables", state: "FL", hispanic_owner: true },
      business: { name: "Café Aroma", industry: "restaurant", activity: "Cafetería y panadería", revenue_range: "500k_1m", margin_range: "10_20", team_range: "6_15", years_range: "5_10", has_active_clients: true },
      result: { band: "mid", score: 61, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmmwmmw"),
        strengths: ["Local con buen flujo de clientes"], priorities: ["Procesos y recetas escritas"] },
      know_how_example: null,
    },
  },
];

export const leads: Lead[] = [];
export const leadEvents: LeadEvent[] = [];
let ev = 0;

specs.forEach((s, i) => {
  const id = uuid("0e000000", i + 1);
  const [, submitted] = s.path[0]!;
  const last = s.path.at(-1)!;
  const stage: LeadStage = last[0] === "submitted" ? "evaluated" : last[0];
  const { discard_reason, ...rest } = s.lead;
  leadEvents.push({ id: uuid("0f000000", ++ev), lead_id: id, kind: "submitted", actor_user_id: null, created_at: at(submitted, "13:00:00"), from: null, to: "evaluated", body: null });
  let prev: LeadStage = "evaluated";
  for (const [to, date] of s.path.slice(1)) {
    const st = to as LeadStage;
    leadEvents.push({
      id: uuid("0f000000", ++ev), lead_id: id, actor_user_id: s.lead.consultant_user_id, created_at: at(date), from: prev, to: st,
      kind: st === "discarded" ? "discarded" : st === "in_program" ? "contract_signed" : "stage_changed",
      body: st === "discarded" ? discard_reason ?? null : null, signed_on: st === "in_program" ? date : null,
    });
    prev = st;
  }
  for (const [date, body] of s.notes ?? [])
    leadEvents.push({ id: uuid("0f000000", ++ev), lead_id: id, kind: "note", actor_user_id: s.lead.consultant_user_id, created_at: at(date, "17:00:00"), from: null, to: null, body });
  const before = s.path.at(-2);
  leads.push({
    ...rest,
    id,
    office_id: ORG_SM,
    stage,
    discarded_from: stage === "discarded" && before && before[0] !== "submitted" ? (before[0] as Lead["discarded_from"]) : stage === "discarded" ? "evaluated" : null,
    discard_reason: discard_reason ?? null,
    submitted_at: at(submitted, "13:00:00"),
    stage_entered_at: at(last[1], last[0] === "submitted" ? "13:00:00" : "15:00:00"),
    last_contact_at: s.path.length > 1 || s.contacted ? at(last[1]) : null,
  });
});
