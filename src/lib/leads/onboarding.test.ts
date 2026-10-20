import { describe, expect, it } from "vitest";
import { createMockApi } from "@/lib/api/mock";
import * as seed from "@/lib/api/mock/seed";
import type { BusinessDocument, Contract, Signer } from "@/lib/api/types";
import { docsApproval, isDocsAdmin, reviewClock } from "./onboarding";

const doc = (state: BusinessDocument["state"], name = "Doc", pauses: BusinessDocument["pauses"] = []): BusinessDocument => ({
  id: name, business_id: "b", area: "intake", name, state, requested_at: "2026-10-01", received_at: null, file_name: null, required: true, pauses,
});
const signer = (party: "owner" | "sm", status: Signer["status"]): Signer => ({ name: party, role: party, party, status, signed_at: null });
const contract = (kind: "nda" | "mou", owner: Signer["status"], sm: Signer["status"]): Contract => ({
  id: kind, business_id: "b", area: "intake", kind, name: kind === "nda" ? "NDA mutuo" : "MOU", state: "sent", sent_at: "2026-10-01", signed_at: null,
  signers: [signer("owner", owner), signer("sm", sm)],
});

describe("review clock (15 days)", () => {
  it("does not start until every required document is uploaded", () => {
    expect(reviewClock({ started_at: null, approved_at: null, docs: [doc("requested")], total: 15, today: "2026-10-14" })).toMatchObject({ status: "waiting_upload", day: 0, tone: "ok" });
  });
  it("counts days from the full upload: day 6 of 15, amber from day 11, red after 15", () => {
    expect(reviewClock({ started_at: "2026-10-08", approved_at: null, docs: [doc("received")], total: 15, today: "2026-10-14" })).toMatchObject({ status: "running", day: 6, tone: "ok" });
    expect(reviewClock({ started_at: "2026-10-03", approved_at: null, docs: [doc("received")], total: 15, today: "2026-10-14" })).toMatchObject({ day: 11, tone: "amber" });
    expect(reviewClock({ started_at: "2026-09-27", approved_at: null, docs: [doc("received")], total: 15, today: "2026-10-14" })).toMatchObject({ day: 17, tone: "red" });
  });
  it("pauses while a document is asked again, and the paused days do not count", () => {
    const open = reviewClock({ started_at: "2026-10-01", approved_at: null, docs: [doc("rejected", "Seguro", [{ from: "2026-10-10", to: null }])], total: 15, today: "2026-10-14" });
    expect(open).toMatchObject({ status: "paused", day: 9 });
    const closed = reviewClock({ started_at: "2026-10-01", approved_at: null, docs: [doc("received", "Seguro", [{ from: "2026-10-05", to: "2026-10-08" }])], total: 15, today: "2026-10-14" });
    expect(closed).toMatchObject({ status: "running", day: 10 });
  });
});

describe("Aprobar documentación", () => {
  it("needs NDA and MOU signed by both", () => {
    expect(docsApproval([contract("nda", "signed", "signed"), contract("mou", "signed", "sent")], [doc("reviewed")])).toEqual({ ok: false, reason: "contracts", missing: ["MOU"] });
  });
  it("needs every required document accepted, and names what is missing", () => {
    const signed = [contract("nda", "signed", "signed"), contract("mou", "signed", "signed")];
    expect(docsApproval(signed, [doc("reviewed", "EIN"), doc("rejected", "Seguro vigente")])).toEqual({ ok: false, reason: "documents", missing: ["Seguro vigente"] });
    expect(docsApproval(signed, [doc("reviewed", "EIN"), doc("reviewed", "Seguro vigente")])).toEqual({ ok: true });
  });
  it("is given only by the office admin or an SM Global admin", () => {
    expect(isDocsAdmin({ role: "sm_team", is_admin: true, organization_id: "miami" }, "miami")).toBe(true);
    expect(isDocsAdmin({ role: "sm_team", is_admin: true, organization_id: "orlando" }, "miami")).toBe(false);
    expect(isDocsAdmin({ role: "sm_team", is_admin: false, organization_id: "miami" }, "miami")).toBe(false);
    expect(isDocsAdmin({ role: "sm_global", is_admin: true, organization_id: "global" }, "miami")).toBe(true);
    expect(isDocsAdmin({ role: "business_owner", is_admin: true, organization_id: null }, "miami")).toBe(false);
  });
});

describe("entry flow in the mock", () => {
  it("'Se hizo' on Rivera's meeting sends the documents: Documentación, the 14 documents locked until the MOU is signed", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const rivera = (await api.leads.list()).find((l) => l.business.name === "Rivera Roofing & Remodel")!;
    // The booking already created the NDA, Strategic Mates pre-signed.
    const before = (await api.leads.getIntake(rivera.id))!;
    expect(before.contracts.map((c) => c.kind)).toEqual(["nda"]);
    expect(before.contracts[0]!.signers.find((s) => s.party === "sm")!.status).toBe("signed");
    expect(before.documents).toHaveLength(0);
    const moved = await api.leads.setMeetingOutcome(rivera.id, rivera.meeting!.id!, { outcome: "held", note: "Quiere empezar en enero" });
    expect(moved.stage).toBe("documents");
    const intake = (await api.leads.getIntake(rivera.id))!;
    // The MOU comes with the owner's NDA signature, not with the meeting.
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda"]);
    expect(intake.documents).toHaveLength(14);
    expect(intake.summary.required_total).toBe(13);
    expect(intake.documents.every((d) => d.locked_until_mou)).toBe(true);
    expect(intake.summary.clock.status).toBe("waiting_upload");
    // Program screens do not list a business that is still entering.
    expect((await api.businesses.list()).some((b) => b.id === moved.business_id)).toBe(false);
  });
  it("the owner uploads only after confirming the four MOU points and signing it", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const rivera = (await api.leads.list()).find((l) => l.business.name === "Rivera Roofing & Remodel")!;
    await api.leads.setMeetingOutcome(rivera.id, rivera.meeting!.id!, { outcome: "held" });
    const { documents, contracts } = (await api.leads.getIntake(rivera.id))!;
    const owner = (await api.users.list()).find((u) => u.email === rivera.contact.email)!;
    await api.session.setViewAs(owner.id);
    await api.documents.signContract(contracts.find((c) => c.kind === "nda")!.id);
    const mou = (await api.documents.listContracts()).find((c) => c.kind === "mou")!;
    await expect(api.documents.uploadDocument(documents[0]!.id, { name: "banco.pdf" })).rejects.toThrow("mou_required");
    await expect(api.documents.signContract(mou.id)).rejects.toThrow("acknowledgment_required");
    await expect(api.documents.acknowledge(mou.id, ["business_stays_yours"])).rejects.toThrow("invalid_points");
    await api.documents.acknowledge(mou.id, ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"]);
    await api.documents.signContract(mou.id);
    expect((await api.documents.uploadDocument(documents[0]!.id, { name: "banco.pdf" })).state).toBe("received");
  });
  it("sample data: Castillo paused with 5 of 13 uploaded and 3 accepted; Navarro at day 17 of 15", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const leads = await api.leads.list();
    const sazon = leads.find((l) => l.business.name === "Castillo Instalaciones")!.intake!;
    expect(sazon).toMatchObject({ uploaded: 5, accepted: 3, required_total: 13 });
    expect(sazon.clock.status).toBe("paused");
    const glow = leads.find((l) => l.business.name === "Navarro Cercas y Portones")!.intake!;
    expect(glow.clock).toMatchObject({ day: 17, total: 15, tone: "red" });
  });
  it("sample data: Yesenia Morales signed the NDA, the MOU waits for her and her 14 documents stay locked", async () => {
    const api = createMockApi();
    const owner = (await api.session.getViewAsOptions()).find((o) => o.business?.name === "Morales Pisos y Cerámica")!;
    expect(owner.user).toMatchObject({ full_name: "Yesenia Morales", role: "business_owner" });
    expect(owner.user.is_admin).toBeFalsy();
    expect(owner.business?.status).toBe("onboarding");
    await api.session.setViewAs(owner.user.id);
    const contracts = (await api.documents.listContracts()).filter((c) => c.area === "intake");
    const nda = contracts.find((c) => c.kind === "nda")!;
    const mou = contracts.find((c) => c.kind === "mou")!;
    expect(nda.state).toBe("signed");
    expect(mou.signers.find((s) => s.party === "sm")!.status).toBe("signed");
    expect(mou.signers.find((s) => s.party === "owner")!.status).toBe("opened");
    await api.session.setViewAs(seed.U_NICOLAS);
    const intake = (await api.leads.list()).find((l) => l.business.name === "Morales Pisos y Cerámica")!.intake!;
    expect(intake).toMatchObject({ uploaded: 0, accepted: 0, required_total: 13, mou_sent: true, mou_signed_by_owner: false });
    expect(intake.clock).toMatchObject({ day: 0, status: "waiting_upload", tone: "ok" });
    const docs = (await api.leads.getIntake((await api.leads.list()).find((l) => l.business.name === "Morales Pisos y Cerámica")!.id))!.documents;
    expect(docs.every((d) => d.state === "requested" && d.locked_until_mou)).toBe(true);
    // She has not confirmed the four points yet.
    expect(mou.signers.find((s) => s.party === "owner")!.acknowledgments ?? []).toEqual([]);
  });
  it("sample data: Castillo signed the NDA and the MOU after confirming the four points", async () => {
    const api = createMockApi();
    const owner = (await api.session.getViewAsOptions()).find((o) => o.business?.name === "Castillo Instalaciones")!;
    await api.session.setViewAs(owner.user.id);
    const contracts = (await api.documents.listContracts()).filter((c) => c.area === "intake");
    expect(contracts.find((c) => c.kind === "nda")!.state).toBe("signed");
    const mou = contracts.find((c) => c.kind === "mou")!;
    expect(mou.state).toBe("signed");
    expect(mou.signers.find((s) => s.party === "owner")!.acknowledgments).toHaveLength(4);
    expect((await api.documents.listDocuments()).filter((d) => d.area === "intake").some((d) => d.locked_until_mou)).toBe(false);
  });
  it("accepting a document needs a non-empty verified fact (fact_required), like the API", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const glow = (await api.leads.list()).find((l) => l.business.name === "Navarro Cercas y Portones")!;
    const { documents } = (await api.leads.getIntake(glow.id))!;
    const received = documents.find((d) => d.state === "received")!;
    await expect(api.leads.acceptDocument(glow.id, received.id, "   ")).rejects.toThrow("fact_required");
    expect((await api.leads.acceptDocument(glow.id, received.id, " Ventas 2025 ")).verified_fact).toBe("Ventas 2025");
  });
  it("only an admin approves, and only when everything is signed and accepted", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const glow = (await api.leads.list()).find((l) => l.business.name === "Navarro Cercas y Portones")!;
    const { documents } = (await api.leads.getIntake(glow.id))!;
    for (const d of documents.filter((x) => x.state === "received")) await api.leads.acceptDocument(glow.id, d.id, "Verificado");
    await expect(api.leads.approveDocuments(glow.id)).rejects.toThrow("admin_only");
    await api.session.setViewAs(seed.U_ANDREA);
    expect((await api.leads.approveDocuments(glow.id)).stage).toBe("accepted");
  });
});
