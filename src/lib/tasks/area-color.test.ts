import { describe, expect, it } from "vitest";
import { AREAS } from "./owner";
import { areaColorVar, areaTintVar } from "./area-color";

describe("areaColorVar", () => {
  it("maps each area code to its own css token", () => {
    expect(AREAS.map(areaColorVar)).toEqual([
      "var(--area-b1)", "var(--area-b2)", "var(--area-b3)", "var(--area-b4)", "var(--area-b5)", "var(--area-b6)",
    ]);
  });

  it("builds a soft tint from the same token", () => {
    expect(areaTintVar("B4")).toContain("var(--area-b4)");
    expect(areaTintVar("B4")).toContain("var(--surface)");
  });
});
