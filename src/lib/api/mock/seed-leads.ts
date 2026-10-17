// Sample leads for SM Miami (replaceable). They mimic what the external readiness assessment sends.
import type { AssessmentBlock, BlockStatus, Lead, LeadEvent, LeadResult, LeadStage } from "../types";
import { ASSESSMENT_BLOCKS } from "../types";
import { BIZ_ENYERMY, BIZ_PRIME, BIZ_VOSSLER, ORG_SM, U_CAMILA, U_NICOLAS } from "./seed";

/** Same ids as seed-network U_JEFFERSON and U_LAURA (kept here to avoid an import cycle). */
const U_JEFFERSON_LEAD = "0c000000-0000-4000-8000-000000000040";
const U_LAURA_LEAD = "0c000000-0000-4000-8000-000000000091";
export const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const at = (date: string, time = "15:00:00") => `${date}T${time}Z`;
export const blocks = (s: string): LeadResult["blocks"] => {
  const map: Record<string, BlockStatus> = { s: "strong", m: "medium", w: "weak", u: "unknown" };
  return ASSESSMENT_BLOCKS.map((key: AssessmentBlock, i) => ({ key, status: map[s[i]!]! }));
};

export interface LeadSpec {
  lead: Omit<Lead, "id" | "office_id" | "stage" | "stage_entered_at" | "submitted_at" | "discarded_from" | "discard_reason" | "last_contact_at" | "bishop_user_id" | "bishop_accepted_at" | "source" | "summary_sent_at" | "meeting"> & {
    discard_reason?: string;
    bishop_user_id?: string | null;
    bishop_accepted_at?: string | null;
  };
  /** First entry: submission date. Then each stage reached, with its date. */
  path: [LeadStage | "submitted", string][];
  contacted?: boolean;
  notes?: [string, string][];
  /**
   * Leads still in Reunión: the meeting the owner booked (start time). Leads that went further get a past meeting
   * built from their path; a lead in Reunión without it was moved there by hand.
   */
  meeting_at?: string;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const meetUrl = (n: number) => `https://meet.google.com/smp-${String(1000 + n).slice(-4)}-dmo`;

/** The booking of a seeded lead: as it would have come from the consultant's calendar. */
function seededMeeting(s: LeadSpec, n: number): Lead["meeting"] {
  const i = s.path.findIndex(([st]) => st === "meeting");
  if (i < 0) return null;
  const booked = s.path[i]![1];
  const next = s.path[i + 1];
  const base = { duration_minutes: 30, meet_url: meetUrl(n), consultant_user_id: s.lead.consultant_user_id, booked_at: at(booked, "13:30:00") };
  if (!next) return s.meeting_at ? { ...base, starts_at: s.meeting_at, notes_at: null } : null;
  // Went further: the meeting happened before the next step, and the consultant wrote the note right after it.
  const day = addDays(booked, Math.min(2, dayGap(booked, next[1])));
  return { ...base, starts_at: at(day, "14:00:00"), notes_at: at(day, "15:00:00") };
}

const specs: LeadSpec[] = [
  {
    path: [["submitted", "2026-07-08"], ["meeting", "2026-07-10"], ["documents", "2026-07-17"], ["accepted", "2026-07-24"], ["in_program", "2026-08-02"]],
    // Funded by Jefferson (Bishop): tripartite signed, funds received, distribution under way (see seed-funds).
    lead: {
      consultant_user_id: U_NICOLAS, business_id: BIZ_VOSSLER, bishop_user_id: U_JEFFERSON_LEAD, bishop_accepted_at: at("2026-07-25"),
      contact: { name: "Carla Méndez", email: "carla@vossler.com", phone: "+1 407 555 0110", city: "Orlando", state: "FL", hispanic_owner: true },
      business: { name: "Vossler", industry: "construction", activity: "Construcción residencial", revenue_range: "1m_2m", margin_range: "margin_21_40", team_range: "team_20_plus", years_range: "years_10_plus", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 86, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"),
        strengths: ["Proceso de obra probado en más de 200 casas", "Margen estable en los últimos tres años"], priorities: ["Documentar el método de obra", "Ordenar contratos y licencias"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-08-20"], ["meeting", "2026-08-24"], ["documents", "2026-08-31"], ["accepted", "2026-09-04"], ["in_program", "2026-09-14"]],
    // Funded by Laura (Bishop).
    lead: {
      consultant_user_id: U_CAMILA, business_id: BIZ_PRIME, bishop_user_id: U_LAURA_LEAD, bishop_accepted_at: at("2026-09-05"),
      contact: { name: "Daniel Ortiz", email: "daniel@prime10solutions.com", phone: "+1 813 555 0133", city: "Tampa", state: "FL", hispanic_owner: true },
      business: { name: "Prime 10 Solutions", industry: "remodeling", activity: "Remodelaciones de cocinas y baños", revenue_range: "750k_1m", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 69, eligible_program: true, eligibility_gaps: [], blocks: blocks("smmwmwm"),
        strengths: ["Clientes que vuelven y lo recomiendan", "Equipo estable"], priorities: ["Sistema de presupuestos", "Marca y presencia local"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-09-21"], ["meeting", "2026-09-23"], ["documents", "2026-09-28"], ["accepted", "2026-10-02"], ["in_program", "2026-10-09"]],
    // Funded by Jefferson (Bishop); he uploaded his own receipt and SM confirmed it.
    lead: {
      consultant_user_id: U_NICOLAS, business_id: BIZ_ENYERMY, bishop_user_id: U_JEFFERSON_LEAD, bishop_accepted_at: at("2026-10-03"),
      contact: { name: "Enyermy Rivas", email: "enyermy@enyermyhair.com", phone: "+1 305 555 0187", city: "Miami", state: "FL", hispanic_owner: true },
      business: { name: "Enyermy Hair Studio", industry: "salon", activity: "Salón de belleza y color", revenue_range: "250k_500k", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 68, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmwwsmm"),
        strengths: ["Marca reconocida en el barrio", "Técnica de color propia"], priorities: ["Números del negocio", "Agenda y sistema de citas"] },
      know_how_example: null,
    },
  },
  {
    // Accepted 35 days ago and still without an investor: two Bishops saw it, one passed.
    path: [["submitted", "2026-08-18"], ["meeting", "2026-08-21"], ["documents", "2026-08-27"], ["accepted", "2026-09-09"]],
    contacted: true,
    notes: [["2026-09-10", "Documentación aprobada. Esperamos que un inversor tome la oportunidad."]],
    lead: {
      consultant_user_id: U_CAMILA, business_id: null,
      contact: { name: "Gabriela Fuentes", email: "gaby@brisaclean.com", phone: "+1 786 555 0144", city: "Kendall", state: "FL", hispanic_owner: true },
      business: { name: "Brisa Clean Services", industry: "cleaning", activity: "Limpieza de oficinas y casas", revenue_range: "750k_1m", margin_range: "margin_0_20", team_range: "team_20_plus", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 68, eligible_program: true, eligibility_gaps: [], blocks: blocks("msmmmwm"),
        strengths: ["Procesos de limpieza escritos", "Contratos recurrentes con oficinas"], priorities: ["Margen por servicio", "Contratos y seguros"] },
      know_how_example: "Tenemos una lista de 42 puntos para cada limpieza y el cliente la firma al final. Casi no recibimos quejas.",
    },
  },
  {
    path: [["submitted", "2026-10-01"], ["meeting", "2026-10-03"], ["documents", "2026-10-09"]],
    contacted: true,
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Ramón Castillo", email: "ramon@sazoncriollo.com", phone: "+1 305 555 0161", city: "Hialeah", state: "FL", hispanic_owner: true },
      business: { name: "Sazón Criollo", industry: "restaurant", activity: "Restaurante de comida cubana", revenue_range: "1m_2m", margin_range: "margin_0_20", team_range: "team_20_plus", years_range: "years_10_plus", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 84, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmmsmm"),
        strengths: ["Recetas estandarizadas", "Dos locales funcionando con el mismo menú"], priorities: ["Manual de operaciones", "Control de costos por plato"] },
      know_how_example: "Nuestro sofrito lo preparamos cada mañana con la receta de mi abuela y lo medimos por gramos. Así el sabor es igual todos los días, en los dos locales.",
    },
  },
  {
    path: [["submitted", "2026-10-02"], ["meeting", "2026-10-06"]],
    // Booked from the summary email for Thursday 15 at 10:00 (Miami).
    meeting_at: "2026-10-15T14:00:00Z",
    contacted: true,
    notes: [["2026-10-06", "Reunión agendada para el jueves. Quiere entender cuánto tiempo le va a pedir el programa."]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Javier Rivera", email: "javier@riveraroofing.com", phone: "+1 954 555 0129", city: "Fort Lauderdale", state: "FL", hispanic_owner: true },
      business: { name: "Rivera Roofing & Remodel", industry: "remodeling", activity: "Techos y remodelaciones", revenue_range: "500k_750k", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 66, eligible_program: true, eligibility_gaps: [], blocks: blocks("msmwmwm"),
        strengths: ["Método de trabajo propio", "Garantía que el cliente valora"], priorities: ["Números por obra", "Licencias por condado"] },
      know_how_example: "Usamos un sellador propio en las juntas que evita filtraciones y nos ahorra volver a la obra.",
    },
  },
  {
    path: [["submitted", "2026-09-10"], ["meeting", "2026-09-12"], ["documents", "2026-09-15"]],
    contacted: true,
    lead: {
      consultant_user_id: U_CAMILA, business_id: null,
      contact: { name: "Yesenia Morales", email: "yesenia@glownails.com", phone: "+1 407 555 0176", city: "Kissimmee", state: "FL", hispanic_owner: true },
      business: { name: "Glow Nails & Spa", industry: "salon", activity: "Uñas y spa", revenue_range: "250k_500k", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_3_5", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 62, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmwmsww"),
        strengths: ["Clientela fiel", "Buena presencia en redes"], priorities: ["Procesos escritos", "Equipo y roles"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-09"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Luis Torres", email: "luis@torresconcrete.com", phone: "+1 863 555 0102", city: "Lakeland", state: "FL", hispanic_owner: true },
      business: { name: "Torres Concrete", industry: "construction", activity: "Concreto y fundaciones", revenue_range: "250k_500k", margin_range: "margin_0_20", team_range: "team_11_20", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "low", score: 52, eligible_program: true, eligibility_gaps: [], blocks: blocks("wmwwwmm"),
        strengths: ["Experiencia técnica del dueño"], priorities: ["Margen y precios", "Procesos escritos", "Herramientas para el equipo"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-13"]],
    lead: {
      consultant_user_id: U_CAMILA, business_id: null,
      contact: { name: "Patricia Gómez", email: "patricia@limpiezatotal.com", phone: "+1 407 555 0158", city: "Orlando", state: "FL", hispanic_owner: true },
      business: { name: "Limpieza Total Orlando", industry: "cleaning", activity: "Limpieza de casas y Airbnb", revenue_range: "250k_500k", margin_range: null, team_range: "team_6_10", years_range: "years_3_5", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 63, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmuuumu"),
        strengths: ["Crecimiento constante de clientes"], priorities: ["Conocer sus números", "Herramientas", "Contratos"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-12"]],
    lead: {
      consultant_user_id: U_CAMILA, business_id: null,
      contact: { name: "Lucy Peña", email: "lucy@fondamamalucy.com", phone: "+1 305 555 0119", city: "Doral", state: "FL", hispanic_owner: true },
      business: { name: "La Fonda de Mamá Lucy", industry: "restaurant", activity: "Fonda de comida venezolana", revenue_range: "250k_500k", margin_range: "margin_0_20", team_range: "team_6_10", years_range: "years_lt1", has_active_clients: true },
      result: { readiness: "on_track", band: "track", score: 58, eligible_program: false, eligibility_gaps: ["years_operating"], blocks: blocks("mmwwmwm"),
        strengths: ["Producto que la gente busca"], priorities: ["Sumar tiempo operando", "Ordenar las finanzas"] },
      know_how_example: null,
    },
  },
  {
    path: [["submitted", "2026-10-10"]],
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null,
      contact: { name: "Andrés Quispe", email: "andres@andespainting.com", phone: "+1 321 555 0147", city: "Sanford", state: "FL", hispanic_owner: true },
      business: { name: "Andes Painting", industry: "construction", activity: "Pintura residencial", revenue_range: "lt_250k", margin_range: "margin_21_40", team_range: "team_1", years_range: "years_3_5", has_active_clients: true },
      result: { readiness: "on_track", band: "track", score: 48, eligible_program: false, eligibility_gaps: ["revenue"], blocks: blocks("wmwwmwm"),
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
      business: { name: "Café Aroma", industry: "restaurant", activity: "Cafetería y panadería", revenue_range: "500k_750k", margin_range: "margin_0_20", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "mid", score: 61, eligible_program: true, eligibility_gaps: [], blocks: blocks("mmmwmmw"),
        strengths: ["Local con buen flujo de clientes"], priorities: ["Procesos y recetas escritas"] },
      know_how_example: null,
    },
  },
  {
    // Accepted with a Bishop (Jefferson): tripartite contract signed by the owner and SM, waiting for him.
    path: [["submitted", "2026-08-25"], ["meeting", "2026-08-28"], ["documents", "2026-09-03"], ["accepted", "2026-09-22"]],
    contacted: true,
    lead: {
      consultant_user_id: U_NICOLAS, business_id: null, bishop_user_id: U_JEFFERSON_LEAD, bishop_accepted_at: at("2026-09-30"),
      contact: { name: "Héctor Ramírez", email: "hector@solremodeling.com", phone: "+1 305 555 0172", city: "Doral", state: "FL", hispanic_owner: true },
      business: { name: "Sol Remodeling", industry: "remodeling", activity: "Remodelación de cocinas y baños", revenue_range: "1m_2m", margin_range: "margin_21_40", team_range: "team_11_20", years_range: "years_6_10", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 84, eligible_program: true, eligibility_gaps: [], blocks: blocks("ssmssmm"),
        strengths: ["Equipo estable con jefes de obra", "Presupuestos con precios por partida"], priorities: ["Manual de obra", "Marca registrada"] },
      know_how_example: "Cada obra tiene un tablero con fotos diarias que el cliente ve. Terminamos a tiempo nueve de cada diez obras.",
    },
  },
  {
    // Accepted with a Bishop (Laura): tripartite signed by the three, funds partial (USD 100,000 of 150,000).
    path: [["submitted", "2026-08-10"], ["meeting", "2026-08-13"], ["documents", "2026-08-19"], ["accepted", "2026-09-01"]],
    contacted: true,
    notes: [["2026-09-26", "Laura transfirió USD 100.000. El resto llega antes de fin de octubre."]],
    lead: {
      consultant_user_id: U_CAMILA, business_id: null, bishop_user_id: U_LAURA_LEAD, bishop_accepted_at: at("2026-09-03"),
      contact: { name: "Rosa Delgado", email: "rosa@laespigabakery.com", phone: "+1 305 555 0124", city: "Westchester", state: "FL", hispanic_owner: true },
      business: { name: "Panadería La Espiga", industry: "restaurant", activity: "Panadería y pastelería latina", revenue_range: "750k_1m", margin_range: "margin_21_40", team_range: "team_6_10", years_range: "years_10_plus", has_active_clients: true },
      result: { readiness: "ready", band: "high", score: 81, eligible_program: true, eligibility_gaps: [], blocks: blocks("smsmsmm"),
        strengths: ["Recetas medidas y escritas", "Ventas a cafeterías todas las semanas"], priorities: ["Manual de producción", "Costos por producto"] },
      know_how_example: "Horneamos en tandas con tiempos fijos por producto. Un panadero nuevo aprende el turno en dos semanas.",
    },
  },
];

export interface LeadSeedOptions {
  office_id: string;
  lead_prefix: string;
  event_prefix: string;
}

/** Turns specs into leads and their history. The same builder serves every office. */
export function buildLeads(leadSpecs: LeadSpec[], opts: LeadSeedOptions): { leads: Lead[]; leadEvents: LeadEvent[] } {
  const leads: Lead[] = [];
  const leadEvents: LeadEvent[] = [];
  let ev = 0;

  leadSpecs.forEach((s, i) => {
    const id = uuid(opts.lead_prefix, i + 1);
    const [, submitted] = s.path[0]!;
    const last = s.path.at(-1)!;
    const stage: LeadStage = last[0] === "submitted" ? "evaluated" : last[0];
    const { discard_reason, bishop_user_id, bishop_accepted_at, ...rest } = s.lead;
    const meeting = seededMeeting(s, i + 1);
    leadEvents.push({ id: uuid(opts.event_prefix, ++ev), lead_id: id, kind: "submitted", actor_user_id: null, created_at: at(submitted, "13:00:00"), from: null, to: "evaluated", body: null });
    // The landing sends the summary email a few minutes after the assessment (automatic).
    leadEvents.push({ id: uuid(opts.event_prefix, ++ev), lead_id: id, kind: "summary_sent", actor_user_id: null, created_at: at(submitted, "13:05:00"), from: null, to: null, body: null });
    let prev: LeadStage = "evaluated";
    for (const [to, date] of s.path.slice(1)) {
      const st = to as LeadStage;
      // A booked meeting moved the lead to Reunión by itself.
      const booked = st === "meeting" && !!meeting;
      leadEvents.push({
        id: uuid(opts.event_prefix, ++ev), lead_id: id, actor_user_id: booked ? null : s.lead.consultant_user_id, created_at: booked ? meeting.booked_at : at(date), from: prev, to: st,
        kind: st === "discarded" ? "discarded" : st === "in_program" ? "contract_signed" : booked ? "meeting_booked" : "stage_changed",
        body: st === "discarded" ? discard_reason ?? null : null, signed_on: st === "in_program" ? date : null,
      });
      prev = st;
    }
    for (const [date, body] of s.notes ?? [])
      leadEvents.push({ id: uuid(opts.event_prefix, ++ev), lead_id: id, kind: "note", actor_user_id: s.lead.consultant_user_id, created_at: at(date, "17:00:00"), from: null, to: null, body });
    const before = s.path.at(-2);
    leads.push({
      ...rest,
      id,
      office_id: opts.office_id,
      source: "landing",
      summary_sent_at: at(submitted, "13:05:00"),
      meeting,
      stage,
      discarded_from: stage === "discarded" && before && before[0] !== "submitted" ? (before[0] as Lead["discarded_from"]) : stage === "discarded" ? "evaluated" : null,
      discard_reason: discard_reason ?? null,
      bishop_user_id: bishop_user_id ?? null,
      bishop_accepted_at: bishop_accepted_at ?? null,
      submitted_at: at(submitted, "13:00:00"),
      stage_entered_at: at(last[1], last[0] === "submitted" ? "13:00:00" : "15:00:00"),
      last_contact_at: s.path.length > 1 || s.contacted ? at(last[1]) : null,
    });
  });
  return { leads, leadEvents };
}

const miami = buildLeads(specs, { office_id: ORG_SM, lead_prefix: "0e000000", event_prefix: "0f000000" });
export const leads: Lead[] = miami.leads;
export const leadEvents: LeadEvent[] = miami.leadEvents;
