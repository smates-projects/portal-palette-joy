import { describe, expect, it } from "vitest";
import { leads } from "@/lib/api/mock/seed-leads";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import { bandOf, eligibilityGaps, opennessKey, readinessOutcome } from "./readiness";

describe("Readiness outcome (same rules as the sm-platform assessment)", () => {
  it("less than 1 year operating is a gap: band track and readiness on_track", () => {
    expect(readinessOutcome({ years_range: "years_lt1", revenue_range: "250k_500k" }, 80)).toEqual({
      readiness: "on_track", band: "track", eligible_program: false, eligibility_gaps: ["years_operating"],
    });
  });
  it("1 to 2 years with declared sales is ready, with the band of the shown score", () => {
    expect(readinessOutcome({ years_range: "years_1_2", revenue_range: "lt_250k" }, 62)).toEqual({
      readiness: "ready", band: "mid", eligible_program: true, eligibility_gaps: [],
    });
    expect(eligibilityGaps({ years_range: "years_1_2", revenue_range: "1m_2m" })).toEqual([]);
  });
  it("the closing answer reads as a quiet line for the SM team; a lead without it shows nothing", () => {
    expect(opennessKey({ openness: "advance" })).toBe("pipeline.openness.advance");
    expect(opennessKey({ openness: "understand_first" })).toBe(
      "pipeline.openness.understand_first",
    );
    expect(opennessKey({ openness: null })).toBeNull();
    expect(opennessKey({})).toBeNull();
    expect(opennessKey(null)).toBeNull();
    expect(es.pipeline.openness).toEqual({
      advance: "Quiere conocer cómo avanzar",
      understand_first: "Quiere entender el proceso primero",
    });
    expect(en.pipeline.openness).toEqual({
      advance: "Wants to know how to move forward",
      understand_first: "Wants to understand the process first",
    });
    // The demo funnel has both answers and leads without one.
    expect(new Set(leads.map((l) => l.result?.openness ?? null))).toEqual(
      new Set(["advance", "understand_first", null]),
    );
  });

  it("bands follow the shown score minimums 70 / 55 / 0", () => {
    expect([92, 70, 69, 55, 54, 40].map(bandOf)).toEqual(["high", "high", "mid", "mid", "low", "low"]);
  });
  it("the sample leads are consistent: track only when not eligible, band within its minimums", () => {
    for (const l of leads) {
      const r = l.result!;
      expect(r.readiness).toBe(r.band === "track" ? "on_track" : "ready");
      expect(r.eligible_program).toBe(r.readiness === "ready");
      if (r.readiness === "ready") expect(r.band).toBe(bandOf(r.score));
      if (l.business.years_range === "years_lt1") expect(r.eligibility_gaps).toContain("years_operating");
    }
    expect(leads.some((l) => l.business.margin_range === null)).toBe(true);
  });
});
