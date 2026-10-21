import type { Business, Franchisability, FranchisabilityRules, IntakeDocRule, PlatformRules, Task } from "./types";

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
/** An entry document of the default list: id suffix, name, sample verified fact, "Alcance de la entrega". */
const doc = (n: string, name: string, verified_hint: string, what: string, required = true): IntakeDocRule => ({
  id: `a1000000-0000-4000-8000-000000000${n}`, name, required, only_if_llc: false, verified_hint, archived: false,
  help: { what, counts: [], tip: "" },
});

/** "Indicaciones para preparar la entrega" of Strategic Mates' document list, one paragraph per block. */
export const DEFAULT_INTAKE_HELP_TEXT = [
  "Envíe archivos completos y legibles, numerados según el listado. Si ya entregó un documento, indíquelo; solo se pedirá nuevamente si requiere actualización o aclaración.",
  "Si un documento no existe, no está disponible o no aplica, indíquelo y explique el motivo. No debe crear manuales, procesos ni presentaciones para esta entrega. Las carencias se revisarán en el diagnóstico y se abordarán según el alcance de la intervención.",
  "Puede usar reportes o listados sencillos con los soportes disponibles. Si el negocio tiene menos antigüedad que el periodo solicitado, entregue desde su inicio. No envíe contraseñas ni credenciales de acceso.",
].join("\n\n");

/** Seed values of the rules repository. Components read the live rules through useRules(), never this constant. */
export const DEFAULT_PLATFORM_RULES: PlatformRules = {
  franchisability_goal: DEFAULT_FRANCHISABILITY_GOAL,
  required_task_codes: DEFAULT_REQUIRED_TASK_CODES,
  area_amber_days: DEFAULT_AREA_AMBER_DAYS,
  franchisability_amber_tolerance: DEFAULT_AMBER_TOLERANCE_POINTS,
  document_review_days: 15,
  program_amount: 150_000,
  // Entry documents: Strategic Mates' "Documentación para el Método 180", first stage (calificación y vinculación,
  // 20 Oct 2026): the 13 documents in its order plus the optional "Documentación adicional según la actividad". Ids of
  // the documents kept from the earlier list stay the same (the API's seed keys: constitution, operating_agreement,
  // irs_ein_letter, business_tax_receipt, tax_returns, financial_statements, bank_statements, sales_by_client,
  // last_three_jobs); help.what is the document's "Alcance de la entrega". SM Global edits them in Reglas.
  // verified_hint is sample data of the mock only (the API seeds it empty: the consultant writes the fact).
  intake_documents: [
    doc("002", "Constitución y vigencia", "LLC activa en Florida desde 2016",
      "Documento de constitución, último Annual Report exigible y registro del nombre comercial, si corresponde."),
    doc("004", "Propiedad y representación", "Dueño con 100 % de la LLC",
      "Operating Agreement o documento equivalente que identifique propietarios, participaciones y facultades de quien firmará. Identificación del firmante. Si esos datos no constan, adjunte una relación complementaria."),
    doc("003", "Identificación fiscal", "EIN verificado", "Carta o constancia del IRS que indique el EIN de la empresa."),
    doc("005", "Licencias y registros", "Licencia vigente hasta 09/2027",
      "Business Tax Receipt y demás licencias o registros aplicables a su domicilio y actividad. Permisos de trabajos específicos, cuando correspondan."),
    doc("006", "Declaraciones de impuestos", "Declaración 2025 presentada",
      "Últimas dos declaraciones federales presentadas, o las disponibles según la antigüedad. Para obligaciones estatales y locales aplicables, última declaración exigible y soporte de presentación o pago. Informe periodos pendientes y acuerdos de pago."),
    doc("008", "Estados financieros", "Margen neto del 18 % en 2025",
      "Estado de resultados mensual del último ejercicio cerrado y del año en curso. Balance general al cierre de ese ejercicio y al corte más reciente disponible."),
    doc("001", "Cuentas bancarias", "USD 320.000 en 6 meses",
      "Estados de cuenta de los últimos seis meses de las cuentas utilizadas en la operación. Indique si alguna también incluye movimientos personales."),
    doc("009", "Ventas por cliente", "38 clientes en 12 meses, ninguno pasa del 15 %",
      "Reporte de los últimos doce meses con fecha, cliente y valor de las ventas. Puede reutilizar un reporte entregado en otro punto si contiene esta información."),
    doc("012", "Cuentas pendientes y deudas", "Sin obligaciones vencidas",
      "Reportes actualizados de cuentas por cobrar y por pagar, con saldos y vencimientos. Relación de préstamos y financiamientos con saldo, cuota y garantías comprometidas. Identifique obligaciones vencidas; si no existen, indíquelo."),
    doc("013", "Pedidos y anticipos", "Cuatro obras contratadas por USD 85.000",
      "Relación de pedidos, contratos o servicios pendientes, con valor contratado, anticipo recibido, saldo por cobrar y costos o pagos pendientes asociados."),
    doc("010", "Tres operaciones completadas", "Tres obras entregadas en 2026, con cotización y cobro",
      "Para tres ventas, trabajos o servicios recientes y representativos: cotización, pedido o contrato aceptado, factura o comprobante de venta, soporte de cobro y costos directos asociados (personal, contratistas, productos, materiales o insumos, según corresponda). Identifique el trabajo realizado por el dueño, aunque no se pague un sueldo."),
    doc("014", "Personal y seguros", "Seis personas; Workers' Compensation vigente",
      "Relación de empleados y contratistas con función, modalidad de vinculación y remuneración o costo; último resumen de nómina, si aplica. Póliza de responsabilidad civil y soporte de Workers’ Compensation o exención, cuando corresponda. Los expedientes y acuerdos individuales se solicitarán posteriormente, salvo que sean necesarios para aclarar una situación relevante en esta etapa."),
    doc("015", "Contingencias relevantes", "Sin litigios ni reclamaciones declarados",
      "Declaración firmada sobre litigios, reclamaciones, multas, accidentes y obligaciones pendientes que puedan afectar al negocio. Adjunte los soportes y contratos relacionados cuando existan. Si no hay contingencias, declárelo expresamente."),
    doc("011", "Documentación adicional según la actividad", "Certificación del fabricante vigente",
      "Si su negocio cuenta con licencias, permisos, registros, certificaciones u otros documentos específicos de su actividad que no estén incluidos en este listado, indíquelos y adjunte los disponibles. Strategic Mates podrá solicitar documentación complementaria según las características del negocio.",
      false),
  ],
  // "Indicaciones para preparar la entrega" of the same document.
  intake_help_text: DEFAULT_INTAKE_HELP_TEXT,
  // Who can enter: the declared annual revenue (the year of operation is a hard rule of the assessment itself).
  eligibility: { min_annual_revenue: 250_000 },
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
