// Sections of the franchisor manual: which catalog tasks feed each one and what it says.
// Every code exists in src/data/catalogo_metodo180.json and belongs to one section only (see network.test.ts).
// Replaceable sample data: the real texts are written by each business with its firms.
import type { ManualSection } from "../types";

export interface ManualSectionDef {
  title: string;
  /** Catalog tasks whose results are the procedures and formats of this section. */
  catalog_codes: string[];
  /** Purpose and key steps. Paragraphs are separated by a blank line. */
  body: string;
}

export const MANUAL_SECTION_DEFS: ManualSectionDef[] = [
  {
    title: "Ventas",
    // B5-01 positioning, B5-06 commercial process, B5-14 materials kit, B5-15 funnel, B2-06 quoting system.
    catalog_codes: ["B5-01", "B5-06", "B5-14", "B5-15", "B2-06"],
    body: [
      "Para qué sirve: explica cómo el negocio consigue clientes y cómo cierra una venta, siempre con el mismo método.",
      "Pasos clave: 1. Responder a cada prospecto en menos de un día. 2. Entender qué necesita antes de dar un precio. 3. Preparar la cotización con el sistema de estimación. 4. Dar seguimiento a las dos y a las cuatro semanas. 5. Registrar el resultado de cada venta.",
      "Todo material para el cliente sale del kit comercial aprobado. No se usan textos ni precios propios.",
    ].join("\n\n"),
  },
  {
    title: "Operación",
    // B2-01 core system, B2-02 TO-BE processes, B2-03 source manual and SOPs, B2-07 change orders, B2-08 QA/QC, B2-09 safety.
    catalog_codes: ["B2-01", "B2-02", "B2-03", "B2-07", "B2-08", "B2-09"],
    body: [
      "Para qué sirve: describe cómo se hace el trabajo del día a día para que salga igual en cada local o cuadrilla.",
      "Pasos clave: 1. Seguir el procedimiento escrito de cada tarea crítica. 2. Revisar la calidad en cada punto de control antes de pasar a la siguiente etapa. 3. Registrar cualquier cambio de alcance y pedir la aprobación del cliente por escrito. 4. Cumplir las normas de seguridad del oficio. 5. Cerrar cada trabajo con su lista de pendientes y su garantía.",
      "Si algo no está en el manual, se consulta a la franquiciadora antes de improvisar.",
    ].join("\n\n"),
  },
  {
    title: "Compras",
    // B4-03 inventory control, B2-16 subcontracting policy.
    catalog_codes: ["B4-03", "B2-16"],
    body: [
      "Para qué sirve: define cómo se compra, qué proveedores se usan y cuándo se contrata a un tercero.",
      "Pasos clave: 1. Comprar solo a proveedores aprobados. 2. Pedir el material según el mínimo de inventario, nunca por costumbre. 3. Contar el inventario cada semana y anotar las diferencias. 4. Contratar a un tercero solo cuando falta capacidad o cobertura, y con la autorización de la franquiciadora.",
      "Los precios y las condiciones de cada proveedor se revisan cada seis meses.",
    ].join("\n\n"),
  },
  {
    title: "Atención al cliente",
    // B4-04 service orders and customer experience.
    catalog_codes: ["B4-04"],
    body: [
      "Para qué sirve: fija cómo se atiende a cada cliente desde que pide un servicio hasta que queda conforme.",
      "Pasos clave: 1. Abrir una orden de servicio por cada pedido. 2. Avisar al cliente cuándo llegará el equipo. 3. Dejar constancia de lo que se hizo al terminar. 4. Preguntar al cliente cómo le fue en las 48 horas siguientes. 5. Responder cada reclamo en menos de un día.",
      "Un reclamo bien resuelto vale más que una venta nueva. Se anota siempre, aunque parezca menor.",
    ].join("\n\n"),
  },
  {
    title: "Administración",
    // B3-01 financial data room, B3-02 job costing, B3-11 tax calendar, B3-16 accounting setup, B6-15 governance, B4-08 basic security.
    catalog_codes: ["B3-01", "B3-02", "B3-11", "B3-16", "B6-15", "B4-08"],
    body: [
      "Para qué sirve: ordena el dinero, los impuestos y los documentos del negocio para que siempre estén al día.",
      "Pasos clave: 1. Cerrar la contabilidad de cada mes antes del día 10. 2. Calcular lo que costó y lo que ganó cada trabajo. 3. Cumplir el calendario de impuestos de Estados Unidos. 4. Guardar los documentos de la empresa en un solo lugar con copia de respaldo. 5. Limitar el acceso a las cuentas a quien lo necesita.",
      "Cada franquicia reporta sus ventas antes del día 5 de cada mes.",
    ].join("\n\n"),
  },
  {
    title: "Personas",
    // B2-04 training, B2-05 org chart and roles, B2-17 recruiting, B3-15 employer tax setup.
    catalog_codes: ["B2-04", "B2-05", "B2-17", "B3-15"],
    body: [
      "Para qué sirve: explica quién hace qué, cómo se contrata y cómo se forma a cada persona del equipo.",
      "Pasos clave: 1. Dejar por escrito el rol y las responsabilidades de cada puesto. 2. Contratar con el perfil y la entrevista definidos. 3. Completar la capacitación inicial antes del primer turno solo. 4. Evaluar al equipo cada trimestre. 5. Mantener al día el alta de empleados y los impuestos de empleador.",
      "Una persona certificada en los procedimientos puede entrenar a las demás.",
    ].join("\n\n"),
  },
];

/** Titles in the order the manual shows them. */
export const MANUAL_SECTION_TITLES = MANUAL_SECTION_DEFS.map((d) => d.title);

/** Section content for a business: the catalog mapping always, the text only once the section was started. */
export const manualSectionContent = (title: string, status: ManualSection["status"]): Pick<ManualSection, "catalog_codes" | "body"> => {
  const def = MANUAL_SECTION_DEFS.find((d) => d.title === title);
  return { catalog_codes: def ? [...def.catalog_codes] : [], body: def && status !== "not_started" ? def.body : "" };
};
