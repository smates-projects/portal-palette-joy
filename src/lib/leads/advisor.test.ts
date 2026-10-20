import { describe, expect, it } from "vitest";
import { advisorAssessmentUrl } from "./advisor";

describe("advisor assessment link", () => {
  it("is the public assessment with ?asesor=<slug>, or nothing without a slug", () => {
    expect(advisorAssessmentUrl("nicolas")).toBe("https://strategicmates.com/assessment?asesor=nicolas");
    expect(advisorAssessmentUrl(" maria jose ")).toBe("https://strategicmates.com/assessment?asesor=maria%20jose");
    expect(advisorAssessmentUrl(null)).toBeNull();
    expect(advisorAssessmentUrl("  ")).toBeNull();
  });
});
