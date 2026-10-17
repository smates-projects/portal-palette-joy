// Ficha del negocio: snapshot of the assessment, what is missing, and the milestones. Pure rules shared by the mock
// and the screens.
import type { AreaCode, AssessmentSnapshot, BusinessMilestone, Lead, TaskWithComputed } from "@/lib/api/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Area that works on a priority of the assessment, by its words. Today the assessment sends priorities as plain
 * text; when it sends the block of each one, the backend maps it with the same table as "Ya lo tenía".
 * Order matters: "marca registrada" is legal before "marca" is marketing.
 */
const PRIORITY_WORDS: [AreaCode, RegExp][] = [
  ["B6", /contrat|licenc|legal|seguro|marca registrada|permiso|acuerdo/],
  ["B3", /numero|costo|margen|precio|finanz|dinero|flujo|ganancia|presupuest/],
  ["B4", /herramient|sistema|agenda|software|tecnolog|cita|crm|digital/],
  ["B5", /marca|cliente|venta|presencia|redes|marketing/],
  ["B2", /proceso|manual|metodo|receta|operaci|equipo|rol|produccion|calidad|obra/],
];
export const priorityArea = (text: string): AreaCode => PRIORITY_WORDS.find(([, re]) => re.test(norm(text)))?.[0] ?? "B1";

/** Copy of the lead taken when it enters the program. It never changes afterwards. */
export function buildSnapshot(lead: Lead, businessId: string, takenAt: string): AssessmentSnapshot {
  return structuredClone({
    business_id: businessId,
    lead_id: lead.id,
    taken_at: takenAt,
    submitted_at: lead.submitted_at,
    contact: lead.contact,
    business: lead.business,
    result: lead.result,
    priorities: lead.result.priorities.map((text) => ({ text, area: priorityArea(text) })),
    know_how_example: lead.know_how_example,
  });
}

/** What the owner gets: the same copy without the score (and the band that comes from it). */
export const ownerSnapshot = (s: AssessmentSnapshot): AssessmentSnapshot => ({ ...s, result: { ...s.result, score: null, band: null } });

const live = (t: TaskWithComputed) => t.status !== "cancelled" && t.status !== "excluded" && t.status !== "with_third_party";

export interface MissingWork {
  /** Required to franchise and not approved yet, in code order. */
  required: TaskWithComputed[];
  overdue: TaskWithComputed[];
  blocked: TaskWithComputed[];
  /** Priorities of the assessment whose area still has unapproved tasks. */
  open_priorities: { text: string; area: AreaCode; open: number }[];
}

/** "Qué le falta": required tasks not approved, overdue and blocked ones, and the priorities still open. */
export function missingWork(tasks: TaskWithComputed[], requiredCodes: string[], priorities: AssessmentSnapshot["priorities"]): MissingWork {
  const mine = tasks.filter(live);
  const required = new Set(requiredCodes);
  const byCode = (a: TaskWithComputed, b: TaskWithComputed) => a.code.localeCompare(b.code);
  return {
    required: mine.filter((t) => required.has(t.code) && t.status !== "accepted").sort(byCode),
    overdue: mine.filter((t) => t.is_overdue).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    blocked: mine.filter((t) => t.is_blocked && t.status !== "accepted").sort(byCode),
    open_priorities: priorities.flatMap((p) => {
      const open = mine.filter((t) => t.area === p.area && t.status !== "accepted").length;
      return open > 0 ? [{ ...p, open }] : [];
    }),
  };
}

export interface MilestoneInput {
  snapshot: Pick<AssessmentSnapshot, "submitted_at"> | null;
  /** The booked meeting, or the day SM moved the lead to Reunión by hand. */
  meeting_at: string | null;
  contract_signed_at: string | null;
  program_started_at: string | null;
  consultant_changes: { id: string; at: string; from: string | null; to: string }[];
  firm_changes: { id: string; at: string; from: string | null; to: string | null; task_code: string; task_name: string }[];
  required_approved: { id: string; at: string; task_code: string; task_name: string }[];
}

/** Activity of the business, newest first. */
export function buildMilestones(i: MilestoneInput): BusinessMilestone[] {
  const base = { from: null, to: null, task_code: null, task_name: null };
  const list: BusinessMilestone[] = [
    ...(i.snapshot ? [{ ...base, id: "assessment", kind: "assessment" as const, at: i.snapshot.submitted_at }] : []),
    ...(i.meeting_at ? [{ ...base, id: "meeting", kind: "meeting" as const, at: i.meeting_at }] : []),
    ...(i.contract_signed_at ? [{ ...base, id: "contract", kind: "contract_signed" as const, at: i.contract_signed_at }] : []),
    ...(i.program_started_at ? [{ ...base, id: "start", kind: "program_started" as const, at: i.program_started_at }] : []),
    ...i.consultant_changes.map((c) => ({ ...base, id: c.id, kind: "consultant_changed" as const, at: c.at, from: c.from, to: c.to })),
    ...i.firm_changes.map((c) => ({ ...base, id: c.id, kind: "firm_changed" as const, at: c.at, from: c.from, to: c.to, task_code: c.task_code, task_name: c.task_name })),
    ...i.required_approved.map((c) => ({ ...base, id: c.id, kind: "required_approved" as const, at: c.at, task_code: c.task_code, task_name: c.task_name })),
  ];
  return list.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
