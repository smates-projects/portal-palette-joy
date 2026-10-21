import { describe, expect, it } from "vitest";
import type { Contract, Signer } from "@/lib/api/types";
import { canSignAs, pendingPartyNames, signingStatus, withSigningView } from "./parties";

const signer = (party: Signer["party"], name: string, status: Signer["status"], user_id: string | null = null, extra: Partial<Signer> = {}): Signer =>
  ({ name, role: party ?? "", party, status, signed_at: status === "signed" ? "2026-10-20" : null, user_id, ...extra });

const contract = (signers: Signer[], extra: Partial<Contract> = {}): Contract =>
  ({ id: "c", business_id: "b", area: "intake", kind: "framework", name: "Acuerdo marco", state: "sent", sent_at: "2026-10-19", signed_at: null, signers, ...extra });

describe("pendingPartyNames and signingStatus", () => {
  it("names the parties still to sign, the API's pending_parties first", () => {
    const c = contract([signer("bishop", "Diego Rivas", "signed", "d"), signer("sm", "Marilyn Boraei", "sent", "m")]);
    expect(pendingPartyNames(c)).toEqual(["Marilyn Boraei"]);
    expect(pendingPartyNames({ ...c, pending_parties: ["Strategic Mates Corporate"] })).toEqual(["Strategic Mates Corporate"]);
  });

  it("the Bishop reads 'Firmado por ti, falta Strategic Mates' until everyone signed", () => {
    const half = contract([signer("bishop", "Diego Rivas", "signed", "d"), signer("sm", "Marilyn Boraei", "sent", "m")]);
    expect(signingStatus(half, "bishop")).toEqual({ all: false, mine: true, pending: ["Marilyn Boraei"] });
    expect(signingStatus({ ...half, my_signature: "pending" }, "bishop").mine).toBe(false);
    const done = contract([signer("bishop", "Diego Rivas", "signed", "d"), signer("sm", "Marilyn Boraei", "signed", "m")], { state: "signed" });
    expect(signingStatus(done, "bishop").all).toBe(true);
    const none = contract([signer("bishop", "Diego Rivas", "sent", "d"), signer("sm", "Marilyn Boraei", "sent", "m")]);
    expect(signingStatus(none, "bishop")).toMatchObject({ all: false, mine: false, pending: ["Diego Rivas", "Marilyn Boraei"] });
  });
});

describe("canSignAs and withSigningView", () => {
  const binding = contract([signer("owner", "Ramón Castillo", "signed", "o"), signer("bishop", "Jefferson Paula", "sent", "j"), signer("sm", "Marilyn Boraei", "sent", "m", { sm_entity: "corporate" })]);

  it("SM Global signs for Strategic Mates when the SM signer names them or nobody; an office person never a named one", () => {
    expect(canSignAs(binding, { id: "m", role: "sm_global" }, "sm")).toBe(true);
    expect(canSignAs(binding, { id: "n", role: "sm_team", organization_id: "o1" }, "sm", { officeId: "o1" })).toBe(false);
    const anySm = contract([signer("sm", "Strategic Mates", "sent", null, { sm_entity: "corporate" })]);
    expect(canSignAs(anySm, { id: "n", role: "sm_team", organization_id: "o1" }, "sm", { officeId: "o1" })).toBe(true);
    expect(canSignAs(anySm, { id: "n", role: "sm_team", organization_id: "o2" }, "sm", { officeId: "o1" })).toBe(false);
  });

  it("the owner and the Bishop sign their own pending part only", () => {
    expect(canSignAs(binding, { id: "j", role: "bishop" }, "bishop")).toBe(true);
    expect(canSignAs(binding, { id: "x", role: "bishop" }, "bishop")).toBe(false);
    expect(canSignAs(binding, { id: "o", role: "business_owner", business_id: "b" }, "owner")).toBe(false);
    const fresh = contract([signer("owner", "Ramón Castillo", "sent", "o")]);
    expect(canSignAs(fresh, { id: "o", role: "business_owner", business_id: "b" }, "owner")).toBe(true);
    expect(canSignAs(fresh, { id: "o", role: "business_owner", business_id: "other" }, "owner")).toBe(false);
  });

  it("withSigningView fills the API's per-person fields", () => {
    expect(withSigningView(binding, { id: "m", role: "sm_global" })).toMatchObject({ can_sign: true, my_signature: "pending", pending_parties: ["Jefferson Paula", "Marilyn Boraei"] });
    expect(withSigningView(binding, { id: "o", role: "business_owner", business_id: "b" })).toMatchObject({ can_sign: false, my_signature: "signed" });
  });
});
