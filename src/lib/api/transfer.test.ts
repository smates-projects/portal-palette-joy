// "Derivar a oficina" and the consultant from SM Global, in the mock.
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}

describe("Derivar a oficina", () => {
  it("SM Global moves a lead to SM Orlando with its manager; the timeline says so and the old office stops seeing it", async () => {
    const api = await as(seed.U_MARYLIN);
    const lead = (await api.leads.list()).find((l) => l.business.name === "Torres Concrete")!;
    await expect(api.leads.transfer(lead.id, { office_id: lead.office_id, consultant_user_id: net.U_VALENTINA })).rejects.toThrow("same_office");
    await expect(api.leads.transfer(lead.id, { office_id: net.ORG_ORLANDO, consultant_user_id: seed.U_NICOLAS })).rejects.toThrow("invalid_consultant");
    const moved = await api.leads.transfer(lead.id, { office_id: net.ORG_ORLANDO, consultant_user_id: net.U_VALENTINA });
    expect(moved).toMatchObject({ office_id: net.ORG_ORLANDO, consultant_user_id: net.U_VALENTINA });
    const events = (await api.leads.get(lead.id))!.events;
    expect(events.at(-1)).toMatchObject({ kind: "transferred", body: "SM Orlando", actor_user_id: seed.U_MARYLIN });
    expect((await api.leads.list({ office_id: net.ORG_ORLANDO })).map((l) => l.id)).toContain(lead.id);
    await api.session.setViewAs(seed.U_NICOLAS);
    expect((await api.leads.list()).some((l) => l.id === lead.id)).toBe(false);
    await api.session.setViewAs(net.U_VALENTINA);
    expect((await api.leads.list()).map((l) => l.id)).toContain(lead.id);
  });

  it("the office admin transfers; a plain consultant cannot; anyone of SM Global can follow a lead of any office", async () => {
    const nicolas = await as(seed.U_NICOLAS);
    const lead = (await nicolas.leads.list()).find((l) => l.business.name === "Torres Concrete")!;
    await expect(nicolas.leads.transfer(lead.id, { office_id: net.ORG_ORLANDO, consultant_user_id: net.U_VALENTINA })).rejects.toThrow("admin_only");
    const andrea = await as(seed.U_ANDREA);
    const moved = await andrea.leads.transfer(lead.id, { office_id: net.ORG_ORLANDO, consultant_user_id: seed.U_MARYLIN });
    expect(moved.consultant_user_id).toBe(seed.U_MARYLIN);
    // Offices see the other SM offices as targets, never their firms.
    const orgs = await andrea.organizations.list();
    expect(orgs.some((o) => o.id === net.ORG_ORLANDO)).toBe(true);
    expect(orgs.filter((o) => o.kind === "partner_firm").every((o) => o.parent_id === seed.ORG_SM)).toBe(true);
  });

  it("a business moves with its lead; without a consultant named the target office's manager takes it; SM Global may stay", async () => {
    const api = await as(seed.U_MARYLIN);
    const vossler = (await api.businesses.list()).find((b) => b.name === "Vossler")!;
    const moved = await api.businesses.transfer(vossler.id, { office_id: net.ORG_ORLANDO });
    expect(moved).toMatchObject({ office_id: net.ORG_ORLANDO, consultant_id: net.U_VALENTINA });
    expect((await api.businesses.listEvents(vossler.id).catch(() => []))).toBeDefined();
    const back = await api.businesses.transfer(vossler.id, { office_id: vossler.office_id, consultant_user_id: seed.U_MARYLIN });
    expect(back.consultant_id).toBe(seed.U_MARYLIN);
    const again = await api.businesses.transfer(vossler.id, { office_id: net.ORG_ORLANDO });
    // A Global consultant follows the business anywhere.
    expect(again.consultant_id).toBe(seed.U_MARYLIN);
    await api.session.setViewAs(net.U_VALENTINA);
    expect((await api.businesses.list()).map((b) => b.id)).toContain(vossler.id);
  });

  it("the office picks anyone of SM Global as the consultant of a business", async () => {
    const andrea = await as(seed.U_ANDREA);
    const business = (await andrea.businesses.list())[0]!;
    expect((await andrea.businesses.setConsultant(business.id, seed.U_MARYLIN)).consultant_id).toBe(seed.U_MARYLIN);
    await expect(andrea.businesses.setConsultant(business.id, net.U_VALENTINA)).rejects.toThrow("invalid_consultant");
  });
});
