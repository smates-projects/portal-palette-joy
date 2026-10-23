import { describe, expect, it } from "vitest";
import { schedulingDays } from "./scheduling-days";

const day = (date: string) => ({ day: date, slots: [{ starts_at: `${date}T14:00:00Z`, ends_at: `${date}T14:30:00Z` }] });

describe("day picker", () => {
  it("shows every day the API returned with free times (the API applies the rule's weekdays)", () => {
    expect(schedulingDays([day("2026-10-23"), day("2026-10-24"), day("2026-10-26")]).map((d) => d.day))
      .toEqual(["2026-10-23", "2026-10-24", "2026-10-26"]);
  });

  it("does not show days without free times", () => {
    expect(schedulingDays([{ day: "2026-10-23", slots: [] }, day("2026-10-26")]).map((d) => d.day)).toEqual(["2026-10-26"]);
  });

  it("never cuts the API's window", () => {
    const days = Array.from({ length: 21 }, (_, i) => day(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)));
    expect(schedulingDays(days)).toHaveLength(21);
  });
});
