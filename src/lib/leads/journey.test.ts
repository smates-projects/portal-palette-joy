import { describe, expect, it } from "vitest";
import { collapseEvents, leadJourney, pendingBlock } from "./journey";

const lead = (over: Record<string, unknown>) => ({
  stage: "evaluated",
  discarded_from: null,
  submitted_at: "2026-10-01T10:00:00Z",
  stage_entered_at: "2026-10-01T10:00:00Z",
  bishop_user_id: null,
  tripartite: "none",
  intake: null,
  meeting: null,
  ...over,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

describe("leadJourney", () => {
  it("a fresh evaluated lead has only the assessment done and the reunion current", () => {
    const steps = leadJourney(lead({}));
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "pending", "pending", "pending", "pending", "pending", "pending"]);
    expect(steps[0]!.at).toBe("2026-10-01T10:00:00Z");
    expect(steps[1]!.at).toBeNull();
  });

  it("a lead in documents has the signed contracts dated and documentos current", () => {
    const steps = leadJourney(
      lead({ stage: "documents", intake: { nda_signed: true, mou_signed: true, approved_at: null } }),
      [
        { kind: "nda", signed_at: "2026-10-05" },
        { kind: "mou", signed_at: "2026-10-08" },
      ],
    );
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "current", "pending", "pending", "pending"]);
    expect(steps[2]!.at).toBe("2026-10-05");
    expect(steps[3]!.at).toBe("2026-10-08");
  });

  it("a lead in program has every step done, programa dated by the stage entry", () => {
    const steps = leadJourney(
      lead({ stage: "in_program", stage_entered_at: "2026-10-20T09:00:00Z", bishop_user_id: "u-b", tripartite: "signed" }),
      [],
      { bishop: { user_id: "u-b", name: "Laura", accepted_at: "2026-10-12T00:00:00Z" }, tripartite: { state: "signed", signed_at: "2026-10-15" } },
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps[5]!.at).toBe("2026-10-12T00:00:00Z");
    expect(steps[6]!.at).toBe("2026-10-15");
    expect(steps[7]!.at).toBe("2026-10-20T09:00:00Z");
  });

  it("a discarded lead reads from the stage it had when discarded", () => {
    const steps = leadJourney(lead({ stage: "discarded", discarded_from: "meeting", meeting: { starts_at: "2026-10-03T15:00:00Z", outcome: null } }));
    expect(steps[0]!.state).toBe("done");
    expect(steps[1]!.state).toBe("current");
    expect(steps[2]!.state).toBe("pending");
  });
});

describe("pendingBlock", () => {
  it("maps each action to its block", () => {
    expect(pendingBlock("meeting_outcome", false)).toBe("meeting");
    expect(pendingBlock("review_docs", false)).toBe("docs");
    expect(pendingBlock("approve_docs", false)).toBe("docs");
    expect(pendingBlock("send_nda", false)).toBe("contracts");
    expect(pendingBlock("send_mou", false)).toBe("contracts");
    expect(pendingBlock("record_funds", false)).toBe("funds");
    expect(pendingBlock("start_program", false)).toBe("funds");
    expect(pendingBlock("schedule", false)).toBeNull();
    expect(pendingBlock("view_program", false)).toBeNull();
  });

  it("an open validation goes first in Aceptado", () => {
    expect(pendingBlock("wait_investor", true)).toBe("validation");
    expect(pendingBlock("wait_investor", false)).toBe("investors");
    expect(pendingBlock("send_tripartite", true)).toBe("validation");
    expect(pendingBlock("send_tripartite", false)).toBe("contracts");
  });
});

describe("collapseEvents", () => {
  const ev = (id: string, kind: string, actor: string, at: string) => ({ id, kind, actor_user_id: actor, created_at: at });

  it("folds consecutive events of the same kind by the same person within five minutes", () => {
    const groups = collapseEvents([
      ev("1", "doc_accepted", "u1", "2026-10-14T10:54:00Z"),
      ev("2", "doc_accepted", "u1", "2026-10-14T10:52:00Z"),
      ev("3", "doc_accepted", "u1", "2026-10-14T10:50:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("keeps apart another person, another kind or a gap over five minutes", () => {
    const groups = collapseEvents([
      ev("1", "doc_accepted", "u1", "2026-10-14T10:54:00Z"),
      ev("2", "doc_accepted", "u2", "2026-10-14T10:53:00Z"),
      ev("3", "doc_requested", "u2", "2026-10-14T10:52:30Z"),
      ev("4", "doc_accepted", "u1", "2026-10-14T10:40:00Z"),
    ]);
    expect(groups.map((g) => g.map((e) => e.id))).toEqual([["1"], ["2"], ["3"], ["4"]]);
  });
});
