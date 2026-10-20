import { describe, expect, it } from "vitest";
import type { Contract, LeadMeeting, Signer } from "@/lib/api/types";
import {
  ENTRY_RULE_DEFAULTS, acknowledgedAll, bishopSees, bookingKind, entryRules, missingAcknowledgments, ndaStatus, oaSendBlock,
  oaSignableFrom, oaWaitingUntil, outcomeBlock, outcomePending, ownerSteps, signBlock, validAcknowledgment,
} from "./entry-flow";

const ALL = ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"] as const;
const signer = (party: "owner" | "sm" | "bishop", status: Signer["status"], extra: Partial<Signer> = {}): Signer =>
  ({ name: party, role: party, party, status, signed_at: status === "signed" ? "2026-10-10" : null, ...extra });
const contract = (kind: Contract["kind"], signers: Signer[], extra: Partial<Contract> = {}): Contract => ({
  id: kind ?? "c", business_id: "b", area: "intake", kind, name: kind ?? "", state: "sent", sent_at: "2026-10-11", signed_at: null, signers, ...extra,
});
const meeting = (starts_at: string, extra: Partial<LeadMeeting> = {}): LeadMeeting => ({
  id: "m", kind: "initial", starts_at, duration_minutes: 30, meet_url: "https://meet.google.com/x", consultant_user_id: "c", booked_at: "2026-10-01T12:00:00Z",
  notes_at: null, outcome: null, outcome_prompted_at: null, ...extra,
});
const NOW = "2026-10-14T16:00:00Z";

describe("MOU acknowledgment gate", () => {
  it("needs the four points; the missing ones come back in order", () => {
    expect(missingAcknowledgments(["business_stays_yours"])).toEqual(["funds_finance_intervention", "franchisor_entity_participation", "do_it_together_no_debt"]);
    expect(acknowledgedAll([...ALL])).toBe(true);
    expect(acknowledgedAll(null)).toBe(false);
  });
  it("accepts exactly the four points, no repeats and nothing else", () => {
    expect(validAcknowledgment([...ALL])).toBe(true);
    expect(validAcknowledgment([...ALL.slice(0, 3), "business_stays_yours"])).toBe(false);
    expect(validAcknowledgment([...ALL, "extra"])).toBe(false);
  });
  it("blocks only the owner's signature of a MOU without the four points", () => {
    const mou = contract("mou", [signer("owner", "opened", { acknowledgments: ["business_stays_yours"] }), signer("sm", "signed")]);
    expect(signBlock(mou, "owner")).toBe("acknowledgment_required");
    expect(signBlock(mou, "sm")).toBeNull();
    expect(signBlock({ ...mou, signers: [signer("owner", "opened", { acknowledgments: [...ALL] })] }, "owner")).toBeNull();
    expect(signBlock(contract("nda", [signer("owner", "opened")]), "owner")).toBeNull();
  });
});

describe("Operating Agreement waiting period", () => {
  it("opens the signature the waiting days after it went out", () => {
    expect(oaSignableFrom("2026-10-11", 7)).toBe("2026-10-18");
    const oa = contract("tripartite", []);
    expect(oaWaitingUntil(oa, 7, "2026-10-14")).toBe("2026-10-18");
    expect(oaWaitingUntil(oa, 7, "2026-10-18")).toBeNull();
    expect(oaWaitingUntil(oa, 0, "2026-10-11")).toBeNull();
  });
  it("only applies to a sent Operating Agreement", () => {
    expect(oaWaitingUntil(contract("mou", []), 7, "2026-10-12")).toBeNull();
    expect(oaWaitingUntil(contract("tripartite", [], { sent_at: null }), 7, "2026-10-12")).toBeNull();
  });
  it("cannot go out without a Bishop, nor before the expansion meeting when the rule asks for it", () => {
    expect(oaSendBlock({ bishop_user_id: null }, ENTRY_RULE_DEFAULTS)).toBe("no_bishop");
    expect(oaSendBlock({ bishop_user_id: "j" }, ENTRY_RULE_DEFAULTS)).toBe("expansion_meeting_required");
    expect(oaSendBlock({ bishop_user_id: "j", expansion_meeting_held_at: "2026-10-08T16:00:00Z" }, ENTRY_RULE_DEFAULTS)).toBeNull();
    expect(oaSendBlock({ bishop_user_id: "j" }, { ...ENTRY_RULE_DEFAULTS, require_expansion_meeting: false })).toBeNull();
  });
});

describe("Bishop visibility rule", () => {
  it("presented: only what SM presented to him; all: every approved business", () => {
    expect(bishopSees("presented", false)).toBe(false);
    expect(bishopSees("presented", true)).toBe(true);
    expect(bishopSees("all", false)).toBe(true);
  });
  it("rules come with defaults when SM Global never set them", () => {
    expect(entryRules(undefined)).toEqual(ENTRY_RULE_DEFAULTS);
    expect(entryRules({ oa_waiting_days: 3 }).oa_waiting_days).toBe(3);
  });
});

describe("meeting outcome", () => {
  it("pending once the meeting ended without an answer", () => {
    expect(outcomePending(meeting("2026-10-14T15:00:00Z"), NOW)).toBe(true);
    expect(outcomePending(meeting("2026-10-14T15:45:00Z"), NOW)).toBe(false);
    expect(outcomePending(meeting("2026-10-14T15:00:00Z", { outcome: "held" }), NOW)).toBe(false);
  });
  it("answers once; held and no_show only after it started, reschedule any time", () => {
    expect(outcomeBlock(meeting("2026-10-14T15:00:00Z", { outcome: "held" }), "no_show", NOW)).toBe("outcome_already_set");
    expect(outcomeBlock(meeting("2026-10-15T15:00:00Z"), "held", NOW)).toBe("invalid_transition");
    expect(outcomeBlock(meeting("2026-10-15T15:00:00Z"), "reschedule", NOW)).toBeNull();
    expect(outcomeBlock(null, "held", NOW)).toBe("not_found");
  });
  it("a booking means the first meeting, a new one after no_show, or the expansion", () => {
    expect(bookingKind({ stage: "evaluated", meeting: null })).toBe("initial");
    expect(bookingKind({ stage: "meeting", meeting: meeting(NOW, { outcome: "no_show" }) })).toBe("rebook");
    expect(bookingKind({ stage: "meeting", meeting: meeting(NOW) })).toBeNull();
    expect(bookingKind({ stage: "accepted", meeting: null, expansion_meeting: null })).toBe("expansion");
    expect(bookingKind({ stage: "accepted", meeting: null, expansion_meeting_held_at: NOW })).toBeNull();
  });
});

describe("NDA status and owner steps", () => {
  it("firmado / pendiente / NDA propio por revisar", () => {
    expect(ndaStatus(contract("nda", [signer("owner", "signed"), signer("sm", "signed")]))).toBe("signed");
    expect(ndaStatus(contract("nda", [signer("owner", "opened"), signer("sm", "signed")]))).toBe("pending");
    expect(ndaStatus(contract("nda", [signer("owner", "opened"), signer("sm", "signed")], { own_file_id: "f" }))).toBe("own_review");
    expect(ndaStatus(null)).toBe("none");
  });
  it("four steps before the approval, six after; the first not done is the current one", () => {
    const nda = contract("nda", [signer("owner", "signed"), signer("sm", "signed")]);
    const mou = contract("mou", [signer("owner", "opened"), signer("sm", "signed")]);
    const before = ownerSteps({ summary: { approved_at: null }, nda, mou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(before.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "meeting:done", "mou:current", "documents:upcoming"]);
    const after = ownerSteps({
      summary: { approved_at: "2026-10-01T15:00:00Z", entry: { meeting: null, expansion_meeting: null, expansion_meeting_held_at: "2026-10-08T16:00:00Z", booking_url: null, consultant_name: null } },
      nda, mou: { ...mou, signers: [signer("owner", "signed"), signer("sm", "signed")] }, operatingAgreement: contract("tripartite", [signer("owner", "sent")]), rules: ENTRY_RULE_DEFAULTS,
    });
    expect(after.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "meeting:done", "mou:done", "documents:done", "expansion:done", "operating_agreement:current"]);
  });
});
