// Tests of the data-layer gaps closed after the screens: manual sections, Bishop readiness, offices, network numbers,
// read-only leads for SM Global and the structure tree. Same style as network.test.ts.
import { describe, expect, it } from "vitest";
import catalogJson from "@/data/catalogo_metodo180.json";
import { expectedFranchisePct } from "@/lib/tasks/office";
import { computeOfficeChecklist } from "./office-checklist";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as seedLeads from "./mock/seed-leads";
import * as net from "./mock/seed-network";
import { MANUAL_SECTION_DEFS } from "./mock/seed-manual";
import type { Lead, Organization, StructureNode, User } from "./types";

/** A mock API already switched to the given user. */
async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
const asGlobal = () => as(seed.U_MARYLIN);
const asOscar = () => as(net.U_OSCAR);

const newOffice = { city: "Jacksonville, FL", manager_name: "Sofía Marín", manager_email: "sofia@strategicmates.com", planned_opening_date: "2027-01-11" };

describe("manual sections", () => {
  it("every catalog code of every section exists in the catalog and belongs to one section only", () => {
    const catalog = new Set((catalogJson as { code: string }[]).map((c) => c.code));
    const all = MANUAL_SECTION_DEFS.flatMap((d) => d.catalog_codes);
    expect(all.filter((code) => !catalog.has(code))).toEqual([]);
    expect(all.filter((code, i) => all.indexOf(code) !== i)).toEqual([]);
    expect(MANUAL_SECTION_DEFS.every((d) => d.catalog_codes.length > 0 && d.body.split("\n\n").length >= 3)).toBe(true);
  });

  it("each code sits in a section that matches its area and name (spot check of the review)", () => {
    const section = (code: string) => MANUAL_SECTION_DEFS.find((d) => d.catalog_codes.includes(code))?.title;
    expect(section("B2-06")).toBe("Ventas"); // estimating is how a job is quoted
    expect(section("B2-16")).toBe("Compras"); // subcontracting is a purchasing decision
    expect(section("B2-07")).toBe("Operación"); // change orders are scope control in the field
    expect(section("B3-15")).toBe("Personas"); // employer tax setup
  });

  it("the sections an owner reads carry their catalog codes and text; one not started has no text yet", async () => {
    const oscar = await (await asOscar()).manual.get();
    expect(oscar.sections.map((s) => s.title)).toEqual(MANUAL_SECTION_DEFS.map((d) => d.title));
    expect(oscar.sections.every((s) => s.catalog_codes.length > 0 && s.body.length > 0)).toBe(true);
    const marta = await (await as(net.U_MARTA)).manual.get();
    expect(marta.sections.find((s) => s.status === "not_started")?.body).toBe("");
  });

  it("a business that just signed gets the six empty sections with their codes", async () => {
    const api = await as(net.U_VALENTINA);
    const lead = (await api.leads.list()).find((l) => l.stage === "contract")!;
    const { business_id } = await api.leads.markContractSigned(lead.id, "2026-10-14");
    const owner = (await api.businesses.list()).find((b) => b.id === business_id)!.owner_user_id;
    await api.session.setViewAs(owner);
    const manual = await api.manual.get();
    expect(manual.sections.map((s) => s.title)).toEqual(MANUAL_SECTION_DEFS.map((d) => d.title));
    expect(manual.sections.every((s) => s.status === "not_started" && s.catalog_codes.length > 0 && s.body === "")).toBe(true);
    expect(manual.activity).toEqual([]);
    // Nothing is approved yet, so nothing can be approved.
    await expect(api.manual.approveSection(manual.sections[0]!.id)).rejects.toThrow("tasks_pending");
  });

  it("the owner approves a section when all its tasks are approved, and it is logged", async () => {
    const api = await asOscar();
    const before = await api.manual.get();
    const atencion = before.sections.find((s) => s.title === "Atención al cliente")!;
    expect(atencion.status).toBe("drafting");
    const approved = await api.manual.approveSection(atencion.id);
    expect(approved).toMatchObject({ status: "approved", pct: 100, updated_at: "2026-10-14" });
    const after = await api.manual.get();
    expect(after.activity[0]).toMatchObject({ section_id: atencion.id, section_title: "Atención al cliente", kind: "approved", actor_user_id: net.U_OSCAR });
    expect(after.activity.length).toBe(before.activity.length + 1);
    expect(after.completion_pct).toBeGreaterThan(before.completion_pct);
    await expect(api.manual.approveSection(atencion.id)).rejects.toThrow("already_approved");
  });

  it("refuses a section with tasks still pending or with no tasks in the business", async () => {
    const oscar = await asOscar();
    const operacion = (await oscar.manual.get()).sections.find((s) => s.title === "Operación")!;
    await expect(oscar.manual.approveSection(operacion.id)).rejects.toThrow("tasks_pending");
    // Prime 10 has no task for Compras: there is nothing to approve.
    const daniel = await as(seed.U_DANIEL);
    const compras = (await daniel.manual.get()).sections.find((s) => s.title === "Compras")!;
    await expect(daniel.manual.approveSection(compras.id)).rejects.toThrow("no_tasks");
  });

  it("only the owner of the business approves: SM, firms, Bishop, franchisee and other owners are refused", async () => {
    const api = await asOscar();
    const section = (await api.manual.get()).sections.find((s) => s.title === "Atención al cliente")!;
    for (const id of [net.U_VALENTINA, seed.U_LUCIA, net.U_JEFFERSON, net.U_LUISA, seed.U_MARYLIN]) {
      await api.session.setViewAs(id);
      await expect(api.manual.approveSection(section.id), id).rejects.toThrow("owner_only");
    }
    // Another owner does not even see it.
    await api.session.setViewAs(seed.U_CARLA);
    await expect(api.manual.approveSection(section.id)).rejects.toThrow("not_found");
    // The section stays as it was.
    await api.session.setViewAs(net.U_OSCAR);
    expect((await api.manual.get()).sections.find((s) => s.id === section.id)?.status).toBe("drafting");
  });

  it("a franchisee reads only published sections with their text, and never the activity", async () => {
    const api = await as(net.U_LUISA);
    const manual = await api.manual.get();
    expect(manual.sections).toHaveLength(6);
    expect(manual.sections.every((s) => s.published_in !== null && s.body.length > 0)).toBe(true);
    expect(manual.activity).toEqual([]);
    expect(manual.completion_pct).toBe(100);
    // Unpublished drafts of another business never reach a franchisee.
    await api.session.setViewAs(seed.U_RODRIGO_BIMBO);
    const own = await api.manual.get();
    expect(own.activity.length).toBeGreaterThan(0);
  });
});

describe("Business Bishop: verified revenue, readiness and agreement files", () => {
  it("verified revenue is on the list and the detail; a business SM has not verified shows none", async () => {
    const api = await as(net.U_JEFFERSON);
    const list = await api.bishop.listOpportunities();
    expect(list.find((o) => o.business_name === "Vossler")?.verified_revenue).toBe(1804000);
    expect(list.find((o) => o.business_name === "Prime 10 Solutions")?.verified_revenue).toBeNull();
    expect((await api.bishop.getOpportunity(net.OPP_VOSSLER))?.verified_revenue).toBe(1804000);
  });

  it("the readiness checklist has the five items, computed from the business data", async () => {
    const api = await as(net.U_JEFFERSON);
    const detail = (await api.bishop.getOpportunity(net.OPP_VOSSLER))!;
    expect(detail.readiness.map((i) => i.key)).toEqual(["franchisability_goal", "required_tasks", "manual_published", "legal_docs", "unit_economics"]);
    expect(detail.readiness.every((i) => !i.done)).toBe(true);
    // The Bishop never reads the rules, yet the checklist follows them: Global lowers the goal and the required list.
    const global = await asGlobal();
    await global.rules.update({ franchisability_goal: 1, required_task_codes: [] });
    await global.session.setViewAs(net.U_JEFFERSON);
    const relaxed = (await global.bishop.getOpportunity(net.OPP_VOSSLER))!;
    expect(relaxed.readiness.filter((i) => i.done).map((i) => i.key)).toEqual(["franchisability_goal", "required_tasks"]);
  });

  it("the checklist is part of the detail only, and only the Bishop reads it", async () => {
    const api = await as(net.U_JEFFERSON);
    const [first] = await api.bishop.listOpportunities();
    expect(first).not.toHaveProperty("readiness");
    for (const id of [seed.U_CARLA, net.U_LUISA, seed.U_NICOLAS, seed.U_MARYLIN]) {
      await api.session.setViewAs(id);
      await expect(api.bishop.getOpportunity(net.OPP_VOSSLER), id).rejects.toThrow("bishop_only");
    }
  });

  it("agreements say if they have a file: signed ones do, the draft does not", async () => {
    const agreements = await (await as(net.U_JEFFERSON)).bishop.listAgreements();
    const signed = agreements.filter((a) => a.state === "signed");
    expect(signed).toHaveLength(2);
    expect(signed.every((a) => a.has_file && a.file_name?.endsWith(".pdf"))).toBe(true);
    expect(agreements.find((a) => a.state === "draft")).toMatchObject({ has_file: false, file_name: null });
  });
});

describe("offices: create, pause and activate (SM Global)", () => {
  it("creates an office in opening, with its manager account and an all-pending checklist", async () => {
    const api = await asGlobal();
    const created = await api.network.createOffice(newOffice);
    expect(created.office).toMatchObject({ name: "SM Jacksonville", kind: "sm", status: "opening", city: "Jacksonville, FL", opened_at: "2027-01-11", parent_id: seed.ORG_GLOBAL });
    expect(created.manager).toMatchObject({ full_name: "Sofía Marín", role: "sm_team", organization_id: created.office.id });
    const detail = (await api.network.getOffice(created.office.id))!;
    expect(detail.team.map((u) => u.full_name)).toEqual(["Sofía Marín"]);
    expect(detail.checklist!.complete).toBe(false);
    expect(Object.fromEntries(detail.checklist!.items.map((i) => [i.key, i.done]))).toEqual({ manager_access: true, booking_link: false, partner_firms: false, first_lead: false });
    // B1 Estrategia is covered by the office's own SM team, so a new office misses only B2 to B6.
    expect(detail.checklist!.items.find((i) => i.key === "partner_firms")!.missing_areas).toEqual(["B2", "B3", "B4", "B5", "B6"]);
    expect((await api.network.listOffices()).map((o) => o.office.name)).toContain("SM Jacksonville");
    expect(detail.stats).toMatchObject({ programs: 0, leads_this_month: 0, conversion_month: null, ready_to_franchise: 0 });
  });

  it("validates the data like the server will", async () => {
    const api = await asGlobal();
    await expect(api.network.createOffice({ ...newOffice, city: "  " })).rejects.toThrow("city_required");
    await expect(api.network.createOffice({ ...newOffice, manager_name: " " })).rejects.toThrow("manager_required");
    await expect(api.network.createOffice({ ...newOffice, manager_email: "sofia@" })).rejects.toThrow("invalid_email");
    await expect(api.network.createOffice({ ...newOffice, manager_email: "valentina@strategicmates.com" })).rejects.toThrow("email_taken");
    await expect(api.network.createOffice({ ...newOffice, planned_opening_date: "2026-10-13" })).rejects.toThrow("invalid_date");
    await expect(api.network.createOffice({ ...newOffice, planned_opening_date: "mañana" })).rejects.toThrow("invalid_date");
    await expect(api.network.createOffice({ ...newOffice, city: "Orlando, FL" })).rejects.toThrow("office_exists");
    await api.network.createOffice(newOffice);
    await expect(api.network.createOffice({ ...newOffice, manager_email: "otra@strategicmates.com" })).rejects.toThrow("office_exists");
  });

  it("an office in opening cannot be activated while its checklist is incomplete, and cannot be paused", async () => {
    const api = await asGlobal();
    const { office } = await api.network.createOffice(newOffice);
    await expect(api.network.activateOffice(office.id)).rejects.toThrow("checklist_incomplete");
    await expect(api.network.pauseOffice(office.id, "Prueba")).rejects.toThrow("invalid_state");
    expect((await api.network.getOffice(office.id))!.office.status).toBe("opening");
  });

  it("SM Tampa has everything its checklist asks for, so it can be activated", async () => {
    const api = await asGlobal();
    const before = (await api.network.getOffice(net.ORG_TAMPA))!;
    expect(before.office.status).toBe("opening");
    expect(before.checklist).toMatchObject({ complete: true });
    expect(before.checklist!.items.every((i) => i.done)).toBe(true);
    const activated = await api.network.activateOffice(net.ORG_TAMPA);
    expect(activated.office).toMatchObject({ status: "operating", opened_at: "2026-10-14" });
    const after = (await api.network.getOffice(net.ORG_TAMPA))!;
    expect(after.checklist).toBeNull();
    await expect(api.network.activateOffice(net.ORG_TAMPA)).rejects.toThrow("invalid_state");
  });

  it("pauses an operating office with a reason and resumes it; the reason is cleared", async () => {
    const api = await asGlobal();
    await expect(api.network.pauseOffice(net.ORG_ORLANDO, "  ")).rejects.toThrow("reason_required");
    const paused = await api.network.pauseOffice(net.ORG_ORLANDO, "  Cambio de responsable  ");
    expect(paused.office).toMatchObject({ status: "paused", pause_reason: "Cambio de responsable" });
    expect((await api.network.getOffice(net.ORG_ORLANDO))!.checklist).toBeNull();
    await expect(api.network.pauseOffice(net.ORG_ORLANDO, "Otra vez")).rejects.toThrow("invalid_state");
    const resumed = await api.network.activateOffice(net.ORG_ORLANDO);
    expect(resumed.office).toMatchObject({ status: "operating", pause_reason: null });
    // Resuming a paused office does not ask for the opening date or checklist again.
    expect(resumed.office.opened_at).toBe("2026-05-18");
    await expect(api.network.pauseOffice("0a000000-0000-4000-8000-0000000000ff", "x")).rejects.toThrow("not_found");
  });

  it("only SM Global creates, pauses and activates offices", async () => {
    const api = createMockApi();
    for (const id of [seed.U_NICOLAS, net.U_VALENTINA, seed.U_LUCIA, seed.U_CARLA, net.U_LUISA, net.U_JEFFERSON]) {
      await api.session.setViewAs(id);
      await expect(api.network.createOffice(newOffice), id).rejects.toThrow("global_only");
      await expect(api.network.pauseOffice(seed.ORG_SM, "x"), id).rejects.toThrow("global_only");
      await expect(api.network.activateOffice(net.ORG_TAMPA), id).rejects.toThrow("global_only");
    }
  });

  it("the checklist is computed from data: a firm per area, a booking link of the office or the manager, a lead", () => {
    const office = { id: "o", kind: "sm", status: "opening", default_booking_url: null, manager_user_id: "m" } as Organization;
    const manager = { id: "m", role: "sm_team", organization_id: "o", email: "m@sm.com", booking_url: null } as User;
    const firm = (area: Organization["area"]) => ({ id: `f-${area}`, kind: "partner_firm", area, parent_id: "o" }) as Organization;
    const items = (users: User[], orgs: Organization[], leads: Lead[]) => Object.fromEntries(computeOfficeChecklist(office, users, orgs, leads).items.map((i) => [i.key, i]));

    const empty = items([], [], []);
    expect(Object.values(empty).every((i) => !i.done)).toBe(true);

    const fiveFirms = items([manager], (["B1", "B2", "B3", "B4", "B5"] as const).map(firm), []);
    expect(fiveFirms["partner_firms"]).toMatchObject({ done: false, missing_areas: ["B6"] });
    expect(fiveFirms["manager_access"]!.done).toBe(true);

    // A firm of another office does not count.
    const other = items([manager], [{ ...firm("B6"), parent_id: "elsewhere" } as Organization], []);
    expect(other["partner_firms"]!.missing_areas).toContain("B6");

    // The manager's own link is enough; so is the office default.
    expect(items([{ ...manager, booking_url: "https://calendly.com/m" }], [], [])["booking_link"]!.done).toBe(true);
    expect(computeOfficeChecklist({ ...office, default_booking_url: "https://sm.com/o" }, [manager], [], []).items.find((i) => i.key === "booking_link")!.done).toBe(true);

    const all = computeOfficeChecklist(
      { ...office, default_booking_url: "https://sm.com/o" },
      [manager],
      (["B1", "B2", "B3", "B4", "B5", "B6"] as const).map(firm),
      [{ office_id: "o" } as Lead],
    );
    expect(all.complete).toBe(true);
    expect(all.items.every((i) => i.done)).toBe(true);
  });
});

describe("office and network numbers", () => {
  it("each office has leads this month, conversion of the month and businesses ready to franchise", async () => {
    const offices = await (await asGlobal()).network.listOffices();
    const stats = (id: string) => offices.find((o) => o.office.id === id)!.stats;
    // Miami: 7 assessments in October and Enyermy signed on Oct 9, so 1 of 7.
    expect(stats(seed.ORG_SM)).toMatchObject({ leads_this_month: 7, conversion_month: 14, ready_to_franchise: 0 });
    expect(stats(net.ORG_ORLANDO)).toMatchObject({ leads_this_month: 2, conversion_month: 0 });
    // Tampa received one assessment and signed none: 0%. An office with no assessments has no conversion.
    expect(stats(net.ORG_TAMPA)).toMatchObject({ leads_this_month: 1, conversion_month: 0 });
  });

  it("the network summary adds them up, with its own conversion ratio", async () => {
    const api = await asGlobal();
    const summary = await api.network.getSummary();
    const offices = await api.network.listOffices();
    expect(summary.leads_this_month).toBe(offices.reduce((a, o) => a + o.stats.leads_this_month, 0));
    expect(summary).toMatchObject({ leads_this_month: 10, conversion_month: 10, ready_to_franchise: 0 });
  });

  it("ready to franchise follows the rules: with a low goal the businesses that have approved work count", async () => {
    const api = await asGlobal();
    await api.rules.update({ franchisability_goal: 1, required_task_codes: [] });
    const summary = await api.network.getSummary();
    const offices = await api.network.listOffices();
    const byFranchisability = await Promise.all((await api.businesses.list()).filter((b) => b.status === "in_program").map((b) => api.businesses.getFranchisability(b.id)));
    expect(summary.ready_to_franchise).toBe(byFranchisability.filter((f) => f.is_ready).length);
    expect(summary.ready_to_franchise).toBeGreaterThan(0);
    expect(offices.reduce((a, o) => a + o.stats.ready_to_franchise, 0)).toBe(summary.ready_to_franchise);
  });

  it("the conversion is empty (null) when an office got no assessment this month", async () => {
    const api = await asGlobal();
    const { office } = await api.network.createOffice(newOffice);
    expect((await api.network.listOffices()).find((o) => o.office.id === office.id)!.stats.conversion_month).toBeNull();
  });

  it("an SM team user reads the same numbers for its own office only", async () => {
    const miami = await as(seed.U_NICOLAS);
    const [only] = await miami.network.listOffices();
    expect(only!.office.id).toBe(seed.ORG_SM);
    expect(only!.stats).toMatchObject({ leads_this_month: 7, conversion_month: 14 });
    await expect(miami.network.getSummary()).rejects.toThrow("global_only");
  });
});

describe("leads: SM Global reads every office, read only", () => {
  const allLeads = seedLeads.leads.length + net.leads.length;

  it("lists the leads of every office, or of one office with the filter", async () => {
    const api = await asGlobal();
    const all = await api.leads.list();
    expect(all).toHaveLength(allLeads);
    expect(new Set(all.map((l) => l.office_id))).toEqual(new Set([seed.ORG_SM, net.ORG_ORLANDO, net.ORG_TAMPA]));
    expect(all.every((l) => typeof l.booking_url === "string")).toBe(true);
    const orlando = await api.leads.list({ office_id: net.ORG_ORLANDO });
    expect(orlando).toHaveLength(net.leads.filter((l) => l.office_id === net.ORG_ORLANDO).length);
    expect(orlando.every((l) => l.office_id === net.ORG_ORLANDO)).toBe(true);
    expect(await api.leads.list({ office_id: "0a000000-0000-4000-8000-0000000000ff" })).toEqual([]);
  });

  it("opens the detail of a lead of any office", async () => {
    const api = await asGlobal();
    const orlandoLead = (await api.leads.list({ office_id: net.ORG_ORLANDO }))[0]!;
    const detail = await api.leads.get(orlandoLead.id);
    expect(detail?.lead.id).toBe(orlandoLead.id);
    expect(detail?.events.length).toBeGreaterThan(0);
  });

  it("every write stays forbidden for SM Global", async () => {
    const api = await asGlobal();
    const evaluated = (await api.leads.list()).find((l) => l.stage === "evaluated")!;
    const contract = (await api.leads.list()).find((l) => l.stage === "contract")!;
    await expect(api.leads.move(evaluated.id, "meeting")).rejects.toThrow("sm_only");
    await expect(api.leads.discard(evaluated.id, "No responde")).rejects.toThrow("sm_only");
    await expect(api.leads.addNote(evaluated.id, "Llamar mañana")).rejects.toThrow("sm_only");
    await expect(api.leads.markContractSigned(contract.id, "2026-10-14")).rejects.toThrow("sm_only");
    // Nothing changed.
    expect((await api.leads.list()).find((l) => l.id === evaluated.id)?.stage).toBe("evaluated");
  });

  it("an office still reads only its own leads, even asking for another office", async () => {
    const api = await as(seed.U_NICOLAS);
    const own = await api.leads.list();
    expect(own.every((l) => l.office_id === seed.ORG_SM)).toBe(true);
    expect(await api.leads.list({ office_id: net.ORG_ORLANDO })).toEqual([]);
    const orlandoLead = net.leads.find((l) => l.office_id === net.ORG_ORLANDO)!;
    expect(await api.leads.get(orlandoLead.id)).toBeNull();
  });

  it("firms, owners, Bishop and franchisees read no leads", async () => {
    const api = createMockApi();
    for (const id of [seed.U_LUCIA, seed.U_CARLA, net.U_JEFFERSON, net.U_LUISA]) {
      await api.session.setViewAs(id);
      await expect(api.leads.list(), id).rejects.toThrow("sm_only");
    }
  });
});

describe("structure tree computed by the data layer", () => {
  const flat = (node: StructureNode): StructureNode[] => [node, ...node.children.flatMap(flat)];

  it("the global node has no facts; offices carry their health and their numbers", async () => {
    const { root } = await (await asGlobal()).network.getStructure();
    expect(root).toMatchObject({ kind: "global", health: null, franchisability: null, detail: null });
    const miami = root.children.find((c) => c.id === seed.ORG_SM)!;
    expect(miami.detail).toEqual({
      kind: "office", status: "operating", programs: 3, ready_to_franchise: 0, operating_franchises: 1,
      city: "Miami, FL", manager_name: expect.any(String), missing_areas: expect.any(Array),
    });
    expect(miami.health).toBe("red");
    const tampa = root.children.find((c) => c.id === net.ORG_TAMPA)!;
    expect(tampa.detail).toMatchObject({ kind: "office", status: "opening", programs: 0 });
    expect(tampa.health).toBe("grey");
  });

  it("a business in the program has real health, franchisability with its expected value and its consultant", async () => {
    const api = await asGlobal();
    const nodes = flat((await api.network.getStructure()).root);
    const vossler = nodes.find((n) => n.id === seed.BIZ_VOSSLER)!;
    const f = await api.businesses.getFranchisability(seed.BIZ_VOSSLER);
    const business = (await api.businesses.list()).find((b) => b.id === seed.BIZ_VOSSLER)!;
    expect(vossler.franchisability).toEqual({ value: f.franchisability_pct, expected: expectedFranchisePct(business.program_day, f.franchisability_goal) });
    expect(["red", "amber", "green"]).toContain(vossler.health);
    expect(vossler.detail).toEqual({ kind: "business", status: "in_program", program_day: business.program_day, consultant_name: expect.any(String), owner_name: expect.any(String) });
    // Every business in the program has these numbers; none of them was computed on the screen.
    for (const n of nodes.filter((x) => x.kind === "business" && x.detail?.kind === "business" && x.detail.status === "in_program")) {
      expect(n.franchisability).not.toBeNull();
      expect(n.health).not.toBeNull();
    }
  });

  it("a franchisor has no program numbers and its franchises carry their status", async () => {
    const nodes = flat((await (await asGlobal()).network.getStructure()).root);
    const bimbo = nodes.find((n) => n.id === seed.BIZ_BIMBO)!;
    expect(bimbo).toMatchObject({ health: null, franchisability: null, detail: { kind: "business", status: "franchisor", program_day: null } });
    expect(bimbo.children.map((c) => [c.name, c.detail])).toEqual(
      expect.arrayContaining([
        ["Bimbo Tacos Orlando Sur", { kind: "franchise", status: "operating", city: expect.any(String) }],
        ["Bimbo Tacos Tampa", { kind: "franchise", status: "opening", city: expect.any(String) }],
      ]),
    );
  });

  it("a firm is red with overdue tasks and shows how many", async () => {
    const api = await asGlobal();
    const tasks = await api.tasks.list();
    const nodes = flat((await api.network.getStructure()).root).filter((n) => n.kind === "firm");
    expect(nodes).toHaveLength(17);
    for (const n of nodes) {
      const overdue = tasks.filter((t) => t.organization_id === n.id && t.is_overdue).length;
      expect(n.detail).toMatchObject({ kind: "firm", overdue_tasks: overdue });
      expect(n.health).toBe(overdue > 0 ? "red" : "green");
    }
    expect(nodes.some((n) => n.health === "red")).toBe(true);
  });
});
