import { describe, expect, it } from "vitest";
import { emptyNewOfficeForm, suggestedOfficeName, toCreateOfficeInput, validateNewOffice } from "./form";

const valid = { name: "SM Tampa", city: "Tampa, FL", manager_name: "Natalia Escobar", manager_email: "natalia@strategicmates.com", planned_opening_date: "2026-11-02" };

describe("new office form", () => {
  it("accepts a complete form", () => expect(validateNewOffice(valid, "2026-10-14")).toEqual({}));

  it("asks for every field, the name apart from the city", () => {
    expect(validateNewOffice(emptyNewOfficeForm(), "2026-10-14")).toEqual({
      name: "name_required", city: "city_required", manager_name: "manager_required", manager_email: "invalid_email", planned_opening_date: "invalid_date",
    });
    expect(validateNewOffice({ ...valid, name: "  " }, "2026-10-14")).toEqual({ name: "name_required" });
  });

  it("rejects an email without domain and an opening date in the past", () => {
    const errors = validateNewOffice({ ...valid, manager_email: "natalia@", planned_opening_date: "2026-10-13" }, "2026-10-14");
    expect(errors).toEqual({ manager_email: "invalid_email", planned_opening_date: "invalid_date" });
    expect(validateNewOffice({ ...valid, planned_opening_date: "2026-10-14" }, "2026-10-14")).toEqual({});
  });

  it("suggests the name from the city, and trims the text before sending it", () => {
    expect(suggestedOfficeName("Tampa, FL")).toBe("SM Tampa");
    expect(suggestedOfficeName("  ")).toBe("");
    expect(toCreateOfficeInput({ ...valid, name: " SM Tampa ", city: "  Tampa, FL ", manager_email: " natalia@strategicmates.com " })).toEqual(valid);
  });
});
