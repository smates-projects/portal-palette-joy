import { describe, expect, it } from "vitest";
import { emptyNewOfficeForm, toCreateOfficeInput, validateNewOffice } from "./form";

const valid = { city: "Tampa, FL", manager_name: "Natalia Escobar", manager_email: "natalia@strategicmates.com", planned_opening_date: "2026-11-02" };

describe("new office form", () => {
  it("accepts a complete form", () => expect(validateNewOffice(valid, "2026-10-14")).toEqual({}));

  it("asks for every field", () => {
    expect(validateNewOffice(emptyNewOfficeForm(), "2026-10-14")).toEqual({
      city: "city_required", manager_name: "manager_required", manager_email: "invalid_email", planned_opening_date: "invalid_date",
    });
  });

  it("rejects an email without domain and an opening date in the past", () => {
    const errors = validateNewOffice({ ...valid, manager_email: "natalia@", planned_opening_date: "2026-10-13" }, "2026-10-14");
    expect(errors).toEqual({ manager_email: "invalid_email", planned_opening_date: "invalid_date" });
    expect(validateNewOffice({ ...valid, planned_opening_date: "2026-10-14" }, "2026-10-14")).toEqual({});
  });

  it("trims the text before sending it", () => {
    expect(toCreateOfficeInput({ ...valid, city: "  Tampa, FL ", manager_email: " natalia@strategicmates.com " })).toEqual(valid);
  });
});
