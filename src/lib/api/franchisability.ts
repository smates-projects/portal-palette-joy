import type { Business, Franchisability, FranchisabilityRules, PlatformRules, Task } from "./types";

/** Global rules: only SM Global sets them (like the catalog). Offices and owners only read them. */
export const DEFAULT_FRANCHISABILITY_GOAL = 85;
export const DEFAULT_REQUIRED_TASK_CODES = ["B1-01", "B2-03", "B3-01", "B3-07", "B6-01", "B6-06"];
export const DEFAULT_FRANCHISABILITY_RULES: FranchisabilityRules = {
  goal: DEFAULT_FRANCHISABILITY_GOAL,
  required_task_codes: DEFAULT_REQUIRED_TASK_CODES,
};
/** Defaults of the other platform rules (SM Global edits them in Reglas). */
export const DEFAULT_AREA_AMBER_DAYS = 7;
export const DEFAULT_AMBER_TOLERANCE_POINTS = 10;
/**
 * Starting text of the owner's own confidentiality agreement ("Escribir mi acuerdo"). {{business_name}} and
 * {{owner_name}} are filled in when the owner opens the editor. Plain words: the owner may change anything.
 */
export const DEFAULT_OWNER_NDA_TEMPLATE = `Acuerdo de confidencialidad

Entre {{business_name}}, representado por {{owner_name}} (el dueño), y Strategic Mates.

1. Qué protege este acuerdo
Toda la información de {{business_name}} que el dueño comparta con Strategic Mates durante el ingreso y el programa: números, clientes, precios, proveedores, procesos, documentos y cualquier otro dato del negocio.

2. Qué se compromete a hacer Strategic Mates
Usar esa información solo para el programa. No compartirla con nadie que no trabaje en el programa. Pedir lo mismo a las firmas y a las personas que trabajen con ella.

3. Qué no cubre
La información que ya era pública o que la ley obliga a entregar.

4. Cuánto dura
Mientras dure la relación entre {{business_name}} y Strategic Mates y dos años después de que termine.

5. Si se termina la relación
Strategic Mates devuelve o borra la información de {{business_name}} cuando el dueño lo pida.

Firmado por {{owner_name}}, por {{business_name}}, y por Strategic Mates.`;

/** Seed values of the rules repository. Components read the live rules through useRules(), never this constant. */
export const DEFAULT_PLATFORM_RULES: PlatformRules = {
  franchisability_goal: DEFAULT_FRANCHISABILITY_GOAL,
  required_task_codes: DEFAULT_REQUIRED_TASK_CODES,
  area_amber_days: DEFAULT_AREA_AMBER_DAYS,
  franchisability_amber_tolerance: DEFAULT_AMBER_TOLERANCE_POINTS,
  document_review_days: 15,
  program_amount: 150_000,
  // Entry documents: Melany's list of the revised entry (19 Oct 2026), same ids and order as the API's seed, with the
  // help the owner reads next to each one (her wording, 20 Oct). SM Global edits them in Reglas. verified_hint is
  // sample data of the mock only (the API seeds it empty: the consultant writes the fact from each file).
  intake_documents: [
    { id: "a1000000-0000-4000-8000-000000000002", name: "Documento de constitución y vigencia", required: true, only_if_llc: false, verified_hint: "LLC activa en Florida desde 2016", archived: false,
      help: { what: "El papel que muestra que tu empresa existe y sigue activa en Florida.", counts: ["Articles of Organization o Incorporation", "Certificado de Sunbiz", "Captura de Sunbiz con tu empresa activa"], tip: "Lo encuentras gratis en sunbiz.org buscando el nombre de tu empresa." } },
    { id: "a1000000-0000-4000-8000-000000000004", name: "Operating Agreement o documento de propiedad y representación", required: true, only_if_llc: false, verified_hint: "Dueño con 100% de la LLC", archived: false,
      help: { what: "Muestra quiénes son los dueños de la empresa y quién firma por ella.", counts: ["Operating Agreement de tu LLC", "Bylaws o acta de accionistas", "Carta firmada que diga quiénes son los dueños y con qué porcentaje"], tip: "Si no tienes uno, súbenos la carta firmada: lo ordenamos juntos en el programa." } },
    { id: "a1000000-0000-4000-8000-000000000003", name: "Carta del IRS con el EIN", required: true, only_if_llc: false, verified_hint: "EIN verificado", archived: false,
      help: { what: "La carta donde el IRS le dio a tu empresa su número de identificación (EIN).", counts: ["Carta CP 575 del IRS", "Carta 147C del IRS", "Foto de la carta"], tip: "Si la perdiste, puedes pedir la carta 147C llamando al IRS." } },
    { id: "a1000000-0000-4000-8000-000000000005", name: "Business Tax Receipt y licencias de su domicilio", required: true, only_if_llc: false, verified_hint: "Licencia vigente hasta 09/2027", archived: false,
      help: { what: "El permiso de tu ciudad o condado para trabajar, y la licencia de tu oficio.", counts: ["Business Tax Receipt de la ciudad o del condado", "Licencia de contratista del estado (DBPR)", "Captura de tu licencia en la página del estado"], tip: "Sirve la que tienes vigente hoy, aunque venza pronto." } },
    { id: "a1000000-0000-4000-8000-000000000006", name: "Declaraciones de impuestos: las dos últimas, o las que tenga", required: true, only_if_llc: false, verified_hint: "Declaración 2025 presentada", archived: false,
      help: { what: "Las declaraciones de impuestos que presentó tu negocio.", counts: ["Formulario 1120, 1120-S o 1065", "Schedule C de tu declaración personal", "La copia que te dio tu contador"], tip: "Si solo tienes una, súbela igual." } },
    { id: "a1000000-0000-4000-8000-000000000008", name: "Estados financieros del último cierre y del año en curso", required: true, only_if_llc: false, verified_hint: "Margen neto del 18 % en 2025", archived: false,
      help: { what: "Cuánto vendió y cuánto gastó tu negocio el año pasado y en lo que va de este año.", counts: ["P&L de QuickBooks o de otro sistema", "Reporte que te prepara tu contador", "Planilla con ventas y gastos de cada mes"], tip: "No tiene que estar auditado ni firmado por un contador." } },
    { id: "a1000000-0000-4000-8000-000000000001", name: "Estados de cuenta bancarios de 12 meses", required: true, only_if_llc: false, verified_hint: "USD 640.000 en 12 meses", archived: false,
      help: { what: "Los resúmenes de la cuenta de banco de tu negocio de los últimos 12 meses.", counts: ["PDF que descargas de tu banco", "Captura de cada mes en la app del banco", "Foto del resumen en papel"], tip: "Puedes juntar los 12 meses en un solo archivo." } },
    { id: "a1000000-0000-4000-8000-000000000009", name: "Ventas por cliente o reporte equivalente", required: true, only_if_llc: false, verified_hint: "38 clientes en 12 meses, ninguno pasa del 15 %", archived: false,
      help: { what: "Cuánto te compró cada cliente en el último año.", counts: ["Reporte de tu sistema", "Planilla", "Foto de tu cuaderno de ventas"], tip: "Con el nombre de cada cliente y cuánto te pagó alcanza." } },
    { id: "a1000000-0000-4000-8000-000000000010", name: "Últimos tres clientes atendidos: cotización, entrega y fotos", required: true, only_if_llc: false, verified_hint: "Tres obras entregadas en 2026, con cotización y fotos", archived: false,
      help: { what: "Cómo trabajas de punta a punta: lo que cotizaste, lo que cobraste y cómo quedó el trabajo.", counts: ["Cotización", "Factura o recibo", "Fotos del trabajo terminado"], tip: "Junta lo de cada trabajo en un solo archivo, o súbelo todo junto." } },
    { id: "a1000000-0000-4000-8000-000000000007", name: "Workers' Compensation, si tiene personal", required: false, only_if_llc: false, verified_hint: "Vigente hasta 03/2027", archived: false,
      help: { what: "El seguro que cubre a tus empleados si se lastiman trabajando.", counts: ["Póliza de Workers' Compensation", "Certificado de seguro (COI)", "Exención del estado, si no lo necesitas"], tip: "Si trabajas solo, no hace falta." } },
    { id: "a1000000-0000-4000-8000-000000000011", name: "Otros permisos, licencias o certificaciones de su actividad", required: false, only_if_llc: false, verified_hint: "Certificación del fabricante vigente", archived: false,
      help: { what: "Cualquier otro permiso o certificado que tengas para tu oficio.", counts: ["Certificación de un fabricante", "Permiso especial de la ciudad", "Curso o licencia de tu oficio"], tip: "Es opcional: súbelo solo si lo tienes." } },
  ],
  // Melany, 20 Oct: no friction, nothing to prepare.
  intake_help_text: "No hace falta un documento armado: sirve una captura o una foto legible.",
  owner_nda_template: DEFAULT_OWNER_NDA_TEMPLATE,
};
/** Statuses that don't count toward the program total. */
const EXCLUDED = new Set(["cancelled", "with_third_party", "excluded"]);

/**
 * Ready to franchise only if BOTH: approved/program tasks >= goal, and every required task is approved.
 * A required code with no task in the program counts as missing. An empty list means only the % matters.
 */
export function computeFranchisability(business: Business,
  tasks: Task[],
  rules: FranchisabilityRules = DEFAULT_FRANCHISABILITY_RULES,
): Franchisability {
  const program = tasks.filter((t) => t.business_id === business.id && !EXCLUDED.has(t.status));
  const approved = program.filter((t) => t.status === "accepted");
  const goal = rules.goal;
  const required = rules.required_task_codes;
  const approvedCodes = new Set(approved.map((t) => t.code));
  const missing = required.filter((c) => !approvedCodes.has(c));
  const pct = program.length ? Math.round((approved.length / program.length) * 100) : 0;
  return {
    business_id: business.id,
    franchisability_pct: pct,
    franchisability_goal: goal,
    required_task_codes: required,
    missing_required: missing,
    is_ready: pct >= goal && missing.length === 0,
  };
}
