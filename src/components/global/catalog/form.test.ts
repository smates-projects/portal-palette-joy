import { describe, expect, it } from "vitest";
import type { CatalogAdminItem } from "@/lib/api/network-types";
import { changedFields, emptyForm, formFromItem, previousValues, toInput, validateForm } from "./form";

const item: CatalogAdminItem = {
  code: "B6-01", area: "legal", area_code: "B6", name: "Registro de marca", owner: "Legal", support: "Estrategia", applies: "Siempre",
  priority: "minimo", acceptance: "Marca registrada", start_day: 10, due_day: 40, archived: false, updated_at: "2026-10-01T10:00:00Z",
};

describe("validateForm", () => {
  it("requires a name and an acceptance criterion", () => {
    expect(validateForm(emptyForm("B1"))).toEqual({ name: "required", acceptance: "required" });
  });
  it("accepts empty days and days inside the program", () => {
    const form = { ...formFromItem(item), start_day: "", due_day: "" };
    expect(validateForm(form)).toEqual({});
    expect(validateForm({ ...form, start_day: "1", due_day: "180" })).toEqual({});
  });
  it("rejects days outside 1 to 180 or with decimals", () => {
    expect(validateForm({ ...formFromItem(item), start_day: "0" }).start_day).toBe("invalid_day");
    expect(validateForm({ ...formFromItem(item), due_day: "181" }).due_day).toBe("invalid_day");
    expect(validateForm({ ...formFromItem(item), due_day: "12.5" }).due_day).toBe("invalid_day");
  });
  it("rejects a due day before the start day", () => {
    expect(validateForm({ ...formFromItem(item), start_day: "50", due_day: "40" }).due_day).toBe("invalid_window");
  });
});

describe("toInput and changedFields", () => {
  it("turns text days into numbers or null and trims text", () => {
    const input = toInput({ ...formFromItem(item), name: "  Nuevo  ", start_day: "", due_day: "30" });
    expect(input).toMatchObject({ name: "Nuevo", start_day: null, due_day: 30 });
  });
  it("sends only what changed and never the area", () => {
    const input = toInput({ ...formFromItem(item), name: "Otro nombre", area_code: "B1", due_day: "45" });
    expect(changedFields(item, input)).toEqual({ name: "Otro nombre", due_day: 45 });
  });
  it("sends nothing when the form was not changed", () => {
    expect(changedFields(item, toInput(formFromItem(item)))).toEqual({});
  });
  it("keeps the stored values to undo an edit", () => {
    expect(previousValues(item, { name: "Otro", due_day: 45 })).toEqual({ name: "Registro de marca", due_day: 40 });
  });
});
