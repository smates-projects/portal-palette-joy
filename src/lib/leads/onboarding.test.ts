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
  it("Enviar NDA y MOU creates the owner, the business in onboarding, both contracts and the 7 documents", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const rivera = (await api.leads.list()).find((l) => l.business.name === "Rivera Roofing & Remodel")!;
    const moved = await api.leads.sendNdaMou(rivera.id);
    expect(moved.stage).toBe("documents");
    const intake = (await api.leads.getIntake(rivera.id))!;
    expect(intake.contracts.map((c) => c.kind)).toEqual(["nda", "mou"]);
    expect(intake.documents).toHaveLength(7);
    expect(intake.summary.clock.status).toBe("waiting_upload");
    // Program screens do not list a business that is still entering.
    expect((await api.businesses.list()).some((b) => b.id === moved.business_id)).toBe(false);
  });
  it("the owner uploads only after signing the NDA", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const rivera = (await api.leads.list()).find((l) => l.business.name === "Rivera Roofing & Remodel")!;
    await api.leads.sendNdaMou(rivera.id);
    const { documents, contracts } = (await api.leads.getIntake(rivera.id))!;
    const owner = (await api.users.list()).find((u) => u.email === rivera.contact.email)!;
    await api.session.setViewAs(owner.id);
    await expect(api.documents.uploadDocument(documents[0]!.id, "banco.pdf")).rejects.toThrow("nda_required");
    await api.documents.signContract(contracts.find((c) => c.kind === "nda")!.id);
    expect((await api.documents.uploadDocument(documents[0]!.id, "banco.pdf")).state).toBe("received");
  });
  it("sample data: Castillo paused with 5 of 7 uploaded and 3 accepted; Morales at day 17 of 15", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const leads = await api.leads.list();
    const sazon = leads.find((l) => l.business.name === "Castillo Instalaciones")!.intake!;
    expect(sazon).toMatchObject({ uploaded: 5, accepted: 3, required_total: 7 });
    expect(sazon.clock.status).toBe("paused");
    const glow = leads.find((l) => l.business.name === "Morales Pisos y Cerámica")!.intake!;
    expect(glow.clock).toMatchObject({ day: 17, total: 15, tone: "red" });
  });
  it("only an admin approves, and only when everything is signed and accepted", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const glow = (await api.leads.list()).find((l) => l.business.name === "Morales Pisos y Cerámica")!;
    const { documents } = (await api.leads.getIntake(glow.id))!;
    for (const d of documents.filter((x) => x.state === "received")) await api.leads.acceptDocument(glow.id, d.id, "Verificado");
    await expect(api.leads.approveDocuments(glow.id)).rejects.toThrow("admin_only");
    await api.session.setViewAs(seed.U_ANDREA);
    expect((await api.leads.approveDocuments(glow.id)).stage).toBe("accepted");
  });
});
