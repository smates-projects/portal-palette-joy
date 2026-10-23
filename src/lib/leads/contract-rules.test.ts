import { describe, expect, it } from "vitest";
import type { EntryContractRule, Signer } from "@/lib/api/types";
import {
  DEFAULT_ENTRY_CONTRACT_RULES, contractDeadline, dueRules, fillContractTemplate, parseTrigger, ruleError, ruleSchedule, smEntitiesOf, smSignBlock, smSignerEntityName,
  type EntryFacts,
} from "./contract-rules";

const facts = (extra: Partial<EntryFacts> = {}): EntryFacts => ({
  meeting_booked: null, nda_signed: null, meeting_held: null, documents_approved: null, bishop_accepted: null, validation_closed: null, signed: {}, ...extra,
});
const rules = DEFAULT_ENTRY_CONTRACT_RULES;
const rule = (code: string) => rules.find((r) => r.code === code)!;
const codes = (xs: { rule: EntryContractRule }[]) => xs.map((x) => x.rule.code);

describe("default entry contract rules", () => {
  it("NDA, MOU, Acuerdo de Vinculación and Operating Agreement, in that order, with Strategic Mates' texts", () => {
    expect(rules.map((r) => [r.code, r.kind, r.trigger])).toEqual([
      ["nda", "nda", "meeting_booked"],
      ["mou", "mou", "nda_signed"],
      ["binding", "binding", "bishop_accepted"],
      ["operating_agreement", "tripartite", "contract_signed:binding"],
    ]);
    expect(rule("binding").name).toBe("Acuerdo de Vinculación y Formalización");
    expect(rule("binding").template).toContain("SEGUNDA: OBJETO Y COMPROMISO DE VINCULACIÓN.-");
    expect(rule("nda").template).toContain("{{business_name}}");
    // Corporate signs the binding agreement; SM Square signs the Operating Agreement, within 7 days.
    expect(rule("binding").signers.find((s) => s.party === "sm")).toEqual({ party: "sm", sm_entity: "corporate" });
    expect(rule("operating_agreement")).toMatchObject({ delay_days: 0, deadline_days: 7, signers: expect.arrayContaining([{ party: "sm", sm_entity: "sm_square" }]) });
  });
  it("every default rule saves (nothing in them breaks the editor's checks)", () => {
    for (const r of rules) expect(ruleError(r, rules.filter((x) => x !== r).map((x) => x.code)), r.code).toBeNull();
  });
});

describe("the rule engine", () => {
  it("creates a rule's contract once its trigger happened", () => {
    expect(codes(dueRules(rules, facts(), new Set(), "2026-10-14"))).toEqual([]);
    expect(codes(dueRules(rules, facts({ meeting_booked: "2026-10-01" }), new Set(), "2026-10-14"))).toEqual(["nda"]);
    expect(codes(dueRules(rules, facts({ meeting_booked: "2026-10-01", bishop_accepted: "2026-10-10" }), new Set(["nda", "mou"]), "2026-10-14"))).toEqual(["binding"]);
  });
  it("is idempotent: a rule whose contract exists is never due again", () => {
    const f = facts({ meeting_booked: "2026-10-01", nda_signed: "2026-10-02" });
    expect(codes(dueRules(rules, f, new Set(["nda"]), "2026-10-14"))).toEqual(["mou"]);
    expect(codes(dueRules(rules, f, new Set(["nda", "mou"]), "2026-10-14"))).toEqual([]);
  });
  it("waits the delay days after the trigger", () => {
    const later = rules.map((r) => (r.code === "binding" ? { ...r, delay_days: 3 } : r));
    const f = facts({ bishop_accepted: "2026-10-12" });
    expect(codes(dueRules(later, f, new Set(["nda", "mou"]), "2026-10-14"))).toEqual([]);
    expect(codes(dueRules(later, f, new Set(["nda", "mou"]), "2026-10-15"))).toEqual(["binding"]);
  });
  it("the Operating Agreement waits for the binding agreement signed and the validation closed; 7 days to sign", () => {
    const existing = new Set(["nda", "mou", "binding"]);
    const signed = facts({ bishop_accepted: "2026-10-01", signed: { binding: "2026-10-11" } });
    expect(codes(dueRules(rules, signed, existing, "2026-10-14"))).toEqual([]);
    expect(ruleSchedule(rule("operating_agreement"), signed)).toEqual({ creates_on: null, sign_by: "2026-10-18", waiting_validation: true });
    const closed = { ...signed, validation_closed: "2026-10-09T15:00:00Z" };
    expect(dueRules(rules, closed, existing, "2026-10-14")).toEqual([{ rule: rule("operating_agreement"), sign_by: "2026-10-18" }]);
    // Closed after the signature: created that day, the deadline still counts from the binding agreement.
    expect(ruleSchedule(rule("operating_agreement"), { ...signed, validation_closed: "2026-10-13T10:00:00Z" })).toMatchObject({ creates_on: "2026-10-13", sign_by: "2026-10-18" });
  });
  it("skips rules placed before a contract that already exists (a business that entered before the rule)", () => {
    const f = facts({ bishop_accepted: "2026-09-01" });
    expect(codes(dueRules(rules, f, new Set(["nda", "mou", "operating_agreement"]), "2026-10-14"))).toEqual([]);
  });
  it("leaves archived rules out", () => {
    const off = rules.map((r) => (r.code === "binding" ? { ...r, active: false } : r));
    expect(codes(dueRules(off, facts({ bishop_accepted: "2026-10-01" }), new Set(["nda", "mou"]), "2026-10-14"))).toEqual([]);
  });
});

describe("rule checks and texts", () => {
  it("parses triggers, including another rule signed", () => {
    expect(parseTrigger("bishop_accepted")).toEqual({ kind: "event", event: "bishop_accepted" });
    expect(parseTrigger("contract_signed:binding")).toEqual({ kind: "contract", code: "binding" });
    expect(parseTrigger("contract_signed:")).toBeNull();
    expect(parseTrigger("whenever")).toBeNull();
  });
  it("refuses a rule without name, with an unknown trigger, without signers, an SM signer without its company or bad days", () => {
    const base = { ...rule("binding") };
    expect(ruleError({ ...base, name: " " }, ["nda"])).toBe("name_required");
    expect(ruleError({ ...base, trigger: "contract_signed:binding" }, ["nda"])).toBe("invalid_trigger");
    expect(ruleError({ ...base, trigger: "contract_signed:nope" }, ["nda"])).toBe("invalid_trigger");
    expect(ruleError({ ...base, signers: [] }, ["nda"])).toBe("signers_required");
    expect(ruleError({ ...base, signers: [{ party: "sm" }] }, ["nda"])).toBe("sm_entity_required");
    expect(ruleError({ ...base, delay_days: -1 }, ["nda"])).toBe("invalid_days");
  });
  it("fills the placeholders it knows and keeps the rest as written", () => {
    expect(fillContractTemplate("{{business_name}} · {{ owner_name }} · {{equity_owner}} % · {{unknown}}", { business_name: "Vossler", owner_name: "Carla", equity_owner: 60 }))
      .toBe("Vossler · Carla · 60 % · {{unknown}}");
  });
  it("names Corporate and SM Square from the rules, or the defaults", () => {
    expect(smEntitiesOf(null)).toEqual({ corporate: { name: "Strategic Mates Corporate", signer_user_id: null }, sm_square: { name: "SM Square" } });
    expect(smEntitiesOf({ sm_entities: { corporate: { name: "SM LLC", signer_user_id: "ceo" }, sm_square: { name: "SQ" } } }).corporate.signer_user_id).toBe("ceo");
    expect(smEntitiesOf({ sm_entities: { corporate: { name: "SM LLC" }, sm_square: { name: " " } } }).sm_square.name).toBe("SM Square");
  });
});

describe("signing for Strategic Mates and the deadline", () => {
  const smSquare = { user_id: "camila", sm_entity: "sm_square" as const };
  it("'en nombre de …' uses the name frozen on the signature, not the current rules name", () => {
    const entities = smEntitiesOf({ sm_entities: { corporate: { name: "SM Corporate Renamed" }, sm_square: { name: "SM Square" } } });
    expect(smSignerEntityName({ sm_entity: "corporate", sm_entity_name: "Strategic Mates Corporate" }, entities)).toBe("Strategic Mates Corporate");
    expect(smSignerEntityName({ sm_entity: "corporate", sm_entity_name: null }, entities)).toBe("SM Corporate Renamed");
    expect(smSignerEntityName({}, entities)).toBe("SM Corporate Renamed");
  });
  it("only the SM Square holder signs for SM Square, and only with the permission", () => {
    expect(smSignBlock(smSquare, { id: "camila", can_sign_sm_square: true })).toBeNull();
    expect(smSignBlock(smSquare, { id: "nicolas", can_sign_sm_square: false })).toBe("sm_square_signer_required");
    expect(smSignBlock(smSquare, { id: "andrea", can_sign_sm_square: true })).toBe("sm_square_signer_required");
    expect(smSignBlock({ user_id: "camila", sm_entity: "sm_square" }, { id: "camila" })).toBe("sm_square_signer_required");
  });
  it("Corporate's named signer signs the binding agreement; a signer without a person (NDA) anyone of the office", () => {
    expect(smSignBlock({ user_id: "marilyn", sm_entity: "corporate" }, { id: "nicolas" })).toBe("not_signer");
    expect(smSignBlock({ user_id: "marilyn", sm_entity: "corporate" }, { id: "marilyn" })).toBeNull();
    expect(smSignBlock({ user_id: null, sm_entity: "corporate" }, { id: "nicolas" })).toBeNull();
  });
  it("'Firma antes del' while it runs, overdue after, nothing once everyone signed", () => {
    const sent: Signer = { name: "x", role: "owner", party: "owner", signed_at: null, status: "sent" };
    expect(contractDeadline({ signers: [sent], sign_by: "2026-10-18" }, "2026-10-14")).toEqual({ state: "open", sign_by: "2026-10-18" });
    expect(contractDeadline({ signers: [sent], sign_by: "2026-10-18" }, "2026-10-19")).toEqual({ state: "overdue", sign_by: "2026-10-18" });
    expect(contractDeadline({ signers: [{ ...sent, status: "signed" }], sign_by: "2026-10-18" }, "2026-10-19")).toEqual({ state: "none" });
    expect(contractDeadline({ signers: [sent], sign_by: null }, "2026-10-19")).toEqual({ state: "none" });
  });
});
