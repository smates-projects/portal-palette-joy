// Revised entry in the mock: NDA at booking with Strategic Mates pre-signed, the meeting outcome, the owner's own
// NDA, Bishops presented and the visibility rule, the expansion meeting and the Operating Agreement waiting period.
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";
import { rebookedAfterSummary } from "@/lib/leads/entry";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
type Api = Awaited<ReturnType<typeof as>>;
const leadNamed = async (api: Api, name: string) => (await api.leads.list()).find((l) => l.business.name === name)!;

describe("No aplica", () => {
  it("the owner marks a document as not applicable with a reason; SM accepts it or asks for it anyway; accepted ones count as resolved", async () => {
    // One in-memory world: the same client switches between the consultant and the owner.
    const api = await as(seed.U_NICOLAS);
    const lead = await leadNamed(api, "Castillo Instalaciones");
    const before = (await api.leads.getIntake(lead.id))!;
    const pending = before.documents.find((d) => d.state === "requested")!;
    const ownerId = (await api.users.list()).find((u) => u.role === "business_owner" && u.business_id === lead.business_id)!.id;
    const asOwner = () => api.session.setViewAs(ownerId);
    const asSm = () => api.session.setViewAs(seed.U_NICOLAS);
    await asOwner();
    await expect(api.documents.markNotApplicable(pending.id, "  ")).rejects.toThrow("reason_required");
    const marked = await api.documents.markNotApplicable(pending.id, "No tengo empleados, trabajo solo");
    expect(marked).toMatchObject({ state: "not_applicable", not_applicable_reason: "No tengo empleados, trabajo solo", file_name: null });
    // It waits for SM like a file, and still blocks the approval until SM accepts it.
    await asSm();
    const after = (await api.leads.getIntake(lead.id))!;
    expect(after.summary.to_review).toBe(before.summary.to_review + 1);
    expect(after.summary.approval).toMatchObject({ ok: false });
    // "Pedirlo igual" sends it back to the owner with the comment.
    const asked = await api.leads.requestDocument(lead.id, pending.id, "Lo necesitamos igual, aunque sea tu propio contrato");
    expect(asked).toMatchObject({ state: "rejected", review_comment: "Lo necesitamos igual, aunque sea tu propio contrato" });
    // Marked again and accepted: resolved, with the fact saying why.
    await asOwner();
    await api.documents.markNotApplicable(pending.id, "No tengo empleados");
    await asSm();
    const accepted = await api.leads.acceptDocument(lead.id, pending.id, "No aplica. No tiene empleados");
    expect(accepted).toMatchObject({ state: "reviewed", verified_fact: "No aplica. No tiene empleados", not_applicable_reason: "No tengo empleados" });
    const summary = (await api.leads.getIntake(lead.id))!.summary;
    expect(summary.accepted).toBe(before.summary.accepted + 1);
    expect(summary.to_review).toBe(before.summary.to_review);
  });
});

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
    // Only the meeting update goes out: the summary keeps its first send and no second summary_sent is recorded.
    expect(rebooked.summary_sent_at).toBe(rivera.summary_sent_at);
    expect(rebookedAfterSummary(rebooked)).toBe(true);
    expect((await api.leads.get(rivera.id))!.events.filter((e) => e.kind === "summary_sent").length).toBeLessThanOrEqual(1);
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
    expect(intake.documents).toHaveLength(14);
    // Signed before the meeting: the documents open right away.
    expect(intake.documents.every((d) => !d.locked_until_mou)).toBe(true);
  });

  it("'Enviar MOU' by hand still sends the documents locked until the owner signs the MOU", async () => {
    const api = await as(seed.U_NICOLAS);
    const torres = await leadNamed(api, "Torres Concrete");
    await api.leads.move(torres.id, "meeting");
    await api.leads.sendNda(torres.id);
    await api.leads.sendMou(torres.id);
    const intake = (await api.leads.getIntake(torres.id))!;
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda", "mou"]);
    expect(intake.documents.every((d) => d.locked_until_mou)).toBe(true);
    expect(intake.summary.approval).toMatchObject({ ok: false, reason: "contracts" });
  });
});

describe("only Strategic Mates' NDA", () => {
  it("the owner's own NDA is gone: no repository method, no summary field, only the NDA of Strategic Mates in the entry", async () => {
    const { api, lead, owner } = await rivera();
    expect((api.documents as unknown as Record<string, unknown>)["createOwnNda"]).toBeUndefined();
    await api.session.setViewAs(owner.id);
    const summary = (await api.documents.getIntake())!;
    expect(summary).not.toHaveProperty("own_nda");
    expect((await api.documents.listContracts()).filter((c) => c.area === "intake").map((c) => c.kind)).toEqual(["nda"]);
    expect(lead.business_id).toBeTruthy();
  });
});

describe("meeting held without the MOU signed", () => {
  it("'Se hizo' with the MOU unsigned discards the lead by itself with reason mou_not_signed; SM Global reactivates it", async () => {
    const { api, lead } = await rivera();
    const held = await api.leads.setMeetingOutcome(lead.id, lead.meeting!.id!, { outcome: "held" });
    expect(held).toMatchObject({ stage: "discarded", discarded_from: "meeting", discard_reason: "mou_not_signed" });
    const events = (await api.leads.get(lead.id))!.events;
    expect(events.at(-1)).toMatchObject({ kind: "discarded", body: "mou_not_signed" });
    // The office cannot bring it back; SM Global can, to the stage it was in.
    await expect(api.leads.reactivate(lead.id)).rejects.toThrow("global_only");
    await api.session.setViewAs(seed.U_MARYLIN);
    const back = await api.leads.reactivate(lead.id);
    expect(back).toMatchObject({ stage: "meeting", discarded_from: null, discard_reason: null });
    expect((await api.leads.get(lead.id))!.events.at(-1)).toMatchObject({ kind: "reactivated" });
    await expect(api.leads.reactivate(lead.id)).rejects.toThrow("invalid_transition");
  });

  it("with the MOU signed, 'Se hizo' sends the documents as before", async () => {
    const { api, lead, owner } = await rivera();
    const nda = (await api.leads.getIntake(lead.id))!.contracts.find((c) => c.kind === "nda")!;
    await api.session.setViewAs(owner.id);
    await api.documents.signContract(nda.id);
    const mou = (await api.documents.listContracts()).find((c) => c.kind === "mou")!;
    await api.documents.acknowledge(mou.id, ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"]);
    await api.documents.signContract(mou.id);
    await api.session.setViewAs(seed.U_NICOLAS);
    const held = await api.leads.setMeetingOutcome(lead.id, lead.meeting!.id!, { outcome: "held" });
    expect(held.stage).toBe("documents");
  });
});

describe("Bishops: presented and the visibility rule", () => {
  it("Techos Delgado: taken by Jefferson, binding agreement signed by the three, Operating Agreement to sign by Oct 18", async () => {
    const api = await as(seed.U_CAMILA);
    const techos = await leadNamed(api, "Techos Delgado");
    expect(techos).toMatchObject({ stage: "accepted", bishop_user_id: net.U_JEFFERSON, tripartite: "pending", funds: null, validation: { status: "closed", equity_owner: 60 } });
    expect(techos.expansion_meeting_held_at).toBeTruthy();
    const inv = (await api.leads.getInvestors(techos.id))!;
    expect(inv.presented!.map((p) => p.name).sort()).toEqual(["Jefferson Paula", "Laura Ortega"]);
    // Created by its rule the day the binding agreement was signed by the three, with seven days to sign.
    expect(inv.tripartite).toMatchObject({ name: "Operating Agreement", sent_at: "2026-10-11", sign_by: "2026-10-18", rule_code: "operating_agreement" });
    expect(inv.tripartite!.signers.find((s) => s.party === "sm")).toMatchObject({ sm_entity: "sm_square", name: "Camila Soto" });
    // No waiting period any more: Jefferson signs today.
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

  it("with the binding agreement the Operating Agreement is not sent by hand: it waits for the validation", async () => {
    const api = await as(seed.U_CAMILA);
    const brisa = await leadNamed(api, "Brisa Clean Services");
    await api.session.setViewAs(net.U_LAURA);
    await api.bishop.acceptOpportunity(brisa.id);
    await api.session.setViewAs(seed.U_CAMILA);
    await expect(api.leads.sendTripartite(brisa.id)).rejects.toThrow("validation_open");
    // The linking meeting is still booked after the approval: the binding agreement is signed there.
    const booked = await api.leads.simulateBooking(brisa.id);
    expect(booked.expansion_meeting).toMatchObject({ kind: "expansion", outcome: null });
    // In the future: held is not possible yet; the API's rule, the mock's too.
    await expect(api.leads.setMeetingOutcome(brisa.id, booked.expansion_meeting!.id!, { outcome: "held" })).rejects.toThrow("invalid_transition");
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

  it("Corporate's signature (the CEO's) is loaded by SM Global only, and the organization answers its name", async () => {
    const api = await as(seed.U_ANDREA);
    await expect(api.network.setOfficeSignature(seed.ORG_GLOBAL, { name: "firma.png" })).rejects.toThrow("forbidden");
    await api.session.setViewAs(seed.U_MARYLIN);
    expect(await api.network.setOfficeSignature(seed.ORG_GLOBAL, { name: "firma-marilyn.png" })).toMatchObject({ signature_file_name: "firma-marilyn.png" });
    expect((await api.organizations.list()).find((o) => o.id === seed.ORG_GLOBAL)?.signature_file_name).toBe("firma-marilyn.png");
  });
});
