import { describe, expect, it } from "vitest";
import { createMockApi } from "@/lib/api/mock";
import * as seed from "@/lib/api/mock/seed";
import { generateProgramTasks, type CatalogEntry } from "@/lib/api/program";
import catalogJson from "@/data/catalogo_metodo180.json";
import { buildPipelineCounters, matchesQuick, resolveLeadMove } from "./pipeline";

describe("pipeline transitions", () => {
  it("allows one step forward and one step back", () => {
    expect(resolveLeadMove("evaluated", "meeting")).toEqual({ ok: true, action: "move" });
    expect(resolveLeadMove("accepted", "meeting")).toEqual({ ok: true, action: "move" });
    expect(resolveLeadMove("evaluated", "accepted")).toEqual({ ok: false, reason: "skip" });
  });
  it("enters En programa only by signing, and never leaves it", () => {
    expect(resolveLeadMove("contract", "in_program")).toEqual({ ok: true, action: "sign" });
    expect(resolveLeadMove("accepted", "in_program").ok).toBe(false);
    expect(resolveLeadMove("in_program", "contract")).toEqual({ ok: false, reason: "locked" });
    expect(resolveLeadMove("in_program", "discarded")).toEqual({ ok: false, reason: "locked" });
  });
  it("discards from any active stage and reactivates only to Evaluado", () => {
    expect(resolveLeadMove("meeting", "discarded")).toEqual({ ok: true, action: "discard" });
    expect(resolveLeadMove("discarded", "evaluated")).toEqual({ ok: true, action: "restore" });
    expect(resolveLeadMove("discarded", "meeting").ok).toBe(false);
  });
});

describe("pipeline counters", () => {
  const api = createMockApi();
  it("counts sample leads on 2026-10-14", async () => {
    await api.session.setViewAs(seed.U_NICOLAS);
    const leads = await api.leads.list();
    expect(leads).toHaveLength(12);
    const c = buildPipelineCounters(leads, "2026-10-14");
    expect(c.week).toBe(2); // Oct 12 and Oct 13
    expect(c.uncontacted).toBe(2); // evaluated, never contacted, more than 2 days
    expect(c.contracts).toBe(1);
    expect(c.signed_month).toBe(1); // Enyermy, Oct 9
  });
  it("an evaluated lead submitted exactly 2 days ago is not yet 'sin contactar'", async () => {
    const leads = await api.leads.list();
    const lucy = leads.find((l) => l.business.name === "La Fonda de Mamá Lucy")!;
    expect(matchesQuick(lucy, "uncontacted", "2026-10-14")).toBe(false);
    expect(matchesQuick(lucy, "uncontacted", "2026-10-15")).toBe(true);
  });
});

describe("leads repository", () => {
  it("is SM only", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_LUCIA);
    await expect(api.leads.list()).rejects.toThrow("sm_only");
  });
  it("discarding requires a reason", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const lead = (await api.leads.list()).find((l) => l.stage === "evaluated")!;
    await expect(api.leads.discard(lead.id, "  ")).rejects.toThrow("reason_required");
  });
  it("booking link falls back to the office default, and uses the consultant's own once set", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const lead = (await api.leads.list()).find((l) => l.consultant_user_id === seed.U_NICOLAS)!;
    expect(lead.booking_url).toBe("https://strategicmates.com/MarilynBoraei");
    await api.users.setBookingUrl("https://calendly.com/nicolas");
    expect((await api.leads.get(lead.id))!.lead.booking_url).toBe("https://calendly.com/nicolas");
  });
  it("signing creates the business with day 1 on the signature date and its catalog tasks, supervised by the consultant", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const brisa = (await api.leads.list()).find((l) => l.stage === "contract")!;
    const r = await api.leads.markContractSigned(brisa.id, "2026-10-14");
    expect(r.lead.stage).toBe("in_program");
    const biz = (await api.businesses.list()).find((b) => b.id === r.business_id)!;
    expect(biz.program_start_date).toBe("2026-10-14");
    expect(biz.program_day).toBe(1);
    const tasks = (await api.tasks.list()).filter((t) => t.business_id === r.business_id);
    // Cleaning business: the construction-only entry is left out.
    expect(tasks).toHaveLength(47);
    expect(tasks.every((t) => t.supervisor_user_id === brisa.consultant_user_id)).toBe(true);
    expect(r.task_count).toBe(47);
  });
});

describe("program dates", () => {
  const catalog = catalogJson as CatalogEntry[];
  const input = {
    business_id: "b", industry: "construction" as const, start_date: "2026-10-01", supervisor_user_id: "s",
    firmFor: () => ({ organization_id: "o", assignee_user_id: "u" }), newId: () => Math.random().toString(), now: "x",
  };
  it("spreads each area between days 16 and 149", () => {
    const tasks = generateProgramTasks(catalog, input);
    expect(tasks).toHaveLength(48);
    const b1 = tasks.filter((t) => t.area === "B1");
    expect(b1[0]!.start_date).toBe("2026-10-16"); // day 16
    expect(b1.at(-1)!.due_date).toBe("2027-02-26"); // day 149
  });
  it("uses start_day / due_day from the catalog when SM Global sets them", () => {
    const custom = catalog.map((e) => (e.code === "B1-01" ? { ...e, start_day: 1, due_day: 15 } : e));
    const t = generateProgramTasks(custom, input).find((x) => x.code === "B1-01")!;
    expect(t.start_date).toBe("2026-10-01");
    expect(t.due_date).toBe("2026-10-15");
  });
});
