import type { CatalogAdminItem, CatalogItemInput } from "@/lib/api/network-types";
import type { AreaCode } from "@/lib/api/types";

export const PRIORITIES = ["minimo", "alto_valor", "opcional", "tercero", "fuera"] as const;
/** The program lasts 180 days: a task window has to fit inside it. */
export const PROGRAM_DAYS = 180;

/** Catalog form as typed: the two day fields stay text until they are validated. */
export interface CatalogForm {
  area_code: AreaCode;
  name: string;
  owner: string;
  support: string;
  applies: string;
  priority: string;
  acceptance: string;
  start_day: string;
  due_day: string;
}

export type CatalogFormErrors = Partial<Record<"name" | "acceptance" | "start_day" | "due_day", "required" | "invalid_day" | "invalid_window">>;

export const emptyForm = (area: AreaCode): CatalogForm => ({
  area_code: area, name: "", owner: "", support: "", applies: "", priority: "minimo", acceptance: "", start_day: "", due_day: "",
});

export const formFromItem = (item: CatalogAdminItem): CatalogForm => ({
  area_code: item.area_code,
  name: item.name,
  owner: item.owner,
  support: item.support,
  applies: item.applies,
  priority: item.priority,
  acceptance: item.acceptance,
  start_day: item.start_day === null ? "" : String(item.start_day),
  due_day: item.due_day === null ? "" : String(item.due_day),
});

/** "" means the task has no window of its own (the general rule applies); anything else must be a day of the program. */
const parseDay = (value: string): number | null | "invalid" => {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= PROGRAM_DAYS ? n : "invalid";
};

export function validateForm(form: CatalogForm): CatalogFormErrors {
  const errors: CatalogFormErrors = {};
  if (!form.name.trim()) errors.name = "required";
  if (!form.acceptance.trim()) errors.acceptance = "required";
  const start = parseDay(form.start_day);
  const due = parseDay(form.due_day);
  if (start === "invalid") errors.start_day = "invalid_day";
  if (due === "invalid") errors.due_day = "invalid_day";
  if (typeof start === "number" && typeof due === "number" && due < start) errors.due_day = "invalid_window";
  return errors;
}

/** Only call after validateForm returned no errors. */
export function toInput(form: CatalogForm): CatalogItemInput {
  const start = parseDay(form.start_day);
  const due = parseDay(form.due_day);
  return {
    area_code: form.area_code,
    name: form.name.trim(),
    owner: form.owner.trim(),
    support: form.support.trim(),
    applies: form.applies.trim(),
    priority: form.priority,
    acceptance: form.acceptance.trim(),
    start_day: start === "invalid" ? null : start,
    due_day: due === "invalid" ? null : due,
  };
}

const EDITABLE: (keyof CatalogItemInput)[] = ["name", "owner", "support", "applies", "priority", "acceptance", "start_day", "due_day"];

/** What changed against the stored entry (the area never changes). Empty when nothing changed. */
export function changedFields(item: CatalogAdminItem, input: CatalogItemInput): Partial<CatalogItemInput> {
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE) if (item[field] !== input[field]) patch[field] = input[field];
  return patch as Partial<CatalogItemInput>;
}

/** The same fields with the stored values, to undo an edit. */
export function previousValues(item: CatalogAdminItem, patch: Partial<CatalogItemInput>): Partial<CatalogItemInput> {
  const prev: Record<string, unknown> = {};
  for (const field of Object.keys(patch) as (keyof CatalogItemInput)[]) prev[field] = item[field as keyof CatalogAdminItem];
  return prev as Partial<CatalogItemInput>;
}
