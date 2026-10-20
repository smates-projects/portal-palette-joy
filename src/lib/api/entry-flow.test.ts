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

/** Rivera: booked, NDA opened by Javier and not signed, meeting held on Oct 13 without an outcome. */
async function rivera() {
  const api = await as(seed.U_NICOLAS);
  const lead = await leadNamed(api, "Rivera Roofing & Remodel");
  const nda = (await api.leads.getIntake(lead.id))!.contracts.find((c) => c.kind === "nda")!;
  const owner = (await api.users.list()).find((u) => u.email === lead.contact.email)!;
  return { api, lead, nda, owner };
}

describe("the MOU at the NDA signature", () => {
  it("signing the NDA creates the MOU (with its explainer and full text) and tells the owner; 'Se hizo' only sends the documents", async () => {
    const { api, lead, nda, owner } = await rivera();
    expect(nda.explainer?.title).toBeTruthy();
    expect(nda.body).toContain("Rivera Roofing & Remodel");
    await api.session.setViewAs(owner.id);
    expect((await api.documents.listContracts()).some((c) => c.kind === "mou")).toBe(false);
    await api.documents.signContract(nda.id);
    const mou = (await api.documents.listContracts()).find((c) => c.kind === "mou")!;
    expect(mou).toMatchObject({ state: "opened", explainer: { title: "Qué es el MOU" } });
    expect(mou.body).toContain("Rivera Roofing & Remodel");
    expect(mou.signers.map((s) => `${s.party}:${s.status}`)).toEqual(["owner:sent", "sm:signed"]);
    // No documents yet: they go out after the meeting.
    expect(await api.documents.listDocuments()).toEqual([]);
    const ready = (await api.notifications.list()).find((n) => n.kind === "mou_ready")!;
    expect(ready).toMatchObject({ contract_id: mou.id, business_name: "Rivera Roofing & Remodel", task_id: "" });
    // The owner can sign it before the meeting, with the four points.
    await api.documents.acknowledge(mou.id, ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"]);
    expect((await api.documents.signContract(mou.id)).signers.find((s) => s.party === "owner")!.status).toBe("signed");

    await api.session.setViewAs(seed.U_NICOLAS);
    const after = await api.leads.setMeetingOutcome(lead.id, lead.meeting!.id!, { outcome: "held" });
    expect(after.stage).toBe("documents");
    const intake = (await api.leads.getIntake(lead.id))!;
    expect(intake.contracts.filter((c) => c.kind === "mou")).toHaveLength(1);
    expect(intake.documents).toHaveLength(11);
    // Signed before the meeting: the documents open right away.
    expect(intake.documents.every((d) => !d.locked_until_mou)).toBe(true);
  });

  it("'Se hizo' before the owner signed the NDA: documents locked, no MOU until he signs", async () => {
    const { api, lead, nda, owner } = await rivera();
    await api.leads.setMeetingOutcome(lead.id, lead.meeting!.id!, { outcome: "held" });
    let intake = (await api.leads.getIntake(lead.id))!;
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda"]);
    expect(intake.documents.every((d) => d.locked_until_mou)).toBe(true);
    await api.session.setViewAs(owner.id);
    await api.documents.signContract(nda.id);
    await api.session.setViewAs(seed.U_NICOLAS);
    intake = (await api.leads.getIntake(lead.id))!;
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda", "mou"]);
    expect(intake.summary.approval).toMatchObject({ ok: false, reason: "contracts", missing: ["MOU"] });
  });
});

describe("the owner's own NDA", () => {
  it("the owner starts from the template with his business and name, sends it, and edits it while nobody signed", async () => {
    const { api, lead, owner } = await rivera();
    const businessId = lead.business_id!;
    await expect(api.documents.createOwnNda(businessId, "Mi acuerdo")).rejects.toThrow("owner_only");
    await api.session.setViewAs(owner.id);
    const { body } = await api.documents.getOwnNdaTemplate(businessId);
    expect(body).toContain("Rivera Roofing & Remodel");
    expect(body).toContain(owner.full_name);
    expect(body).not.toContain("{{");
    await expect(api.documents.createOwnNda(businessId, "   ")).rejects.toThrow("body_required");
    await expect(api.documents.createOwnNda(businessId, "x".repeat(20_001))).rejects.toThrow("body_too_long");
    const c = await api.documents.createOwnNda(businessId, `${body}\n\n6. Extra\nNada más.`);
    expect(c).toMatchObject({ kind: "owner_nda", area: "intake", state: "sent" });
    expect(c.signers.map((s) => `${s.party}:${s.status}`)).toEqual(["owner:sent", "sm:sent"]);
    await expect(api.documents.createOwnNda(businessId, body)).rejects.toThrow("own_nda_exists");
    expect((await api.documents.updateOwnNda(businessId, "Texto nuevo")).body).toBe("Texto nuevo");
    expect((await api.documents.getIntake())!.own_nda).toMatchObject({ id: c.id, signed_by_sm: false, signed_by_owner: false });
  });

  it("the consultant hears about it and signs it through the usual signer; then the owner may sign too, and it never blocks the approval", async () => {
    const { api, lead, owner } = await rivera();
    const businessId = lead.business_id!;
    await api.session.setViewAs(owner.id);
    const c = await api.documents.createOwnNda(businessId, "Acuerdo de Javier\n\n1. Qué protege\nTodo.");
    await api.session.setViewAs(seed.U_NICOLAS);
    expect((await api.notifications.list()).some((n) => n.kind === "owner_nda_received" && n.lead_id === lead.id)).toBe(true);
    const intake = (await api.leads.getIntake(lead.id))!;
    expect(intake.contracts.find((x) => x.kind === "owner_nda")!.body).toContain("Acuerdo de Javier");
    await api.documents.signContract(c.id);
    expect((await api.leads.getIntake(lead.id))!.summary.own_nda).toMatchObject({ signed_by_sm: true, signed_by_owner: false });
    await api.session.setViewAs(owner.id);
    await expect(api.documents.updateOwnNda(businessId, "Otro texto")).rejects.toThrow("invalid_state");
    expect((await api.documents.signContract(c.id)).state).toBe("signed");
    expect((await api.documents.getIntake())!.own_nda).toMatchObject({ state: "signed", signed_by_owner: true });
    // Approval counts only the NDA and the MOU.
    expect((await api.documents.getIntake())!.approval).toMatchObject({ reason: "contracts", missing: ["NDA mutuo", "MOU"] });
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
