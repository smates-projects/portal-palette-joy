import type { AreaCode, IsoDate, LeadIndustry, Task, TaskStep, Uuid } from "./types";

/** One entry of the official Método 180 catalog (src/data/catalogo_metodo180.json). */
export interface CatalogEntry {
  code: string;
  area: string;
  name: string;
  applies: string;
  priority: string;
  acceptance: string;
  /** Set by SM Global (days relative to program day 1). When present they win over the default rule. */
  start_day?: number | null;
  due_day?: number | null;
}

export const AREA_BY_KEY: Record<string, AreaCode> = { estr: "B1", proc: "B2", fin: "B3", tec: "B4", marca: "B5", legal: "B6" };

/** Provisional program windows (days). The six areas run in parallel inside AREA_WINDOW. */
export const OPENING_GATE = { start: 1, end: 15 } as const;
export const AREA_WINDOW = { start: 16, end: 149 } as const;
export const CLOSING_GATE = { start: 150, end: 180 } as const;

const STEPS: TaskStep[] = ["survey", "design", "implement", "validate", "document"];
const CONSTRUCTION_ONLY = "Construcción / mantenimiento";

/** "applies" filter: entries limited to construction only go to construction and remodeling businesses. */
export const appliesTo = (entry: CatalogEntry, industry: LeadIndustry) =>
  entry.applies !== CONSTRUCTION_ONLY || industry === "construction" || industry === "remodeling";

export const addDaysIso = (iso: IsoDate, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Program day N (1-based) → calendar date. */
export const programDate = (start: IsoDate, dayN: number) => addDaysIso(start, dayN - 1);

/**
 * Default window of the i-th of n tasks of one area: the area window is split evenly in catalog order.
 * Step follows the position too (first fifth relevar … last fifth documentar).
 */
export function defaultWindow(i: number, n: number) {
  const len = AREA_WINDOW.end - AREA_WINDOW.start + 1;
  const start = AREA_WINDOW.start + Math.floor((i * len) / n);
  const due = AREA_WINDOW.start + Math.floor(((i + 1) * len) / n) - 1;
  return { start_day: start, due_day: Math.max(start, due), step: STEPS[Math.min(4, Math.floor((i * 5) / n))]! };
}

export interface ProgramInput {
  business_id: Uuid;
  industry: LeadIndustry;
  start_date: IsoDate;
  supervisor_user_id: Uuid;
  /** Assignee firm and person for each area. */
  firmFor: (area: AreaCode) => { organization_id: Uuid; assignee_user_id: Uuid };
  newId: () => Uuid;
  now: string;
}

/** Tasks of a new program: every "minimo" catalog entry that applies, name and criteria verbatim. */
export function generateProgramTasks(catalog: CatalogEntry[], input: ProgramInput): Task[] {
  const entries = catalog.filter((e) => e.priority === "minimo" && AREA_BY_KEY[e.area] && appliesTo(e, input.industry));
  const byArea = new Map<AreaCode, CatalogEntry[]>();
  for (const e of entries) {
    const a = AREA_BY_KEY[e.area]!;
    byArea.set(a, [...(byArea.get(a) ?? []), e]);
  }
  return entries.map((e) => {
    const area = AREA_BY_KEY[e.area]!;
    const list = byArea.get(area)!;
    const w = defaultWindow(list.indexOf(e), list.length);
    const startDay = e.start_day ?? w.start_day;
    const dueDay = Math.max(startDay, e.due_day ?? w.due_day);
    const firm = input.firmFor(area);
    return {
      id: input.newId(),
      code: e.code,
      name: e.name,
      acceptance_criteria: e.acceptance,
      area,
      step: w.step,
      status: "pending",
      business_id: input.business_id,
      organization_id: firm.organization_id,
      assignee_user_id: firm.assignee_user_id,
      supervisor_user_id: input.supervisor_user_id,
      depends_on_task_ids: [],
      start_date: programDate(input.start_date, startDay),
      due_date: programDate(input.start_date, dueDay),
      current_version: 0,
      updated_at: input.now,
    };
  });
}
