import { describe, expect, it } from "vitest";
import { acceptBlock, opportunityPhase, type OpportunityInput } from "./opportunity";

const base: OpportunityInput = { stage: "documents", nda_signed: true, mou_signed: true, bishop_user_id: null, tripartite: "none" };
const ME = "me";

describe("opportunity phase", () => {
  it("is hidden until NDA and MOU are signed by both", () => {
    expect(opportunityPhase({ ...base, mou_signed: false }, ME)).toBeNull();
    expect(opportunityPhase(base, ME)).toBe("in_review");
  });
  it("is available once documents are approved and nobody took it", () => {
    expect(opportunityPhase({ ...base, stage: "accepted" }, ME)).toBe("available");
  });
  it("disappears for the other Bishops once one accepts it", () => {
    expect(opportunityPhase({ ...base, stage: "accepted", bishop_user_id: "other" }, ME)).toBeNull();
    expect(opportunityPhase({ ...base, stage: "accepted", bishop_user_id: ME }, ME)).toBe("accepted_by_you");
  });
  it("follows the tripartite contract", () => {
    expect(opportunityPhase({ ...base, stage: "accepted", bishop_user_id: ME, tripartite: "pending" }, ME)).toBe("in_contract");
    expect(opportunityPhase({ ...base, stage: "accepted", bishop_user_id: ME, tripartite: "signed" }, ME)).toBe("funds_pending");
  });
  it("is hidden in program and when discarded", () => {
    expect(opportunityPhase({ ...base, stage: "in_program" }, ME)).toBeNull();
    expect(opportunityPhase({ ...base, stage: "discarded" }, ME)).toBeNull();
  });
  it("can be accepted only when available and with the framework agreement signed", () => {
    expect(acceptBlock("available", false)).toBe("framework");
    expect(acceptBlock("in_review", true)).toBe("in_review");
    expect(acceptBlock("available", true)).toBeNull();
  });
});
