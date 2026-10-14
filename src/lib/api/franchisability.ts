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
/** Seed values of the rules repository. Components read the live rules through useRules(), never this constant. */
export const DEFAULT_PLATFORM_RULES: PlatformRules = {
  franchisability_goal: DEFAULT_FRANCHISABILITY_GOAL,
  required_task_codes: DEFAULT_REQUIRED_TASK_CODES,
  area_amber_days: DEFAULT_AREA_AMBER_DAYS,
  franchisability_amber_tolerance: DEFAULT_AMBER_TOLERANCE_POINTS,
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
