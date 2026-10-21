import { todayIso } from "@/lib/clock";
import type { CreateOfficeInput } from "@/lib/api/network-types";

// Pure rules of the "Nueva oficina" form. The data layer checks the same things again, as the server will.

export interface NewOfficeForm {
  /** The office's own name ("SM Tampa"), apart from its city. */
  name: string;
  city: string;
  manager_name: string;
  manager_email: string;
  planned_opening_date: string;
}

export type NewOfficeError = "name_required" | "city_required" | "manager_required" | "invalid_email" | "invalid_date";
export type NewOfficeErrors = Partial<Record<keyof NewOfficeForm, NewOfficeError>>;

export const emptyNewOfficeForm = (): NewOfficeForm => ({ name: "", city: "", manager_name: "", manager_email: "", planned_opening_date: "" });

export function validateNewOffice(form: NewOfficeForm, today: string = todayIso()): NewOfficeErrors {
  const errors: NewOfficeErrors = {};
  if (!form.name.trim()) errors.name = "name_required";
  if (!form.city.trim()) errors.city = "city_required";
  if (!form.manager_name.trim()) errors.manager_name = "manager_required";
  if (!/^\S+@\S+\.\S+$/.test(form.manager_email.trim())) errors.manager_email = "invalid_email";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.planned_opening_date) || form.planned_opening_date < today) errors.planned_opening_date = "invalid_date";
  return errors;
}

/** "Tampa, FL" → "SM Tampa": the suggestion the name field starts with until the person types one. */
export const suggestedOfficeName = (city: string): string => {
  const first = city.split(",")[0]?.trim() ?? "";
  return first ? `SM ${first}` : "";
};

export const toCreateOfficeInput = (form: NewOfficeForm): CreateOfficeInput => ({
  name: form.name.trim(),
  city: form.city.trim(),
  manager_name: form.manager_name.trim(),
  manager_email: form.manager_email.trim(),
  planned_opening_date: form.planned_opening_date,
});
