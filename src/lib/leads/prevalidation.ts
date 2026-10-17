// What the business already has done. The program is still 180 days and the price does not change: there are only
// fewer tasks to do. Pure rules shared by the mock and the screens.
import type { AreaCode, AssessmentAreaMap, LeadResult, PreValidationInput, Task } from "@/lib/api/types";
import { ASSESSMENT_BLOCKS } from "@/lib/api/types";

/** Block of the assessment → areas of the program. SM Global edits it in Reglas. */
export const DEFAULT_ASSESSMENT_AREA_MAP: AssessmentAreaMap = {
  time_team: ["B2"],
  work_quality: ["B2"],
  money: ["B3"],
  clients_sales: ["B5"],
  information: ["B4", "B6"],
  experience: ["B2"],
  direction: ["B1"],
};

/** Areas whose tasks start as "A validar": those mapped from a block the assessment rated strong. */
export function strongAreas(blocks: LeadResult["blocks"], map: AssessmentAreaMap = DEFAULT_ASSESSMENT_AREA_MAP): AreaCode[] {
  const areas = new Set<AreaCode>();
  for (const b of blocks) if (b.status === "strong") for (const a of map[b.key] ?? []) areas.add(a);
  return [...areas].sort();
}

/**
 * When the program starts: every task not started yet of a strong area gets "A validar: el negocio ya lo tendría".
 * Tasks already moving or approved are left alone.
 */
export function markPreValidation<T extends Pick<Task, "area" | "status" | "pre_validation">>(tasks: T[], areas: AreaCode[]): T[] {
  const strong = new Set(areas);
  return tasks.map((t) => (strong.has(t.area) && t.status === "pending" && !t.pre_validation ? { ...t, pre_validation: "pending" as const } : t));
}

export type PreValidationError = "not_marked" | "evidence_required" | "not_resolved";

/**
 * The consultant decides with the owner during the Diagnóstico. "Ya lo tenía" needs the evidence the owner shows and
 * works on any task not started yet, marked by the assessment or not (SM can see in the meeting that marketing is
 * already solved even if the assessment did not flag it). "Hay que hacerla" only answers a task marked "A validar".
 * Undo only works on a decided task that nobody moved since.
 */
export function checkPreValidation(task: Pick<Task, "status" | "pre_validation">, input: PreValidationInput): PreValidationError | null {
  if (input.decision === "pending") {
    if (task.pre_validation === "existing") return task.status === "accepted" ? null : "not_resolved";
    if (task.pre_validation === "needed") return task.status === "pending" ? null : "not_resolved";
    return "not_resolved";
  }
  if (task.status !== "pending") return "not_marked";
  const marked = task.pre_validation === "pending";
  if (!marked && !(input.decision === "existing" && !task.pre_validation)) return "not_marked";
  if (input.decision === "existing" && !input.evidence_file_name.trim()) return "evidence_required";
  return null;
}

/** "Ya tenías resueltas N tareas: arrancas con X% de avance". X over the active tasks of the program. */
export function existingSummary(tasks: Pick<Task, "status" | "approval_source">[]): { count: number; total: number; pct: number } {
  const active = tasks.filter((t) => t.status !== "cancelled" && t.status !== "excluded" && t.status !== "with_third_party");
  const count = active.filter((t) => t.status === "accepted" && t.approval_source === "existing").length;
  return { count, total: active.length, pct: active.length ? Math.round((count / active.length) * 100) : 0 };
}

/** Checks a map edited in Reglas: every block present, areas valid and not repeated. */
export function validAreaMap(map: AssessmentAreaMap): boolean {
  const valid = new Set<AreaCode>(["B1", "B2", "B3", "B4", "B5", "B6"]);
  return ASSESSMENT_BLOCKS.every((b) => Array.isArray(map[b]) && map[b].every((a) => valid.has(a)) && new Set(map[b]).size === map[b].length);
}
