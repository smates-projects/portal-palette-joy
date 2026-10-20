// Revised entry in the mock: NDA at booking with Strategic Mates pre-signed, the meeting outcome, the owner's own
// NDA, Bishops presented and the visibility rule, the expansion meeting and the Operating Agreement waiting period.
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
type Api = Awaited<ReturnType<typeof as>>;
const leadNamed = async (api: Api, name: string) => (await api.leads.list()).find((l) => l.business.name === name)!;

describe("booking and the meeting outcome", () => {
  it("a booking creates the owner account, the business in onboarding and the NDA pre-signed by Strategic Mates", async () => {
    const api = await as(seed.U_NICOLAS);
    const l = await api.leads.simulateAssessment();
    const booked = await api.leads.simulateBooking(l.id);
    expect(booked).toMatchObject({ stage: "meeting", meeting: { kind: "initial", outcome: null } });
    expect(booked.business_id).toBeTruthy();
    const intake = (await api.leads.getIntake(l.id))!;
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda"]);
    expect(intake.contracts[0]!.signers.map((s) => `${s.party}:${s.status}`)).toEqual(["owner:sent", "sm:signed"]);
    expect(intake.documents).toEqual([]);
    expect((await api.users.list()).some((u) => u.email === l.contact.email && u.role === "business_owner")).toBe(true);
    // The meeting has not started: nothing to answer yet, except rescheduling.
    await expect(api.leads.setMeetingOutcome(l.id, booked.meeting!.id!, { outcome: "held" })).rejects.toThrow("invalid_transition");
  });

  it("without the rule, the NDA waits for Strategic Mates' signature too", async () => {
    const api = await as(seed.U_MARYLIN);
    await api.rules.update({ nda_auto_signed_by_sm: false });
    await api.session.setViewAs(seed.U_NICOLAS);
    const l = await api.leads.simulateAssessment();
    await api.leads.simulateBooking(l.id);
    expect((await api.leads.getIntake(l.id))!.contracts[0]!.signers.find((s) => s.party === "sm")!.status).toBe("sent");
  });

  it("an outcome is answered once; no_show waits for a new booking, which keeps the lead in Reunión", async () => {
    const api = await as(seed.U_NICOLAS);
    const rivera = await leadNamed(api, "Rivera Roofing & Remodel");
    const after = await api.leads.setMeetingOutcome(rivera.id, rivera.meeting!.id!, { outcome: "no_show" });
    expect(after).toMatchObject({ stage: "meeting", meeting: { outcome: "no_show" } });
    await expect(api.leads.setMeetingOutcome(rivera.id, rivera.meeting!.id!, { outcome: "held" })).rejects.toThrow("outcome_already_set");
    const rebooked = await api.leads.simulateBooking(rivera.id);
    expect(rebooked).toMatchObject({ stage: "meeting", meeting: { outcome: null } });
    expect(rebooked.meeting!.id).not.toBe(rivera.meeting!.id);
    // The NDA of the first booking stays: still one.
    expect((await api.leads.getIntake(rivera.id))!.contracts.filter((c) => c.kind === "nda")).toHaveLength(1);
  });

  it("a lead moved to Reunión by hand gets the NDA, then the MOU, from SM", async () => {
    const api = await as(seed.U_NICOLAS);
    const torres = await leadNamed(api, "Torres Concrete");
    await api.leads.move(torres.id, "meeting");
    const withNda = await api.leads.sendNda(torres.id);
    expect(withNda.intake).not.toBeNull();
    await expect(api.leads.sendNda(torres.id)).rejects.toThrow("invalid_state");
    const moved = await api.leads.sendMou(torres.id);
    expect(moved.stage).toBe("documents");
    expect((await api.leads.getIntake(torres.id))!.contracts.map((c) => c.kind)).toEqual(["nda", "mou"]);
  });
});

describe("the owner's own NDA", () => {
  it("the owner proposes it, the consultant hears about it, SM accepts it and it counts as signed", async () => {
    const api = await as(seed.U_NICOLAS);
    const rivera = await leadNamed(api, "Rivera Roofing & Remodel");
    const nda = (await api.leads.getIntake(rivera.id))!.contracts.find((c) => c.kind === "nda")!;
    const owner = (await api.users.list()).find((u) => u.email === rivera.contact.email)!;
    await api.session.setViewAs(owner.id);
    const proposed = await api.documents.proposeOwnNda(nda.id, { name: "nda-rivera.pdf" });
    expect(proposed).toMatchObject({ own_file_name: "nda-rivera.pdf", source: "sm" });
    await expect(api.documents.proposeOwnNda(nda.id, { name: "otro.pdf" })).rejects.toThrow("own_nda_pending");
    await expect(api.documents.signContract(nda.id)).rejects.toThrow("own_nda_pending");
    await expect(api.documents.acceptOwnNda(nda.id)).rejects.toThrow("sm_only");
    await api.session.setViewAs(seed.U_NICOLAS);
    expect((await api.notifications.list()).some((n) => n.kind === "own_nda_proposed" && n.lead_id === rivera.id)).toBe(true);
    const accepted = await api.documents.acceptOwnNda(nda.id);
    expect(accepted).toMatchObject({ source: "own", state: "signed" });
    expect((await leadNamed(api, "Rivera Roofing & Remodel")).intake!.nda_signed).toBe(true);
  });

  it("'Pedir el mutuo' needs a comment and leaves the mutual NDA to sign", async () => {
    const api = await as(seed.U_NICOLAS);
    const rivera = await leadNamed(api, "Rivera Roofing & Remodel");
    const nda = (await api.leads.getIntake(rivera.id))!.contracts.find((c) => c.kind === "nda")!;
    const owner = (await api.users.list()).find((u) => u.email === rivera.contact.email)!;
    await api.session.setViewAs(owner.id);
    await api.documents.proposeOwnNda(nda.id, { name: "nda-rivera.pdf" });
    await api.session.setViewAs(seed.U_NICOLAS);
    await expect(api.documents.rejectOwnNda(nda.id, " ")).rejects.toThrow("comment_required");
    const back = await api.documents.rejectOwnNda(nda.id, "Preferimos el mutuo: cubre a las dos partes.");
    expect(back).toMatchObject({ own_file_id: null, own_review_comment: "Preferimos el mutuo: cubre a las dos partes." });
    await api.session.setViewAs(owner.id);
    expect((await api.documents.signContract(nda.id)).state).toBe("signed");
  });
});

describe("Bishops: presented and the visibility rule", () => {
  it("Techos Delgado: presented to Jefferson and Laura, taken by Jefferson, expansion held, Operating Agreement waiting", async () => {
    const api = await as(seed.U_CAMILA);
    const techos = await leadNamed(api, "Techos Delgado");
    expect(techos).toMatchObject({ stage: "accepted", bishop_user_id: net.U_JEFFERSON, tripartite: "pending", funds: null });
    expect(techos.expansion_meeting_held_at).toBeTruthy();
    const inv = (await api.leads.getInvestors(techos.id))!;
    expect(inv.presented!.map((p) => p.name).sort()).toEqual(["Jefferson Paula", "Laura Ortega"]);
    expect(inv.tripartite).toMatchObject({ name: "Operating Agreement", sent_at: "2026-10-11" });
    await api.session.setViewAs(net.U_JEFFERSON);
    await expect(api.documents.signContract(inv.tripartite!.id)).rejects.toMatchObject({ message: "waiting_period", detail: "2026-10-18" });
    await api.session.setViewAs(seed.U_MARYLIN);
    await api.rules.update({ oa_waiting_days: 3 });
    await api.session.setViewAs(net.U_JEFFERSON);
    expect((await api.documents.signContract(inv.tripartite!.id)).signers.find((s) => s.party === "bishop")!.status).toBe("signed");
  });

  it("with 'presented' a Bishop sees only what SM presented to him, with the line and a notice", async () => {
    const api = await as(seed.U_MARYLIN);
    await api.rules.update({ opportunity_visibility: "presented" });
    await api.session.setViewAs(net.U_LAURA);
    expect((await api.bishop.listOpportunities()).some((o) => o.phase === "in_review")).toBe(false);
    await api.session.setViewAs(seed.U_CAMILA);
    const brisa = await leadNamed(api, "Brisa Clean Services");
    await api.session.setViewAs(net.U_LAURA);
    expect((await api.bishop.listOpportunities()).some((o) => o.id === brisa.id)).toBe(false);
    await api.session.setViewAs(seed.U_CAMILA);
    await expect(api.leads.presentToBishops(brisa.id, [])).rejects.toThrow("bishops_required");
    await expect(api.leads.presentToBishops(brisa.id, [net.U_DIEGO])).rejects.toThrow("invalid_bishop");
    const inv = await api.leads.presentToBishops(brisa.id, [net.U_LAURA]);
    expect(inv.presented!.map((p) => p.name)).toEqual(["Laura Ortega"]);
    expect(inv.candidates!.map((c) => c.name)).not.toContain("Diego Rivas");
    await api.session.setViewAs(net.U_LAURA);
    const seen = (await api.bishop.listOpportunities()).find((o) => o.id === brisa.id)!;
    expect(seen.presented_at).toBeTruthy();
    const n = (await api.notifications.list()).find((x) => x.kind === "opportunity_presented")!;
    expect(n).toMatchObject({ opportunity_id: brisa.id, business_name: "" });
    await api.session.setViewAs(net.U_JEFFERSON);
    expect((await api.bishop.listOpportunities()).some((o) => o.id === brisa.id)).toBe(false);
  });

  it("the Operating Agreement goes out only after the expansion meeting", async () => {
    const api = await as(seed.U_CAMILA);
    const brisa = await leadNamed(api, "Brisa Clean Services");
    await api.session.setViewAs(net.U_LAURA);
    await api.bishop.acceptOpportunity(brisa.id);
    await api.session.setViewAs(seed.U_CAMILA);
    await expect(api.leads.sendTripartite(brisa.id)).rejects.toThrow("expansion_meeting_required");
    const booked = await api.leads.simulateBooking(brisa.id);
    expect(booked.expansion_meeting).toMatchObject({ kind: "expansion", outcome: null });
    // In the future: held is not possible yet; the API's rule, the mock's too.
    await expect(api.leads.setMeetingOutcome(brisa.id, booked.expansion_meeting!.id!, { outcome: "held" })).rejects.toThrow("invalid_transition");
    // Rule off: it can go out right away.
    await api.session.setViewAs(seed.U_MARYLIN);
    await api.rules.update({ require_expansion_meeting: false });
    await api.session.setViewAs(seed.U_CAMILA);
    expect((await api.leads.sendTripartite(brisa.id)).name).toBe("Operating Agreement");
  });
});

describe("office signature", () => {
  it("SM Global or the office admin loads a PNG; a consultant cannot", async () => {
    const api = await as(seed.U_ANDREA);
    await expect(api.network.setOfficeSignature(seed.ORG_SM, { name: "firma.jpg" })).rejects.toThrow("invalid_file");
    expect(await api.network.setOfficeSignature(seed.ORG_SM, { name: "firma-miami.png" })).toMatchObject({ signature_file_name: "firma-miami.png" });
    await api.session.setViewAs(seed.U_NICOLAS);
    await expect(api.network.setOfficeSignature(seed.ORG_SM, { name: "firma.png" })).rejects.toThrow("forbidden");
  });
});
