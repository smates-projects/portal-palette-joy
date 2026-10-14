import type { PlatformRules } from "@/lib/api/network-types";

/** Rules form as typed: numbers stay text until they are validated. */
export interface RulesForm {
  franchisability_goal: string;
  area_amber_days: string;
  franchisability_amber_tolerance: string;
  required_task_codes: string[];
}

export type RulesFormErrors = Partial<Record<"franchisability_goal" | "area_amber_days" | "franchisability_amber_tolerance", "invalid_goal" | "invalid_days" | "invalid_tolerance">>;

export const formFromRules = (rules: PlatformRules): RulesForm => ({
  franchisability_goal: String(rules.franchisability_goal),
  area_amber_days: String(rules.area_amber_days),
  franchisability_amber_tolerance: String(rules.franchisability_amber_tolerance),
  required_task_codes: [...rules.required_task_codes],
});

const wholeNumber = (value: string) => (value.trim() !== "" && Number.isInteger(Number(value)) ? Number(value) : null);

export function validateRules(form: RulesForm): RulesFormErrors {
  const errors: RulesFormErrors = {};
  const goal = wholeNumber(form.franchisability_goal);
  const days = wholeNumber(form.area_amber_days);
  const tolerance = wholeNumber(form.franchisability_amber_tolerance);
  if (goal === null || goal < 1 || goal > 100) errors.franchisability_goal = "invalid_goal";
  if (days === null || days < 1) errors.area_amber_days = "invalid_days";
  if (tolerance === null || tolerance < 0 || tolerance > 100) errors.franchisability_amber_tolerance = "invalid_tolerance";
  return errors;
}

/** Only the fields that changed against the stored rules. Call after validateRules returned no errors. */
export function rulesPatch(rules: PlatformRules, form: RulesForm): Partial<PlatformRules> {
  const patch: Partial<PlatformRules> = {};
  const goal = Number(form.franchisability_goal);
  const days = Number(form.area_amber_days);
  const tolerance = Number(form.franchisability_amber_tolerance);
  if (goal !== rules.franchisability_goal) patch.franchisability_goal = goal;
  if (days !== rules.area_amber_days) patch.area_amber_days = days;
  if (tolerance !== rules.franchisability_amber_tolerance) patch.franchisability_amber_tolerance = tolerance;
  const same = form.required_task_codes.length === rules.required_task_codes.length && form.required_task_codes.every((c) => rules.required_task_codes.includes(c));
  if (!same) patch.required_task_codes = form.required_task_codes;
  return patch;
}

/** The stored values of the fields in a patch, to undo a save. */
export function undoPatch(rules: PlatformRules, patch: Partial<PlatformRules>): Partial<PlatformRules> {
  const prev: Record<string, unknown> = {};
  for (const field of Object.keys(patch) as (keyof PlatformRules)[]) prev[field] = rules[field];
  return prev as Partial<PlatformRules>;
}

/** Add the code if it is not picked, remove it if it is. */
export const toggleCode = (codes: string[], code: string): string[] => (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]);
