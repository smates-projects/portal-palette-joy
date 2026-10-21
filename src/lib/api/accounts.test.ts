import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";
import { leads as miamiLeads } from "./mock/seed-leads";
import type { CreateFirmInput, InviteUserInput } from "./types";

const as = async (userId: string) => {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
};
const invite = (over: Partial<InviteUserInput>): InviteUserInput => ({
  full_name: "Persona Nueva", email: `nueva-${Math.random().toString(16).slice(2)}@x.com`, role: "sm_team", organization_id: seed.ORG_SM, business_id: null, title: null, is_admin: false, ...over,
});
const firmInput = (over: Partial<CreateFirmInput> = {}): CreateFirmInput => ({
  name: "Nueva Agencia", area: "B5", internal: false, specialty: null, contact_name: "Pat Contacto", email: "hola@nuevaagencia.com", phone: null, city: null,
  first_person: { full_name: "Pat Contacto", email: `pat-${Math.random().toString(16).slice(2)}@nuevaagencia.com`, title: "Directora" }, ...over,
});

describe("a Bishop's framework agreement", () => {
  it("is created with the invitation; SM Global lists it with can_sign and countersigns it from Acuerdos", async () => {
    const api = await as(seed.U_MARYLIN);
    const bishop = await api.users.invite(invite({ role: "bishop", organization_id: null, business_id: null }));
    const mine = (await api.documents.listFrameworkAgreements()).find((c) => c.signers.some((s) => s.party === "bishop" && s.user_id === bishop.id))!;
    expect(mine).toMatchObject({ kind: "framework", state: "sent", can_sign: true, my_signature: "pending" });
    expect(mine.pending_parties).toEqual([bishop.full_name, "Marilyn Boraei"]);
    // Idempotent repair call answers the same agreement.
    expect((await api.users.createFrameworkAgreement(bishop.id)).id).toBe(mine.id);
    const signed = await api.documents.signContract(mine.id, { kind: "typed", image_url: "data:image/png;base64,x" });
    expect(signed.signers.find((s) => s.party === "sm")).toMatchObject({ status: "signed", name: "Marilyn Boraei" });
    // Diego's seeded one waits for both; Jefferson's is signed by both.
    const all = await api.documents.listFrameworkAgreements();
    expect(all.find((c) => c.signers.some((s) => s.user_id === net.U_DIEGO))).toMatchObject({ state: "sent", can_sign: true });
    expect(all.find((c) => c.signers.some((s) => s.user_id === net.U_JEFFERSON))).toMatchObject({ state: "signed", can_sign: false, pending_parties: [] });
    const office = await as(seed.U_ANDREA);
    await expect(office.documents.listFrameworkAgreements()).rejects.toThrow("forbidden");
  });
});

describe("accounts: who creates whom (mock enforces it)", () => {
  it("the office admin invites SM people of its office as Invitada; acceptance makes them Activa; never deleted", async () => {
    const api = await as(seed.U_ANDREA);
    const u = await api.users.invite(invite({}));
    expect(u.status).toBe("invited");
    expect(u.is_admin).toBe(false);
    const events = await api.users.listAccountEvents(u.id);
    expect(events.map((e) => e.kind)).toEqual(["invited"]);
    const active = await api.users.simulateAcceptance(u.id);
    expect(active.status).toBe("active");
    const off = await api.users.deactivate(u.id, "Dejó la oficina");
    expect(off.status).toBe("inactive");
    expect((await api.users.list()).some((x) => x.id === u.id)).toBe(false);
    expect((await api.users.list({ include_inactive: true })).some((x) => x.id === u.id)).toBe(true);
    const back = await api.users.reactivate(u.id);
    expect(back.status).toBe("active");
    expect((await api.users.listAccountEvents(u.id)).map((e) => e.kind)).toEqual(["reactivated", "deactivated", "accepted", "invited"]);
  });
  it("the office admin cannot create admins, people of another office, owners, or a second person of a firm", async () => {
    const api = await as(seed.U_ANDREA);
    await expect(api.users.invite(invite({ is_admin: true }))).rejects.toThrow("forbidden_admin_not_allowed");
    await expect(api.users.invite(invite({ organization_id: net.ORG_ORLANDO }))).rejects.toThrow("forbidden_other_office");
    await expect(api.users.invite(invite({ role: "business_owner", organization_id: null, business_id: seed.BIZ_VOSSLER }))).rejects.toThrow("forbidden_wrong_role");
    await expect(api.users.invite(invite({ role: "partner_firm", organization_id: seed.ORG_PEREZ, is_admin: true }))).rejects.toThrow("forbidden_firm_has_people");
  });
  it("an SM person without admin, a non-admin firm person and a team member create nobody", async () => {
    await expect((await as(seed.U_NICOLAS)).users.invite(invite({}))).rejects.toThrow("forbidden");
    await expect((await as(seed.U_JULIAN)).users.invite(invite({ role: "partner_firm", organization_id: seed.ORG_PEREZ }))).rejects.toThrow("forbidden");
    await expect((await as(seed.U_ANA_VOSSLER)).users.invite(invite({ role: "business_owner", organization_id: null, business_id: seed.BIZ_VOSSLER }))).rejects.toThrow("forbidden");
  });
  it("the firm admin invites her own people and deactivates them with a reason; not herself, not another firm", async () => {
    const api = await as(seed.U_LUCIA);
    const u = await api.users.invite(invite({ role: "partner_firm", organization_id: seed.ORG_PEREZ }));
    expect(u.organization_id).toBe(seed.ORG_PEREZ);
    await expect(api.users.invite(invite({ role: "partner_firm", organization_id: seed.ORG_XYZ }))).rejects.toThrow("forbidden_other_organization");
    await expect(api.users.deactivate(u.id, "")).rejects.toThrow("reason_required");
    await expect(api.users.deactivate(seed.U_LUCIA, "x")).rejects.toThrow("cannot_deactivate_self");
    await expect(api.users.deactivate(seed.U_TOMAS, "x")).rejects.toThrow("forbidden");
    expect((await api.users.deactivate(seed.U_JULIAN, "Se fue del estudio")).status).toBe("inactive");
  });
  it("SM Global invites anywhere with admin and sees everyone; the owner in charge cannot be deactivated", async () => {
    const api = await as(seed.U_MARYLIN);
    const admin = await api.users.invite(invite({ organization_id: net.ORG_ORLANDO, is_admin: true }));
    expect(admin.is_admin).toBe(true);
    expect((await api.users.listAccountEvents(admin.id)).map((e) => e.kind)).toEqual(["admin_granted", "invited"]);
    await expect(api.users.deactivate(seed.U_CARLA, "x")).rejects.toThrow("owner_in_charge");
    await expect(api.users.invite(invite({ email: "carla@vossler.com" }))).rejects.toThrow("email_taken");
    expect((await api.users.list()).length).toBeGreaterThan(20);
  });
  it("the owner invites a team member with an account behind it and can hand the business over", async () => {
    const api = await as(seed.U_CARLA);
    const m = await api.businessProfile.inviteMember({ name: "Luis Prado", role: "Jefe de obra", email: "luis.prado@vosslerbuild.com" });
    expect(m.state).toBe("invited");
    expect(m.user_id).toBeTruthy();
    await expect(api.businessProfile.makeOwner(m.id)).rejects.toThrow("not_active");
    await api.users.simulateAcceptance(m.user_id!);
    const ana = (await api.businessProfile.listTeam()).find((x) => x.user_id === seed.U_ANA_VOSSLER)!;
    await api.businessProfile.makeOwner(ana.id);
    expect((await api.businesses.list()).find((b) => b.id === seed.BIZ_VOSSLER)?.owner_user_id).toBe(seed.U_ANA_VOSSLER);
    // Carla is no longer in charge: she cannot invite any more.
    await expect(api.businessProfile.inviteMember({ name: "Otra", role: "x", email: "otra@vosslerbuild.com" })).rejects.toThrow("owner_only");
  });
  it("a team member sees the program but never approves", async () => {
    const api = await as(seed.U_ANA_VOSSLER);
    const tasks = await api.tasks.list();
    expect(tasks.length).toBeGreaterThan(0);
    const submitted = tasks.find((t) => t.status === "submitted")!;
    await expect(api.tasks.approve(submitted.id)).rejects.toThrow("owner_only");
  });
});

describe("partner firms: one active per area, replace with open tasks, never deleted", () => {
  it("the office admin adds a firm with its first person as admin; the area must be free", async () => {
    const api = await as(seed.U_ANDREA);
    await expect(api.organizations.createFirm(firmInput())).rejects.toThrow("area_taken");
    const firm = await api.organizations.createFirm(firmInput({ area: "B1", name: "SM Miami Estrategia", internal: true }));
    expect(firm.firm_status).toBe("active");
    expect(firm.internal).toBe(true);
    const person = (await api.users.list()).find((u) => u.organization_id === firm.id)!;
    expect(person.is_admin).toBe(true);
    expect(person.status).toBe("invited");
    expect((await api.organizations.listFirmEvents(firm.id)).map((e) => e.kind)).toEqual(["created"]);
    await expect((await as(seed.U_NICOLAS)).organizations.createFirm(firmInput({ area: "B2" }))).rejects.toThrow("forbidden");
    // Another office's admin never touches a Miami firm.
    await api.session.setViewAs(net.U_VALENTINA);
    await expect(api.organizations.updateFirm(firm.id, { phone: "1" })).rejects.toThrow("forbidden");
  });
  it("replacing a firm moves its open tasks to the new firm (transfer) and keeps the old one inactive with history", async () => {
    const api = await as(seed.U_ANDREA);
    const before = (await api.tasks.list()).filter((t) => t.organization_id === seed.ORG_XYZ && t.status !== "accepted");
    expect(before.length).toBeGreaterThan(0);
    const next = await api.organizations.replaceFirm(seed.ORG_XYZ, firmInput(), "transfer");
    const person = (await api.users.list()).find((u) => u.organization_id === next.id)!;
    const after = await api.tasks.list();
    for (const t of before) {
      const moved = after.find((x) => x.id === t.id)!;
      expect(moved.organization_id).toBe(next.id);
      expect(moved.assignee_user_id).toBe(person.id);
    }
    const old = (await api.organizations.list()).find((o) => o.id === seed.ORG_XYZ)!;
    expect(old.firm_status).toBe("inactive");
    expect(old.replaced_by_id).toBe(next.id);
    const events = await api.organizations.listFirmEvents(seed.ORG_XYZ);
    expect(events[0]?.kind).toBe("replaced");
    expect(events[0]?.moved_tasks).toBe(before.length);
    // The old assignee was told about every moved task.
    await api.session.setViewAs(seed.U_TOMAS);
    const notifs = await api.notifications.list();
    expect(notifs.filter((n) => n.kind === "task_updated" && n.change?.field === "assignee").length).toBe(before.length);
    // A second replacement of the same area now goes against the new firm; the old one cannot be replaced again.
    await api.session.setViewAs(seed.U_ANDREA);
    await expect(api.organizations.replaceFirm(seed.ORG_XYZ, firmInput(), "keep")).rejects.toThrow("already_inactive");
  });
  it("with 'keep', open tasks finish with the previous firm and new programs go to the new one", async () => {
    const api = await as(seed.U_ANDREA);
    const before = (await api.tasks.list()).filter((t) => t.organization_id === seed.ORG_DELTA && t.status !== "accepted");
    const next = await api.organizations.replaceFirm(seed.ORG_DELTA, firmInput({ area: "B3", name: "Contadores Nuevos" }), "keep");
    const after = await api.tasks.list();
    expect(before.every((t) => after.find((x) => x.id === t.id)?.organization_id === seed.ORG_DELTA)).toBe(true);
    expect((await api.organizations.listFirmEvents(next.id))[0]?.kind).toBe("took_over");
  });
  it("retiring a firm leaves the area without firm; an SM Global office checklist ignores it", async () => {
    const api = await as(seed.U_ANDREA);
    await expect(api.organizations.deactivateFirm(seed.ORG_OPSLAB, "")).rejects.toThrow("reason_required");
    const firm = await api.organizations.deactivateFirm(seed.ORG_OPSLAB, "Cerró la consultora");
    expect(firm.firm_status).toBe("inactive");
    expect(firm.deactivation_reason).toBe("Cerró la consultora");
    await api.session.setViewAs(seed.U_MARYLIN);
    const office = await api.network.getOffice(seed.ORG_SM);
    expect(office?.firms.some((f) => f.id === seed.ORG_OPSLAB)).toBe(false);
  });
});

describe("manual leads", () => {
  it("SM adds a business by hand in Evaluado with source manual and no result; sending the assessment leaves it pending", async () => {
    const api = await as(seed.U_NICOLAS);
    const lead = await api.leads.createManual({
      contact: { name: "Pedro Referido", email: "pedro@referido.com", phone: "+1 305 555 0000", city: "Miami", state: "FL", hispanic_owner: "yes" },
      business: { name: "Referido SA", industry: "cleaning", activity: "Limpieza", revenue_range: "500k_750k", margin_range: "margin_0_20", team_range: "team_6_10", years_range: "years_6_10", has_active_clients: true },
      origin_note: "Referido de Carla Méndez",
    });
    expect(lead.stage).toBe("evaluated");
    expect(lead.source).toBe("manual");
    expect(lead.result).toBeNull();
    expect(lead.consultant_user_id).toBe(seed.U_NICOLAS);
    const detail = await api.leads.get(lead.id);
    expect(detail?.events.map((e) => e.kind)).toEqual(["created_manual", "note"]);
    const sent = await api.leads.sendAssessment(lead.id);
    expect(sent.assessment_sent_at).toBeTruthy();
    // A lead that came through the assessment never gets it sent again.
    await expect(api.leads.sendAssessment(miamiLeads[0]!.id)).rejects.toThrow("not_manual");
    await expect((await as(seed.U_MARYLIN)).leads.createManual({ contact: lead.contact, business: lead.business, origin_note: null })).rejects.toThrow("sm_only");
  });
});

describe("business brand (white label)", () => {
  it("Vossler has the brand of its approved B5-13; owner and team see it, firms, SM and Bishop do not", async () => {
    const carla = await as(seed.U_CARLA);
    const mine = await carla.brand.getMine();
    expect(mine?.business_id).toBe(seed.BIZ_VOSSLER);
    expect(mine?.source).toBe("b5_13");
    expect(mine?.primary_color).toBe(seed.VOSSLER_BRAND.primary_color);
    expect((await (await as(seed.U_ANA_VOSSLER)).brand.getMine())?.business_id).toBe(seed.BIZ_VOSSLER);
    for (const id of [seed.U_LUCIA, seed.U_TOMAS, seed.U_NICOLAS, seed.U_MARYLIN, net.U_JEFFERSON]) {
      expect(await (await as(id)).brand.getMine()).toBeNull();
    }
    await expect((await as(seed.U_LUCIA)).brand.get(seed.BIZ_VOSSLER)).rejects.toThrow("forbidden");
    await expect((await as(net.U_JEFFERSON)).brand.get(seed.BIZ_VOSSLER)).rejects.toThrow("forbidden");
    // Another owner never reads it; the SM team of the office and SM Global do.
    expect((await (await as(seed.U_DANIEL)).brand.get())).toBeNull();
    expect((await (await as(seed.U_NICOLAS)).brand.get(seed.BIZ_VOSSLER))?.business_id).toBe(seed.BIZ_VOSSLER);
    await expect((await as(net.U_VALENTINA)).brand.get(seed.BIZ_VOSSLER)).rejects.toThrow("forbidden");
    expect((await (await as(seed.U_MARYLIN)).brand.get(seed.BIZ_VOSSLER))?.business_id).toBe(seed.BIZ_VOSSLER);
  });
  it("approving B5-13 with a brand applies it and tells the owner; the owner can go back and SM can load one by hand", async () => {
    const api = await as(seed.U_ENYERMY);
    expect(await api.brand.getMine()).toBeNull();
    // Enyermy's B5-01 is approved, so B5-13 is not blocked.
    const b513 = (await api.tasks.list()).find((t) => t.code === "B5-13" && t.business_id === seed.BIZ_ENYERMY)!;
    // The firm starts and delivers B5-13 with the manual, the logo and the palette it read.
    await api.session.setViewAs(seed.U_TOMAS);
    await api.tasks.start(b513.id);
    const palette = { primary_color: "#5a2a83", accent_color: "#f2b134", font_family: "Poppins", logo_file_name: "Enyermy_logo.png", logo_url: null, manual_file_name: "Enyermy_manual.pdf" };
    await api.tasks.submitVersion(b513.id, { note: "Manual de marca", file_names: ["Enyermy_manual.pdf", "Enyermy_logo.png"], brand: palette });
    await api.session.setViewAs(seed.U_ENYERMY);
    expect(await api.brand.getMine()).toBeNull();
    await api.tasks.approve(b513.id);
    const applied = await api.brand.getMine();
    expect(applied?.primary_color).toBe("#5a2a83");
    expect(applied?.source).toBe("b5_13");
    expect(applied?.version).toBe(1);
    expect((await api.notifications.list()).some((n) => n.kind === "brand_applied" && n.task_id === b513.id)).toBe(true);
    expect((await api.brand.listEvents(seed.BIZ_ENYERMY))[0]?.kind).toBe("applied_from_b5_13");
    // The owner goes back to the SM brand; SM loads one by hand; the owner of another business cannot.
    await api.brand.reset(seed.BIZ_ENYERMY);
    expect(await api.brand.getMine()).toBeNull();
    await api.session.setViewAs(seed.U_CAMILA);
    const manual = await api.brand.set(seed.BIZ_ENYERMY, { primary_color: "#264653", accent_color: "#e9c46a", font_family: null, logo_file_name: null, logo_url: null });
    expect(manual.source).toBe("manual_sm");
    await expect(api.brand.set(seed.BIZ_ENYERMY, { primary_color: "red", accent_color: "#e9c46a", font_family: null, logo_file_name: null, logo_url: null })).rejects.toThrow("invalid_color");
    await api.session.setViewAs(seed.U_CARLA);
    await expect(api.brand.set(seed.BIZ_ENYERMY, { primary_color: "#264653", accent_color: "#e9c46a", font_family: null, logo_file_name: null, logo_url: null })).rejects.toThrow("forbidden");
    await expect(api.brand.reset(seed.BIZ_ENYERMY)).rejects.toThrow("forbidden");
  });
  it("approving B5-13 without a brand attached changes nothing", async () => {
    const api = await as(seed.U_ENYERMY);
    const b513 = (await api.tasks.list()).find((t) => t.code === "B5-13" && t.business_id === seed.BIZ_ENYERMY)!;
    await api.session.setViewAs(seed.U_TOMAS);
    await api.tasks.start(b513.id);
    await api.tasks.submitVersion(b513.id, { note: "Sin manual", file_names: ["B5-13.pdf"] });
    await api.session.setViewAs(seed.U_ENYERMY);
    await api.tasks.approve(b513.id);
    expect(await api.brand.getMine()).toBeNull();
  });
  it("franchises inherit the franchisor's brand, follow its changes and cannot edit it", async () => {
    const luisa = await as(net.U_LUISA);
    expect(await luisa.brand.getMine()).toBeNull();
    await luisa.session.setViewAs(seed.U_NICOLAS);
    await luisa.brand.set(seed.BIZ_BIMBO, { primary_color: "#8c2f39", accent_color: "#e8b04b", font_family: "Lato", logo_file_name: "Bimbo_logo.png", logo_url: null });
    await luisa.session.setViewAs(net.U_LUISA);
    const inherited = await luisa.brand.getMine();
    expect(inherited?.business_id).toBe(seed.BIZ_BIMBO);
    expect(inherited?.primary_color).toBe("#8c2f39");
    expect((await luisa.brand.get())?.business_id).toBe(seed.BIZ_BIMBO);
    await expect(luisa.brand.set(seed.BIZ_BIMBO, { primary_color: "#000000", accent_color: "#e8b04b", font_family: null, logo_file_name: null, logo_url: null })).rejects.toThrow("forbidden");
    await expect(luisa.brand.reset(seed.BIZ_BIMBO)).rejects.toThrow("forbidden");
    // The franchisor resets: the franchise follows.
    await luisa.session.setViewAs(seed.U_RODRIGO_BIMBO);
    await luisa.brand.reset(seed.BIZ_BIMBO);
    await luisa.session.setViewAs(net.U_LUISA);
    expect(await luisa.brand.getMine()).toBeNull();
  });
});
