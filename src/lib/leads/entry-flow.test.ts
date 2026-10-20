import { describe, expect, it } from "vitest";
import type { Contract, LeadMeeting, Signer } from "@/lib/api/types";
import {
  ENTRY_RULE_DEFAULTS, INTAKE_DOCUMENT_ACCEPT, OWNER_STEPS, OWN_NDA_MAX_LENGTH, acknowledgedAll, bishopSees, bookingKind, cleanDocumentHelp,
  entryRules, fillOwnNdaTemplate, intakeDocumentHelp, missingAcknowledgments, ndaStatus, oaSendBlock, oaSignableFrom, oaWaitingUntil,
  outcomeBlock, outcomePending, ownNdaBodyError, ownNdaEditable, ownNdaView, ownerMeetingView, ownerSteps, signBlock, validAcknowledgment,
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
  it("firmado / pendiente", () => {
    expect(ndaStatus(contract("nda", [signer("owner", "signed"), signer("sm", "signed")]))).toBe("signed");
    expect(ndaStatus(contract("nda", [signer("owner", "opened"), signer("sm", "signed")]))).toBe("pending");
    expect(ndaStatus(null)).toBe("none");
  });
  it("the order is NDA, MOU, Tu reunión, Documentos; then the expansion meeting and the Operating Agreement", () => {
    expect(OWNER_STEPS).toEqual(["nda", "mou", "meeting", "documents", "expansion", "operating_agreement"]);
  });
  it("four steps before the approval, six after; the first not done is the current one", () => {
    const nda = contract("nda", [signer("owner", "signed"), signer("sm", "signed")]);
    const mou = contract("mou", [signer("owner", "opened"), signer("sm", "signed")]);
    // The MOU exists right after the NDA: it is the current step even before the meeting.
    const before = ownerSteps({ summary: { approved_at: null }, nda, mou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(before.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:current", "meeting:upcoming", "documents:upcoming"]);
    // Signed before the meeting: the meeting is next.
    const signedMou = { ...mou, signers: [signer("owner", "signed"), signer("sm", "signed")] };
    const beforeMeeting = ownerSteps({ summary: { approved_at: null, required_total: 0 }, nda, mou: signedMou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(beforeMeeting.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:done", "meeting:current", "documents:upcoming"]);
    // The API creates the documents at the NDA signature: a documents list does not make the meeting held.
    const withDocs = ownerSteps({ summary: { approved_at: null, required_total: 9 }, nda, mou: signedMou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(withDocs.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:done", "meeting:current", "documents:upcoming"]);
    // A booked meeting still to come, with documents: upcoming, not held. Only outcome "held" marks it held.
    const booked = { meetings: [{ id: "i", kind: "initial" as const, starts_at: "2026-10-20T15:00:00Z", duration_min: 30, meet_url: null, outcome: null, outcome_prompted_at: null }], booking_url: null, expansion_meeting_held_at: null };
    const bookedSteps = ownerSteps({ summary: { approved_at: null, required_total: 9, entry: booked }, nda, mou: signedMou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(bookedSteps.find((s) => s.key === "meeting")?.state).toBe("current");
    const held = { ...booked, meetings: [{ ...booked.meetings[0]!, outcome: "held" as const }] };
    const heldSteps = ownerSteps({ summary: { approved_at: null, required_total: 9, entry: held }, nda, mou: signedMou, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS });
    expect(heldSteps.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:done", "meeting:done", "documents:current"]);
    const after = ownerSteps({
      summary: { approved_at: "2026-10-01T15:00:00Z", entry: { meeting: null, expansion_meeting: null, expansion_meeting_held_at: "2026-10-08T16:00:00Z", booking_url: null, consultant_name: null } },
      nda, mou: signedMou, operatingAgreement: contract("tripartite", [signer("owner", "sent")]), rules: ENTRY_RULE_DEFAULTS,
    });
    expect(after.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:done", "meeting:done", "documents:done", "expansion:done", "operating_agreement:current"]);
  });
});

describe("the owner's own NDA", () => {
  it("none, waiting for Strategic Mates, signed by Strategic Mates, signed by both; editable only while nobody signed", () => {
    expect(ownNdaView(null)).toBe("none");
    expect(ownNdaView({ signed_by_sm: false, signed_by_owner: false })).toBe("waiting_sm");
    expect(ownNdaView({ signed_by_sm: true, signed_by_owner: false })).toBe("signed_by_sm");
    expect(ownNdaView({ signed_by_sm: true, signed_by_owner: true })).toBe("signed_by_both");
    expect(ownNdaEditable({ signed_by_sm: false, signed_by_owner: false })).toBe(true);
    expect(ownNdaEditable({ signed_by_sm: true, signed_by_owner: false })).toBe(false);
    expect(ownNdaEditable(null)).toBe(false);
  });
  it("the body is required and has a maximum length; the template gets the business and the owner", () => {
    expect(ownNdaBodyError("  ")).toBe("body_required");
    expect(ownNdaBodyError("x".repeat(OWN_NDA_MAX_LENGTH + 1))).toBe("body_too_long");
    expect(ownNdaBodyError("Mi acuerdo")).toBeNull();
    expect(fillOwnNdaTemplate("Entre {{business_name}} y {{ owner_name }}, por {{business_name}}.", { business_name: "Vossler", owner_name: "Carla Méndez" }))
      .toBe("Entre Vossler y Carla Méndez, por Vossler.");
  });
});

describe("entry document help", () => {
  const rules = {
    intake_documents: [
      { id: "r1", name: "Constitución", required: true, only_if_llc: false, verified_hint: "", archived: false, help: { what: " Tu empresa existe ", counts: ["Sunbiz", " ", "Articles"], tip: "" } },
      { id: "r2", name: "EIN", required: true, only_if_llc: false, verified_hint: "", archived: false, help: { what: "", counts: [""], tip: " " } },
    ],
  };
  it("comes from the rule of the document, trimmed, without empty lines; nothing written is no help", () => {
    expect(intakeDocumentHelp({ area: "intake", rule_id: "r1" }, rules)).toEqual({ what: "Tu empresa existe", counts: ["Sunbiz", "Articles"], tip: "" });
    expect(intakeDocumentHelp({ area: "intake", rule_id: "r2" }, rules)).toBeNull();
    expect(intakeDocumentHelp({ area: "intake", rule_id: "nope" }, rules)).toBeNull();
    expect(intakeDocumentHelp({ area: "B1", rule_id: "r1" }, rules)).toBeNull();
    expect(cleanDocumentHelp(null)).toBeNull();
  });
  it("the upload takes photos and PDFs, like the API", () => {
    for (const ext of [".pdf", ".png", ".jpg", ".jpeg", "image/png", "image/jpeg"]) expect(INTAKE_DOCUMENT_ACCEPT.split(",")).toContain(ext);
  });
});

describe("owner meeting steps (API entry with meetings[])", () => {
  const nda = contract("nda", [signer("owner", "signed"), signer("sm", "signed")]);
  const apiEntry = (meetings: { id: string; kind: "initial" | "expansion"; starts_at: string; outcome: LeadMeeting["outcome"] }[], heldAt: string | null = null) => ({
    meetings: meetings.map((m) => ({ ...m, duration_min: 30, meet_url: "https://meet.google.com/x", outcome_prompted_at: null })),
    booking_url: "https://strategicmates.com/book",
    expansion_meeting_held_at: heldAt,
  });

  it("Tu reunión: a booked meeting shows itself (never 'Reserva tu reunión'); held reads 'Reunión hecha'", () => {
    expect(ownerMeetingView(null, { now: NOW })).toBe("book");
    expect(ownerMeetingView(meeting("2026-10-20T15:00:00Z"), { now: NOW })).toBe("upcoming");
    expect(ownerMeetingView(meeting("2026-10-14T10:00:00Z"), { now: NOW })).toBe("waiting_outcome");
    expect(ownerMeetingView(meeting("2026-10-14T10:00:00Z", { outcome: "held" }), { now: NOW })).toBe("held");
    expect(ownerMeetingView(meeting("2026-10-14T10:00:00Z", { outcome: "no_show" }), { now: NOW })).toBe("rebook");
  });

  it("Reunión de ampliación: once held (outcome or expansion_meeting_held_at) it stops offering the booking", () => {
    expect(ownerMeetingView(null, { heldAt: "2026-10-20T06:42:40Z" })).toBe("held");
    expect(ownerMeetingView(meeting("2026-10-14T05:12:33Z", { kind: "expansion", outcome: "held" }))).toBe("held");
  });

  it("the meeting step is done from entry.meetings[] alone, and the Operating Agreement follows a held expansion", () => {
    const meetingOnly = ownerSteps({
      summary: { approved_at: null, entry: apiEntry([{ id: "i", kind: "initial", starts_at: "2026-10-14T05:44:18Z", outcome: "held" }]) },
      nda, mou: null, operatingAgreement: null, rules: ENTRY_RULE_DEFAULTS,
    });
    expect(meetingOnly.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:current", "meeting:done", "documents:upcoming"]);
    const mou = contract("mou", [signer("owner", "signed"), signer("sm", "signed")]);
    const afterExpansion = ownerSteps({
      summary: {
        approved_at: "2026-10-20T06:41:11Z",
        entry: apiEntry([
          { id: "i", kind: "initial", starts_at: "2026-10-14T05:44:18Z", outcome: "held" },
          { id: "e", kind: "expansion", starts_at: "2026-10-14T05:12:33Z", outcome: "held" },
        ]),
      },
      nda, mou, operatingAgreement: contract("tripartite", [signer("owner", "sent")]), rules: ENTRY_RULE_DEFAULTS,
    });
    expect(afterExpansion.map((s) => `${s.key}:${s.state}`)).toEqual(["nda:done", "mou:done", "meeting:done", "documents:done", "expansion:done", "operating_agreement:current"]);
  });
});
