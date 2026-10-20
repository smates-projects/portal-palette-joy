import { describe, expect, it } from "vitest";
import catalogJson from "@/data/catalogo_metodo180.json";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as seedLeads from "./mock/seed-leads";
import * as net from "./mock/seed-network";
import { computeReportAmounts, nextMonth, previousMonth } from "@/lib/franchise/fees";
import { bishopShareAt, estimatePaybackMonth, projectYears } from "@/lib/bishop/split";

/** A mock API already switched to the given user. */
async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
const asGlobal = () => as(seed.U_MARYLIN);
const asFranchisor = () => as(seed.U_RODRIGO_BIMBO);
const asFranchisee = () => as(net.U_LUISA);
const asBishop = () => as(net.U_JEFFERSON);
const asMiami = () => as(seed.U_NICOLAS);

describe("roles and seed", () => {
  it("Marilyn is SM Global, parent of every office, and SM Miami is in Miami", async () => {
    const api = await asGlobal();
    const me = await api.session.getCurrentUser();
    expect(me.role).toBe("sm_global");
    const orgs = await api.organizations.list();
    expect(orgs.find((o) => o.id === me.organization_id)?.kind).toBe("sm_global");
    const offices = orgs.filter((o) => o.kind === "sm");
    expect(offices.map((o) => o.name).sort()).toEqual(["SM Miami", "SM Orlando", "SM Tampa"]);
    expect(offices.every((o) => o.parent_id === seed.ORG_GLOBAL)).toBe(true);
    expect(offices.map((o) => `${o.name}:${o.status}`).sort()).toEqual(["SM Miami:operating", "SM Orlando:operating", "SM Tampa:opening"]);
    expect(offices.find((o) => o.id === seed.ORG_SM)?.city).toBe("Miami, FL");
  });
  it("the franchisor is a business owner of a franchisor business, not a new role", async () => {
    const api = await asFranchisor();
    expect((await api.session.getCurrentUser()).role).toBe("business_owner");
    const [bimbo] = await api.businesses.list();
    expect(bimbo?.status).toBe("franchisor");
    expect(bimbo?.program_day).toBe(180);
    expect((await api.businesses.getFranchisability(seed.BIZ_BIMBO)).is_ready).toBe(true);
  });
  it("offers the four new views in Ver como", async () => {
    const api = createMockApi();
    const roles = (await api.session.getViewAsOptions()).map((o) => o.user.role);
    expect(roles).toEqual(expect.arrayContaining(["sm_global", "bishop", "franchisee", "business_owner"]));
    const rodrigo = (await api.session.getViewAsOptions()).find((o) => o.user.id === seed.U_RODRIGO_BIMBO);
    expect(rodrigo?.business?.status).toBe("franchisor");
  });
  it("area B1 and B2 tasks of the running programs come from the catalog, verbatim", () => {
    const b1 = seed.tasks.filter((t) => t.business_id === seed.BIZ_VOSSLER && t.area === "B1");
    const b2 = seed.tasks.filter((t) => t.business_id === seed.BIZ_VOSSLER && t.area === "B2");
    expect(b1.length).toBeGreaterThan(0);
    expect(b2.length).toBeGreaterThan(0);
    const catalog = catalogJson as { code: string; name: string; acceptance: string }[];
    for (const t of [...b1, ...b2, ...seed.tasks.filter((x) => x.area === "B5" || x.area === "B6")]) {
      const entry = catalog.find((c) => c.code === t.code);
      expect(entry, t.code).toBeDefined();
      expect(t.name).toBe(entry!.name);
      expect(t.acceptance_criteria).toBe(entry!.acceptance);
    }
  });
  it("the seed has no voseo", () => {
    const text = JSON.stringify([seed.comments, seed.ownerRequests, seed.users]);
    expect(text).not.toMatch(/Sacala|agregá|sumás|avisen|Tenés|Podés/);
  });
});

describe("scoping", () => {
  it("a Bishop only reaches Bishop data; everyone else is refused", async () => {
    const api = await asBishop();
    expect((await api.bishop.getPortfolio()).investments).toHaveLength(1);
    expect(await api.tasks.list()).toEqual([]);
    expect(await api.users.list()).toHaveLength(1);
    await expect(api.franchises.list()).rejects.toThrow("forbidden");
    await expect(api.documents.listDocuments()).rejects.toThrow("forbidden");
    await expect(api.manual.get()).rejects.toThrow("forbidden");
    for (const id of [seed.U_CARLA, net.U_LUISA, seed.U_NICOLAS, seed.U_LUCIA, seed.U_MARYLIN]) {
      const other = await as(id);
      await expect(other.bishop.getPortfolio()).rejects.toThrow("bishop_only");
      await expect(other.bishop.listAgreements()).rejects.toThrow("bishop_only");
    }
  });
  it("a franchisee only sees its own unit", async () => {
    const luisa = await asFranchisee();
    expect((await luisa.franchises.list()).map((f) => f.id)).toEqual([net.FRANCHISE_ORLANDO_SUR]);
    expect(await luisa.franchises.get(net.FRANCHISE_TAMPA)).toBeNull();
    await expect(luisa.franchises.listReports(net.FRANCHISE_TAMPA)).rejects.toThrow("not_found");
    expect((await luisa.franchisee.listTickets()).every((t) => t.franchise_id === net.FRANCHISE_ORLANDO_SUR)).toBe(true);
    expect((await luisa.franchisee.getHome()).franchise.id).toBe(net.FRANCHISE_ORLANDO_SUR);
    expect(await luisa.tasks.list()).toEqual([]);
    const marco = await as(net.U_MARCO);
    expect((await marco.franchisee.getHome()).franchise.status).toBe("opening");
    expect((await marco.franchisee.listChecklist()).every((c) => c.kind === "opening")).toBe(true);
    expect((await luisa.franchisee.listChecklist()).every((c) => c.kind === "standard")).toBe(true);
    await expect((await asBishop()).franchisee.getHome()).rejects.toThrow("franchisee_only");
  });
  it("a franchisee reads the franchisor manual but not the franchisor numbers", async () => {
    const luisa = await asFranchisee();
    expect((await luisa.manual.get()).business_id).toBe(seed.BIZ_BIMBO);
    await expect(luisa.financials.get(seed.BIZ_BIMBO)).rejects.toThrow("forbidden");
    await expect(luisa.documents.listContracts()).rejects.toThrow("forbidden");
  });
  it("owners see only their own business; the franchisor sees its units, an owner in program sees none", async () => {
    const rodrigo = await asFranchisor();
    expect(await rodrigo.franchises.list()).toHaveLength(2);
    await expect(rodrigo.documents.listDocuments(seed.BIZ_VOSSLER)).rejects.toThrow("not_found");
    const carla = await as(seed.U_CARLA);
    expect(await carla.franchises.list()).toEqual([]);
    expect((await carla.documents.listDocuments()).every((d) => d.business_id === seed.BIZ_VOSSLER)).toBe(true);
    await expect(carla.franchises.getFranchisorSummary()).rejects.toThrow("franchisor_only");
    await expect(carla.documents.listContracts(seed.BIZ_BIMBO)).rejects.toThrow("not_found");
  });
  it("partner firms never see manual, documents, numbers or franchises", async () => {
    const lucia = await as(seed.U_LUCIA);
    await expect(lucia.manual.get()).rejects.toThrow("forbidden");
    await expect(lucia.documents.listDocuments()).rejects.toThrow("forbidden");
    await expect(lucia.financials.get()).rejects.toThrow("forbidden");
    await expect(lucia.franchises.list()).rejects.toThrow("forbidden");
    await expect(lucia.network.listOffices()).rejects.toThrow("forbidden");
  });
  it("SM sees only its own office; SM Global sees everything", async () => {
    const miami = await asMiami();
    expect((await miami.franchises.list()).map((f) => f.franchisor_business_id)).toEqual([seed.BIZ_BIMBO, seed.BIZ_BIMBO]);
    expect((await miami.businesses.list()).every((b) => b.office_id === seed.ORG_SM)).toBe(true);
    expect((await miami.network.listOffices()).map((o) => o.office.id)).toEqual([seed.ORG_SM]);
    expect(await miami.network.getOffice(net.ORG_ORLANDO)).toBeNull();
    expect((await miami.organizations.list()).every((o) => o.id === seed.ORG_SM || o.parent_id === seed.ORG_SM)).toBe(true);
    await expect(miami.network.getStructure()).rejects.toThrow("global_only");
    await expect(miami.rules.update({ franchisability_goal: 70 })).rejects.toThrow("global_only");
    const valentina = await as(net.U_VALENTINA);
    expect(await valentina.franchises.list()).toEqual([]);
    expect((await valentina.tasks.list()).every((t) => [net.BIZ_SUNSHINE, net.BIZ_CASA_LIMPIA].includes(t.business_id))).toBe(true);
    const global = await asGlobal();
    expect(await global.franchises.list()).toHaveLength(2);
    expect((await global.businesses.list()).length).toBe(seed.businesses.length + net.businesses.length);
  });
  it("Orlando firms only get tasks of Orlando businesses, and a new Orlando program picks Orlando firms", async () => {
    const legal = await as(net.U_ORL_LEGAL);
    const tasks = await legal.tasks.list();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.organization_id === net.ORG_ORL_LEGAL)).toBe(true);
    const valentina = await as(net.U_VALENTINA);
    const lead = (await valentina.leads.list()).find((l) => l.stage === "accepted")!;
    const res = await valentina.leads.startProgram(lead.id, "2026-10-14");
    const created = (await valentina.tasks.list()).filter((t) => t.business_id === res.business_id);
    expect(created.length).toBe(res.task_count);
    const orlandoFirms = new Set((await valentina.organizations.list()).filter((o) => o.kind === "partner_firm").map((o) => o.id));
    expect(created.every((t) => orlandoFirms.has(t.organization_id))).toBe(true);
  });
});

describe("franchise reports and fees", () => {
  it("seed reports are consistent: royalty 5%, marketing fund 3%, total is their sum", async () => {
    const reports = (await (await asFranchisee()).franchises.listReports()).filter((r) => r.status !== "due");
    expect(reports).toHaveLength(5);
    for (const r of reports) {
      expect(r.royalty_amount).toBe(Math.round(r.gross_sales! * 5) / 100);
      expect(r.marketing_fund_amount).toBe(Math.round(r.gross_sales! * 3) / 100);
      expect(r.total_due).toBeCloseTo(r.royalty_amount! + r.marketing_fund_amount!, 2);
    }
    expect(reports.find((r) => r.month === "2026-09")?.royalty_amount).toBe(3760);
  });
  it("fees math and month helpers", () => {
    expect(computeReportAmounts(80000)).toEqual({ royalty_amount: 4000, marketing_fund_amount: 2400, total_due: 6400 });
    expect(computeReportAmounts(70500).royalty_amount).toBe(3525);
    expect(computeReportAmounts(0).total_due).toBe(0);
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
  it("submitting a report computes the fees, closes the report task and opens the next month", async () => {
    const api = await asFranchisee();
    const sent = await api.franchises.submitReport(net.FRANCHISE_ORLANDO_SUR, { month: "2026-10", gross_sales: 80000 });
    expect(sent).toMatchObject({ status: "submitted", gross_sales: 80000, royalty_amount: 4000, marketing_fund_amount: 2400, total_due: 6400 });
    const reports = await api.franchises.listReports();
    expect(reports[0]).toMatchObject({ month: "2026-11", status: "due", gross_sales: null });
    expect((await api.franchisee.listTasks()).find((t) => t.kind === "report")?.done).toBe(true);
    expect((await api.franchisee.getHome()).next_report?.month).toBe("2026-11");
    await expect(api.franchises.submitReport(net.FRANCHISE_ORLANDO_SUR, { month: "2026-10", gross_sales: 1 })).rejects.toThrow("report_not_due");
  });
  it("rejects bad amounts, other franchises and other roles", async () => {
    const api = await asFranchisee();
    await expect(api.franchises.submitReport(net.FRANCHISE_ORLANDO_SUR, { month: "2026-10", gross_sales: -5 })).rejects.toThrow("invalid_amount");
    await expect(api.franchises.submitReport(net.FRANCHISE_TAMPA, { month: "2026-10", gross_sales: 5 })).rejects.toThrow("franchisee_only");
    const rodrigo = await asFranchisor();
    await expect(rodrigo.franchises.submitReport(net.FRANCHISE_ORLANDO_SUR, { month: "2026-10", gross_sales: 5 })).rejects.toThrow("franchisee_only");
  });
  it("the franchisor summary adds last month's reports", async () => {
    const s = await (await asFranchisor()).franchises.getFranchisorSummary();
    expect(s).toMatchObject({ last_month: "2026-09", sales_last_month: 75200, royalties_last_month: 3760, marketing_fund_last_month: 2256, franchises: 2, operating: 1, opening: 1, open_tickets: 2, manual_version: "v1.3" });
  });
  it("a franchisee creates a support ticket with the next code", async () => {
    const api = await asFranchisee();
    await expect(api.franchisee.createTicket({ subject: " ", body: "x" })).rejects.toThrow("subject_required");
    const t = await api.franchisee.createTicket({ subject: "Falta señalética", body: "Llegó incompleta." });
    expect(t).toMatchObject({ code: "T-121", state: "open", franchise_id: net.FRANCHISE_ORLANDO_SUR });
    expect((await api.franchisee.getHome()).open_tickets).toBe(2);
    // The franchisor sees it too (same mock instance, switching user).
    await api.session.setViewAs(seed.U_RODRIGO_BIMBO);
    expect((await api.franchises.listTickets()).some((x) => x.code === "T-121")).toBe(true);
  });
});

describe("manual", () => {
  it("publishing a new version flows down to every franchise", async () => {
    const api = await asFranchisor();
    const overview = await api.manual.get();
    expect(overview.current_version).toBe("v1.3");
    expect(overview.completion_pct).toBe(100);
    expect(overview.franchises_following).toBe(2);
    const compras = overview.sections.find((s) => s.title === "Compras")!;
    const published = await api.manual.publish(seed.BIZ_BIMBO, { note: "Compras: proveedor alterno de cerámica", section_ids: [compras.id] });
    expect(published).toMatchObject({ version: "v1.4", section_titles: ["Compras"] });
    expect((await api.manual.get()).current_version).toBe("v1.4");
    expect((await api.franchises.list()).every((f) => f.manual_version === "v1.4")).toBe(true);
  });
  it("franchisees get a task to read the new version and see the same version in their manual", async () => {
    const rodrigo = await asFranchisor();
    const section = (await rodrigo.manual.get()).sections[0]!;
    await rodrigo.manual.publish(seed.BIZ_BIMBO, { note: "Ventas: nuevo guion de atención", section_ids: [section.id] });
    // Same mock instance, switch user: state is shared.
    await rodrigo.session.setViewAs(net.U_LUISA);
    const tasks = await rodrigo.franchisee.listTasks();
    expect(tasks.filter((t) => t.kind === "manual_read" && t.title.includes("v1.4"))).toHaveLength(1);
    expect((await rodrigo.manual.get()).current_version).toBe("v1.4");
    expect((await rodrigo.franchisee.getHome()).manual_version).toBe("v1.4");
    await rodrigo.session.setViewAs(net.U_MARCO);
    expect((await rodrigo.franchisee.getHome()).manual_version).toBe("v1.4");
  });
  it("only a franchisor with approved sections can publish, with a note", async () => {
    const carla = await as(seed.U_CARLA);
    const vossler = await carla.manual.get();
    expect(vossler.current_version).toBeNull();
    const draft = vossler.sections.find((s) => s.status !== "approved")!;
    await expect(carla.manual.publish(seed.BIZ_VOSSLER, { note: "x", section_ids: [draft.id] })).rejects.toThrow("franchisor_only");
    const rodrigo = await asFranchisor();
    const id = (await rodrigo.manual.get()).sections[0]!.id;
    await expect(rodrigo.manual.publish(seed.BIZ_BIMBO, { note: " ", section_ids: [id] })).rejects.toThrow("note_required");
    await expect(rodrigo.manual.publish(seed.BIZ_BIMBO, { note: "x", section_ids: [] })).rejects.toThrow("sections_required");
    await expect(rodrigo.manual.publish(seed.BIZ_VOSSLER, { note: "x", section_ids: [id] })).rejects.toThrow("franchisor_only");
    const franchisee = await asFranchisee();
    await expect(franchisee.manual.publish(seed.BIZ_BIMBO, { note: "x", section_ids: [id] })).rejects.toThrow("owner_only");
  });
});

describe("rules (SM Global)", () => {
  it("starts with the default values and everyone can read them", async () => {
    const rules = await (await asFranchisee()).rules.get();
    expect(rules).toMatchObject({ franchisability_goal: 85, required_task_codes: ["B1-01", "B2-03", "B3-01", "B3-07", "B6-01", "B6-06"], area_amber_days: 7, franchisability_amber_tolerance: 10, document_review_days: 15 });
    expect(rules.intake_documents.filter((d) => d.required)).toHaveLength(7);
  });
  it("changes are logged, validated and reach franchisability", async () => {
    const api = await asGlobal();
    await expect(api.rules.update({ franchisability_goal: 0 })).rejects.toThrow("invalid_goal");
    await expect(api.rules.update({ required_task_codes: ["ZZ-99"] })).rejects.toThrow("unknown_task_code");
    await api.rules.update({ franchisability_goal: 100, area_amber_days: 5 }, "Más exigentes");
    await api.rules.update({ franchisability_goal: 100 }); // nothing changed: no entry
    const history = await api.rules.listHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.note).toBe("Más exigentes");
    expect(history[0]!.changes).toEqual([
      { field: "franchisability_goal", from: 85, to: 100 },
      { field: "area_amber_days", from: 7, to: 5 },
    ]);
    expect((await api.businesses.getFranchisability(seed.BIZ_VOSSLER)).franchisability_goal).toBe(100);
    await api.rules.update({ required_task_codes: [] });
    expect((await api.rules.listHistory())[0]!.changes[0]).toMatchObject({ field: "required_task_codes", to: [] });
    expect((await api.rules.listHistory())).toHaveLength(2);
    await api.session.setViewAs(seed.U_NICOLAS);
    expect((await api.rules.get()).franchisability_goal).toBe(100);
    await expect(api.rules.listHistory()).rejects.toThrow("global_only");
  });
});

describe("catalog admin (SM Global)", () => {
  it("add, edit and archive keep a history; non-global users only read active entries", async () => {
    const api = await asGlobal();
    const before = await api.catalog.list();
    expect(before).toHaveLength(48);
    const added = await api.catalog.add({ area_code: "B1", name: "Revisión trimestral del modelo", owner: "Estrategia", support: "", applies: "Siempre", priority: "minimo", acceptance: "Informe trimestral aprobado.", start_day: null, due_day: null });
    expect(added.code).toBe("B1-06");
    await api.catalog.update("B1-06", { name: "Revisión semestral del modelo" }, "Cambia la frecuencia");
    await api.catalog.archive("B1-02", "Se fusiona con B1-01");
    expect((await api.catalog.list()).some((c) => c.code === "B1-02")).toBe(false);
    expect((await api.catalog.list({ include_archived: true })).find((c) => c.code === "B1-02")?.archived).toBe(true);
    const history = await api.catalog.listHistory();
    expect(history.map((h) => `${h.code}:${h.kind}`).sort()).toEqual(["B1-02:archived", "B1-06:added", "B1-06:edited"]);
    expect((await api.catalog.listHistory("B1-06"))[0]!.changes).toEqual([{ field: "name", from: "Revisión trimestral del modelo", to: "Revisión semestral del modelo" }]);
    await api.catalog.restore("B1-02");
    expect((await api.catalog.list()).some((c) => c.code === "B1-02")).toBe(true);
    await expect(api.catalog.add({ ...added, name: " " })).rejects.toThrow("name_required");
    await expect(api.catalog.update("B1-06", { area_code: "B2" })).rejects.toThrow("area_locked");
    await expect(api.catalog.archive("B1-06", " ")).rejects.toThrow("reason_required");
    await api.session.setViewAs(seed.U_NICOLAS);
    expect((await api.catalog.list({ include_archived: true })).every((c) => !c.archived)).toBe(true);
    await expect(api.catalog.update("B1-06", { name: "x" })).rejects.toThrow("global_only");
    await expect(api.catalog.add(added)).rejects.toThrow("global_only");
  });
  it("catalog edits reach new programs only, never tasks already generated", async () => {
    const api = await asGlobal();
    const existingName = (await asMiami().then((a) => a.tasks.list())).find((t) => t.business_id === seed.BIZ_VOSSLER && t.code === "B1-01")!.name;
    await api.catalog.update("B1-01", { name: "Franchise Blueprint (versión 2)", acceptance: "Nuevo criterio de aceptación." });
    await api.catalog.archive("B1-03", "Ya no se pide");
    await api.session.setViewAs(seed.U_NICOLAS);
    const lead = (await api.leads.list()).find((l) => l.stage === "accepted")!;
    const res = await api.leads.startProgram(lead.id, "2026-10-14");
    const all = await api.tasks.list();
    const created = all.filter((t) => t.business_id === res.business_id);
    expect(created.find((t) => t.code === "B1-01")).toMatchObject({ name: "Franchise Blueprint (versión 2)", acceptance_criteria: "Nuevo criterio de aceptación." });
    expect(created.some((t) => t.code === "B1-03")).toBe(false);
    // Vossler's program, generated before the edit, keeps the old text.
    const vossler = all.find((t) => t.business_id === seed.BIZ_VOSSLER && t.code === "B1-01")!;
    expect(vossler.name).toBe(existingName);
    expect(vossler.name).not.toContain("versión 2");
    expect(all.some((t) => t.business_id === seed.BIZ_VOSSLER && t.code === "B1-03")).toBe(true);
  });
});

describe("network (SM Global)", () => {
  it("the structure tree counts offices, businesses, franchisors, franchises and firms", async () => {
    const tree = await (await asGlobal()).network.getStructure();
    expect(tree.counts).toEqual({ offices: 3, businesses: 5, franchisors: 1, franchises: 2, firms: 17 });
    expect(tree.root.kind).toBe("global");
    expect(tree.root.children.map((c) => c.name)).toEqual(["SM Miami", "SM Orlando", "SM Tampa"]);
    const miami = tree.root.children[0]!;
    const bimbo = miami.children.find((c) => c.name === "Bimbo Remodelaciones")!;
    expect(bimbo.children.filter((c) => c.kind === "franchise").map((c) => c.name).sort()).toEqual(["Bimbo Remodelaciones Orlando Sur", "Bimbo Remodelaciones Tampa"]);
    expect(bimbo.children.filter((c) => c.kind === "investor").map((c) => c.name)).toEqual(["Jefferson Paula"]);
    expect(miami.children.filter((c) => c.kind === "firm")).toHaveLength(5);
    const orlando = tree.root.children[1]!;
    expect(orlando.children.filter((c) => c.kind === "business")).toHaveLength(2);
    expect(orlando.children.filter((c) => c.kind === "firm")).toHaveLength(6);
  });
  it("lists offices with their stats", async () => {
    const api = await asGlobal();
    const offices = await api.network.listOffices();
    const miami = offices.find((o) => o.office.id === seed.ORG_SM)!;
    const orlando = offices.find((o) => o.office.id === net.ORG_ORLANDO)!;
    expect(miami.stats).toMatchObject({ programs: 3, franchisors: 1, franchises: 2, partner_firms: 5 });
    expect(orlando.stats).toMatchObject({ programs: 2, franchisors: 0, franchises: 0, partner_firms: 6, open_leads: 3 });
    expect(orlando.manager?.full_name).toBe("Valentina Ríos");
    expect(orlando.stats.health.red).toBeGreaterThan(0);
    const detail = (await api.network.getOffice(net.ORG_ORLANDO))!;
    expect(detail.businesses.map((b) => b.name).sort()).toEqual(["Casa Limpia Orlando", "Sunshine Roofing"]);
    expect(detail.firms).toHaveLength(6);
    expect(detail.team.map((u) => u.full_name)).toEqual(["Valentina Ríos"]);
    const summary = await api.network.getSummary();
    expect(summary).toMatchObject({ offices: 3, programs: 5, franchisors: 1, franchises: 2, partner_firms: 17, last_month: "2026-09", franchise_sales_last_month: 75200, royalties_last_month: 3760 });
    expect(summary.open_leads).toBe(offices.reduce((sum, o) => sum + o.stats.open_leads, 0));
    expect(summary.open_leads).toBe(miami.stats.open_leads + orlando.stats.open_leads + 1); // + the first lead of SM Tampa
  });
  it("bottlenecks: six areas, most overdue first, with the offices behind each", async () => {
    const rows = await (await asGlobal()).network.listBottlenecks();
    expect(rows.map((r) => r.area).sort()).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(rows.map((r) => r.overdue)).toEqual([...rows.map((r) => r.overdue)].sort((a, b) => b - a));
    const legal = rows.find((r) => r.area === "B6")!;
    expect(legal.overdue).toBeGreaterThanOrEqual(3);
    expect(legal.red_businesses).toBeGreaterThanOrEqual(2);
    expect(legal.by_office.map((o) => o.office_id).sort()).toEqual([seed.ORG_SM, net.ORG_ORLANDO].sort());
    expect(legal.by_office.reduce((a, o) => a + o.overdue, 0)).toBe(legal.overdue);
  });
  it("the global funnel adds the leads of every office", async () => {
    const funnel = await (await asGlobal()).network.getFunnel();
    const total = funnel.stages.reduce((a, s) => a + s.count, 0);
    expect(total).toBe(seedLeads.leads.length + net.leads.length);
    expect(funnel.by_office.flatMap((o) => o.stages).reduce((a, s) => a + s.count, 0)).toBe(total);
    expect(funnel.by_office).toHaveLength(3);
  });
});

describe("owner data", () => {
  it("documents, contracts, numbers, profile and team of the owner", async () => {
    const carla = await as(seed.U_CARLA);
    const docs = await carla.documents.listDocuments();
    expect(docs.filter((d) => d.state === "requested")).toHaveLength(2);
    expect((await carla.documents.listContracts()).map((c) => c.state)).toEqual(expect.arrayContaining(["signed", "sent", "draft"]));
    const fin = (await carla.financials.get())!;
    expect(fin.months).toHaveLength(5);
    expect(fin.revenue).toHaveLength(fin.margin_pct.length);
    expect((await carla.businessProfile.get())?.legal_name).toBe("Vossler Construction LLC");
    expect(await carla.businessProfile.listTeam()).toHaveLength(3);
    const daniel = await as(seed.U_DANIEL);
    expect(await daniel.financials.get()).toBeNull();
  });
  it("uploading a requested document, editing the profile and inviting a person", async () => {
    const carla = await as(seed.U_CARLA);
    const requested = (await carla.documents.listDocuments()).find((d) => d.state === "requested")!;
    const up = await carla.documents.uploadDocument(requested.id, { name: "estados_agosto.pdf" });
    expect(up).toMatchObject({ state: "received", file_name: "estados_agosto.pdf", received_at: "2026-10-14" });
    await expect(carla.documents.uploadDocument(requested.id, { name: "otra.pdf" })).rejects.toThrow("invalid_state");
    expect((await carla.businessProfile.update({ phone: "+1 407 555 0999", employees: 15 })).employees).toBe(15);
    await expect(carla.businessProfile.update({ email: "no-es-un-correo" })).rejects.toThrow("invalid_email");
    const invited = await carla.businessProfile.inviteMember({ name: "Rosa Peña", role: "Compras", email: "rosa@vosslerbuild.com" });
    expect(invited.state).toBe("invited");
    expect(await carla.businessProfile.listTeam()).toHaveLength(4);
  });
  it("verified data is frozen past onboarding: the owner requests a change and SM applies it", async () => {
    const carla = await as(seed.U_CARLA);
    // Vossler is in the program: the legal data was verified against the entry documents.
    await expect(carla.businessProfile.update({ legal_name: "Otro nombre LLC" })).rejects.toThrow("locked_field");
    await expect(carla.businessProfile.update({ address: "4821 Curry Ford Rd" })).resolves.toBeTruthy(); // same value: no change
    await expect(carla.businessProfile.requestChange({ field: "address", new_value: "4821 Curry Ford Rd", reason: "x" })).rejects.toThrow("same_value");
    await expect(carla.businessProfile.requestChange({ field: "address", new_value: "900 Lake Ave", reason: "" })).rejects.toThrow("reason_required");
    const r = await carla.businessProfile.requestChange({ field: "address", new_value: "900 Lake Ave", reason: "Nos mudamos en enero." });
    expect(r.status).toBe("pending");
    await expect(carla.businessProfile.requestChange({ field: "address", new_value: "901 Lake Ave", reason: "otra" })).rejects.toThrow("already_pending");
    await expect(carla.businessProfile.resolveChangeRequest(r.id, "applied", null)).rejects.toThrow("sm_only");
    // Same in-memory db: switch the user instead of opening a new client.
    await carla.session.setViewAs(seed.U_NICOLAS);
    const miami = carla;
    expect((await miami.businessProfile.listChangeRequests(seed.BIZ_VOSSLER)).map((x) => x.id)).toContain(r.id);
    const done = await miami.businessProfile.resolveChangeRequest(r.id, "applied", "Vimos el contrato de alquiler.");
    expect(done.status).toBe("applied");
    expect((await miami.businessProfile.get(seed.BIZ_VOSSLER))?.address).toBe("900 Lake Ave");
    await expect(miami.businessProfile.resolveChangeRequest(r.id, "rejected", null)).rejects.toThrow("invalid_state");
    await carla.session.setViewAs(seed.U_CARLA);
    const again = await carla.businessProfile.listChangeRequests();
    expect(again[0]).toMatchObject({ status: "applied", resolution_note: "Vimos el contrato de alquiler." });
  });
  it("SM reads a named business of its office but never another office", async () => {
    const miami = await asMiami();
    expect((await miami.financials.get(seed.BIZ_VOSSLER))?.business_id).toBe(seed.BIZ_VOSSLER);
    await expect(miami.financials.get()).rejects.toThrow("business_required");
    await expect(miami.financials.get(net.BIZ_SUNSHINE)).rejects.toThrow("not_found");
    expect((await miami.manual.get(seed.BIZ_BIMBO)).current_version).toBe("v1.3");
  });
});

describe("Business Bishop", () => {
  it("portfolio: invested, recovered, current share and estimated payback come from the data", async () => {
    const { investments, totals } = await (await asBishop()).bishop.getPortfolio();
    expect(totals).toEqual({ invested: 150000, recovered: 41800, recovered_pct: 28 });
    const bimbo = investments[0]!;
    expect(bimbo).toMatchObject({ business_name: "Bimbo Remodelaciones", current_share_pct: 50, franchises: 2, estimated_payback_month: "2028-09" });
    expect(bimbo.recovery.at(-1)).toMatchObject({ month: "2027-04", projected: 76000, actual: null });
    expect(bimbo.recovery.find((p) => p.month === "2026-10")).toMatchObject({ projected: 40000, actual: 41800 });
  });
  it("split helpers: year 1 vs stabilized share, projection and payback", () => {
    expect(bishopShareAt("2025-11-14", "2026-10-14")).toBe(50);
    expect(bishopShareAt("2025-11-14", "2026-11-14")).toBe(22);
    const [y1, y2] = projectYears([{ year: 1, franchises: 4, revenue: 320000, result: 110000 }, { year: 2, franchises: 10, revenue: 760000, result: 270000 }]);
    expect(y1).toMatchObject({ bishop: 55000, sm: 0 });
    expect(y2).toMatchObject({ bishop: 59400, sm: 27000 });
    expect(estimatePaybackMonth([{ month: "2026-01", projected: 0, actual: 0 }, { month: "2026-02", projected: 0, actual: null }], 100)).toBeNull();
    expect(estimatePaybackMonth([{ month: "2026-01", projected: 0, actual: 0 }, { month: "2026-02", projected: 0, actual: 50 }], 100)).toBe("2026-03");
    expect(estimatePaybackMonth([{ month: "2026-01", projected: 0, actual: 120 }], 100)).toBe("2026-01");
  });
  it("agreements: framework first, tripartite to sign, equity agreement signed, Vossler in draft", async () => {
    const agreements = await (await asBishop()).bishop.listAgreements();
    expect(agreements[0]?.kind).toBe("framework");
    // Part 3: the Vossler and Enyermy tripartite contracts are signed too; Techos Delgado's Operating Agreement waits.
    expect(agreements.map((a) => `${a.state}`).sort()).toEqual(["draft", "sent", "sent", "signed", "signed", "signed", "signed"]);
    expect(agreements.find((a) => a.business_id === seed.BIZ_BIMBO)?.signed_at).toBe("2025-11-14");
  });
});
