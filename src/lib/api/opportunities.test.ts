// Part 2 of the entry flow: Bishop opportunities born from the lead, framework gate, accept, release, tripartite.
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
const idOf = async (name: string) => {
  const api = await as(seed.U_NICOLAS);
  return (await api.leads.list()).find((l) => l.business.name === name)!.id;
};

describe("Bishop opportunities", () => {
  it("are born from leads with NDA and MOU signed, by phase; the owner's name and contact stay hidden", async () => {
    const api = await as(net.U_LAURA);
    const list = await api.bishop.listOpportunities();
    const phases = list.map((o) => o.phase);
    expect(phases).toContain("in_review");
    expect(phases).toContain("available");
    // Sol Remodeling belongs to Jefferson: other Bishops never see it.
    // Before accepting nobody sees names (Techos Delgado is Laura's own, accepted: she does).
    const notMine = list.filter((o) => o.phase === "in_review" || o.phase === "available");
    expect(notMine.some((o) => o.business_name !== null || o.owner_name !== null)).toBe(false);
    expect(JSON.stringify(await api.bishop.getOpportunity(list[0]!.id))).not.toMatch(/@|\+1 /);
  });
  it("the program amount is the SM Global rule (USD 150,000)", async () => {
    const [o] = await (await as(net.U_LAURA)).bishop.listOpportunities();
    expect(o?.investment).toBe(150000);
  });
  it("a Bishop without the framework agreement sees none until he signs it", async () => {
    const api = await as(net.U_DIEGO);
    expect(await api.bishop.listOpportunities()).toEqual([]);
    const fw = (await api.bishop.listAgreements()).find((a) => a.kind === "framework")!;
    await api.documents.signContract(fw.contract!.id);
    expect((await api.bishop.listOpportunities()).length).toBeGreaterThan(0);
  });
  it("cannot be accepted while documents are in review", async () => {
    const api = await as(net.U_LAURA);
    const inReview = (await api.bishop.listOpportunities()).find((o) => o.phase === "in_review")!;
    await expect(api.bishop.acceptOpportunity(inReview.id)).rejects.toThrow("not_available");
  });
  it("the first Bishop takes it: it disappears for the others and SM sees who accepted", async () => {
    const brisa = await idOf("Brisa Clean Services");
    const api = await as(net.U_LAURA);
    const o = await api.bishop.acceptOpportunity(brisa);
    expect(o).toMatchObject({ phase: "accepted_by_you", business_name: "Brisa Clean Services", owner_name: "Gabriela Fuentes" });
    await api.session.setViewAs(net.U_JEFFERSON);
    expect((await api.bishop.listOpportunities()).some((x) => x.id === brisa)).toBe(false);
    await api.session.setViewAs(seed.U_NICOLAS);
    const inv = (await api.leads.getInvestors(brisa))!;
    expect(inv.bishop?.name).toBe("Laura Ortega");
    expect(inv.views.map((v) => v.name).sort()).toEqual(["Jefferson Paula", "Laura Ortega"]);
  });
  it("Brisa Clean: two Bishops saw it and one passed", async () => {
    const inv = (await (await as(seed.U_NICOLAS)).leads.getInvestors(await idOf("Brisa Clean Services")))!;
    expect(inv.views).toHaveLength(2);
    expect(inv.views.filter((v) => v.decision === "passed").map((v) => v.name)).toEqual(["Laura Ortega"]);
    expect(inv.bishop).toBeNull();
  });
  it("release needs a reason and gives it back to everyone", async () => {
    const sol = await idOf("Sol Remodeling");
    const api = await as(seed.U_NICOLAS);
    await expect(api.leads.releaseOpportunity(sol, " ")).rejects.toThrow("reason_required");
    const l = await api.leads.releaseOpportunity(sol, "No respondió en 3 semanas");
    expect(l).toMatchObject({ bishop_user_id: null, tripartite: "none" });
    await api.session.setViewAs(net.U_LAURA);
    expect((await api.bishop.listOpportunities()).find((o) => o.id === sol)?.phase).toBe("available");
  });
  it("tripartite: three signers, 2 of 3 signed for Sol; Jefferson signs from his portal and it moves to funds pending", async () => {
    const sol = await idOf("Sol Remodeling");
    const api = await as(net.U_JEFFERSON);
    const d = (await api.bishop.getOpportunity(sol))!;
    expect(d.phase).toBe("in_contract");
    expect(d.tripartite!.signers.map((s) => s.party)).toEqual(["owner", "sm", "bishop"]);
    expect(d.tripartite!.signers.filter((s) => s.status === "signed")).toHaveLength(2);
    await api.documents.signContract(d.tripartite!.id);
    expect((await api.bishop.getOpportunity(sol))!.phase).toBe("funds_pending");
  });
  it("SM sends the tripartite only with a Bishop", async () => {
    const brisa = await idOf("Brisa Clean Services");
    const api = await as(seed.U_NICOLAS);
    await expect(api.leads.sendTripartite(brisa)).rejects.toThrow("invalid_state");
  });
});
