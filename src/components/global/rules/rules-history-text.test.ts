import { describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { rulesFieldLabel, rulesValueText, weekdaysText } from "./rules-history-text";

const t = (key: string, values?: Record<string, unknown>) => i18n.t(key, { ...values, lng: "es" });
const show = (field: string, value: unknown) => rulesValueText(field, value, t, "es");

describe("rules history text (QA M4)", () => {
  it("participation ranges read as ranges, never NaN points, with the field's name", () => {
    const ranges = { owner: { min: 50, max: 75 }, bishop: { min: 15, max: 40 }, sm: { min: 10, max: 10 } };
    expect(show("equity_ranges", ranges)).toBe("dueño 50-75 %, inversor 15-40 %, SM Square 10 %");
    expect(rulesFieldLabel("equity_ranges", t)).toBe("Rangos de participación");
  });

  it("meeting hours name their days, so a weekday change shows", () => {
    const before = show("meeting_hours", { start: "09:00", end: "18:00", timezone: "America/New_York", weekdays: [1, 2, 3, 4, 5] });
    const after = show("meeting_hours", { start: "09:00", end: "18:00", timezone: "America/New_York", weekdays: [1, 2, 3, 4, 5, 6] });
    expect(before).not.toBe(after);
    expect(after).toContain(weekdaysText([1, 2, 3, 4, 5, 6], "es"));
    expect(weekdaysText([6, 1], "en")).toBe("Mon, Sat");
  });

  it("a field or a value the front does not know reads as words, never a raw key", () => {
    expect(rulesFieldLabel("brand_new_rule", t)).toBe("Brand new rule");
    expect(show("brand_new_rule", { min_days: 3, enabled: true })).toBe(`Min days: 3; Enabled: ${t("entry.rules.flow.yes")}`);
    expect(show("brand_new_rule", 12)).toBe("12");
    expect(show("franchisability_amber_tolerance", 5)).toMatch(/^5 /);
  });
});
