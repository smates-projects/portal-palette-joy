import { describe, expect, it } from "vitest";
import type { BishopInvestment } from "@/lib/api/types";
import { buildRecoveryRows, recoveryGap, sortByDecision } from "./recovery";

const investment = (recovery: BishopInvestment["recovery"]) => ({ recovery }) as BishopInvestment;

describe("buildRecoveryRows", () => {
  it("adds investments month by month and keeps future months without real data", () => {
    const rows = buildRecoveryRows([
      investment([
        { month: "2026-09", projected: 100, actual: 90 },
        { month: "2026-10", projected: 200, actual: null },
      ]),
      investment([{ month: "2026-09", projected: 50, actual: 60 }]),
    ]);
    expect(rows).toEqual([
      { month: "2026-09", projected: 150, actual: 150 },
      { month: "2026-10", projected: 200, actual: null },
    ]);
  });
});

describe("recoveryGap", () => {
  it("is negative when the real recovery is behind the projection", () => {
    expect(recoveryGap([{ month: "2026-09", projected: 100, actual: 80 }, { month: "2026-10", projected: 200, actual: null }])).toBe(-20);
  });

  it("is null when nothing was recovered yet", () => {
    expect(recoveryGap([{ month: "2026-10", projected: 200, actual: null }])).toBeNull();
  });
});

describe("sortByDecision", () => {
  it("puts undecided first and passed last", () => {
    const sorted = sortByDecision([{ decision: "passed" as const }, { decision: "none" as const }, { decision: "interested" as const }]);
    expect(sorted.map((s) => s.decision)).toEqual(["none", "interested", "passed"]);
  });
});
