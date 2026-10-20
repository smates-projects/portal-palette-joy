// Part 3 in the mock: Bishop funds, confirming the start of the program, distribution to the firms, the bell
// notifications to SM, and who receives money (SM and that Bishop only; never owners, firms or franchisees).
import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as net from "./mock/seed-network";

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}
const leadNamed = async (api: Awaited<ReturnType<typeof as>>, name: string) => (await api.leads.list()).find((l) => l.business.name === name)!;
const receipt = { file_name: "comprobante.pdf", size_kb: 120 };

/**
 * Techos Delgado's Operating Agreement is in its waiting period in the sample data. To exercise the funds, SM Global
 * drops the waiting days, the three sign today (Oct 14) and SM records USD 100,000 of 150,000. Ends as Camila.
 */
async function fundTechos(api: Awaited<ReturnType<typeof as>>) {
  await api.session.setViewAs(seed.U_MARYLIN);
  await api.rules.update({ oa_waiting_days: 0 });
  await api.session.setViewAs(seed.U_CAMILA);
  const lead = await leadNamed(api, "Techos Delgado");
  const oa = (await api.leads.getInvestors(lead.id))!.tripartite!;
  const owner = (await api.users.list()).find((u) => u.business_id === lead.business_id && u.role === "business_owner")!;
  await api.documents.signContract(oa.id);
  for (const id of [owner.id, net.U_JEFFERSON]) {
    await api.session.setViewAs(id);
    await api.documents.signContract(oa.id);
  }
  await api.session.setViewAs(seed.U_CAMILA);
  await api.funds.recordPayment(lead.business_id!, { amount: 100000, paid_on: "2026-10-10", method: "wire", reference: "WIRE-812907", receipt });
  return lead;
}

describe("sample data", () => {
  it("Techos Delgado: Operating Agreement in its waiting period, no funds yet; once signed by the three, funds open", async () => {
    const api = await as(seed.U_CAMILA);
    expect(await leadNamed(api, "Techos Delgado")).toMatchObject({ stage: "accepted", tripartite: "pending", funds: null });
    const lead = await fundTechos(api);
    expect(await leadNamed(api, "Techos Delgado")).toMatchObject({ tripartite: "signed", funds: { status: "partial", ready_to_start: false } });
    const f = (await api.funds.get(lead.business_id!))!;
    expect(f).toMatchObject({ total: 150000, received: 100000, status: "partial", bishop_name: "Jefferson Paula", completed_on: null });
  });
  it("Vossler, Prime 10 and Enyermy: Bishop, funds received and a distribution with paid, pending and one overdue", async () => {
    const api = await as(seed.U_NICOLAS);
    for (const [biz, bishop] of [[seed.BIZ_VOSSLER, "Jefferson Paula"], [seed.BIZ_PRIME, "Laura Ortega"], [seed.BIZ_ENYERMY, "Jefferson Paula"]] as const) {
      const f = (await api.funds.get(biz))!;
      expect(f, biz).toMatchObject({ status: "received", received: 150000, bishop_name: bishop, program_started: true });
      const d = (await api.distribution.get(biz))!;
      const payments = d.lines.flatMap((l) => l.payments);
      expect(payments.some((p) => p.status === "paid"), biz).toBe(true);
      expect(payments.some((p) => p.status === "pending" && !p.overdue), biz).toBe(true);
      expect(payments.filter((p) => p.overdue), biz).toHaveLength(1);
      expect(d.assigned).toBeLessThanOrEqual(d.received);
      expect(d.unassigned).toBe(d.received - d.assigned);
      expect(d.lines[0]).toMatchObject({ organization_id: null, firm_name: null });
    }
  });
});

describe("recording funds and confirming the start (day 1)", () => {
  it("cannot start with partial funds; the payment that completes them proposes the later date as day 1", async () => {
    const api = await as(seed.U_CAMILA);
    const lead = await fundTechos(api);
    await expect(api.leads.confirmProgramStart(lead.id, "2026-10-14")).rejects.toThrow("funds_incomplete");
    await expect(api.funds.recordPayment(lead.business_id!, { amount: 60000, paid_on: "2026-10-10", method: "wire", reference: null, receipt })).rejects.toThrow("invalid_over_total");
    const f = await api.funds.recordPayment(lead.business_id!, { amount: 50000, paid_on: "2026-10-12", method: "wire", reference: "WIRE-1", receipt });
    expect(f).toMatchObject({ status: "received", received: 150000, completed_on: "2026-10-12" });
    const after = await leadNamed(api, "Techos Delgado");
    // Funds complete on Oct 12, Operating Agreement signed by the three on Oct 14: the later one is day 1.
    expect(after.funds).toMatchObject({ ready_to_start: true, proposed_day1: "2026-10-14" });
    await expect(api.leads.confirmProgramStart(lead.id, "2026-10-13")).rejects.toThrow("invalid_date");
    const r = await api.leads.confirmProgramStart(lead.id, "2026-10-14");
    expect(r.lead.stage).toBe("in_program");
    expect(r.task_count).toBeGreaterThan(0);
    const biz = (await api.businesses.list()).find((b) => b.id === r.business_id)!;
    expect(biz).toMatchObject({ status: "in_program", program_start_date: "2026-10-14", program_day: 1 });
    expect((await api.leads.get(lead.id))!.events.at(-1)).toMatchObject({ kind: "program_started", signed_on: "2026-10-14" });
    // The funds close once the program runs.
    await expect(api.funds.recordPayment(lead.business_id!, { amount: 1, paid_on: "2026-10-10", method: "wire", reference: null, receipt: null })).rejects.toThrow();
  });
  it("SM can pick a later day 1, never start without the tripartite signed", async () => {
    const api = await as(seed.U_CAMILA);
    const lead = await fundTechos(api);
    await api.funds.recordPayment(lead.business_id!, { amount: 50000, paid_on: "2026-10-01", method: "transfer", reference: null, receipt: null });
    const r = await api.leads.confirmProgramStart(lead.id, "2026-10-20");
    const biz = (await api.businesses.list()).find((b) => b.id === r.business_id)!;
    expect(biz).toMatchObject({ program_start_date: "2026-10-20", program_day: 0 });
    const sol = await leadNamed(api, "Sol Remodeling");
    await expect(api.leads.confirmProgramStart(sol.id, "2026-10-14")).rejects.toThrow("tripartite_unsigned");
  });
  it("undo of a recorded payment removes it", async () => {
    const api = await as(seed.U_CAMILA);
    const lead = await fundTechos(api);
    const f = await api.funds.recordPayment(lead.business_id!, { amount: 20000, paid_on: "2026-10-12", method: "other", reference: null, receipt: null });
    const back = await api.funds.removePayment(lead.business_id!, f.payments.at(-1)!.id);
    expect(back.received).toBe(100000);
  });
  it("the funds open with the program amount of the day the tripartite is signed (SM Global changes it in Reglas)", async () => {
    const api = await as(seed.U_MARYLIN);
    await expect(api.rules.update({ program_amount: 0 })).rejects.toThrow("invalid_program_amount");
    await api.rules.update({ program_amount: 160000 });
    expect((await api.rules.get()).program_amount).toBe(160000);
    await api.session.setViewAs(net.U_JEFFERSON);
    const sol = (await api.bishop.listOpportunities()).find((o) => o.business_name === "Sol Remodeling")!;
    const d = (await api.bishop.getOpportunity(sol.id))!;
    await api.documents.signContract(d.tripartite!.id);
    await api.session.setViewAs(seed.U_NICOLAS);
    const lead = await leadNamed(api, "Sol Remodeling");
    expect((await api.funds.get(lead.business_id!))!.total).toBe(160000);
    // Signed before the change: keeps its amount.
    expect((await api.funds.get(seed.BIZ_VOSSLER))!.total).toBe(150000);
  });
});

describe("the Bishop uploads his receipt and SM confirms it", () => {
  it("reported payments do not count until SM confirms; SM hears about it in the bell", async () => {
    const api = await as(seed.U_CAMILA);
    const businessId = (await fundTechos(api)).business_id!;
    await api.session.setViewAs(net.U_JEFFERSON);
    await expect(api.funds.reportPayment(businessId, { amount: 50000, paid_on: "2026-10-13", method: "wire", reference: null, receipt: null })).rejects.toThrow("invalid_receipt");
    const f = await api.funds.reportPayment(businessId, { amount: 50000, paid_on: "2026-10-13", method: "wire", reference: "W-99", receipt });
    expect(f).toMatchObject({ received: 100000, to_confirm: 50000, status: "partial" });
    expect((await api.funds.listMine()).map((x) => x.business_name)).toEqual(expect.arrayContaining(["Techos Delgado", "Vossler"]));
    await api.session.setViewAs(seed.U_CAMILA);
    const bell = await api.notifications.list();
    expect(bell.find((n) => n.kind === "funds_reported")).toMatchObject({ business_name: "Techos Delgado", actor_name: "Jefferson Paula" });
    expect((await leadNamed(api, "Techos Delgado")).funds?.to_confirm).toBe(true);
    const reported = (await api.funds.get(businessId))!.payments.find((p) => p.status === "reported")!;
    const done = await api.funds.confirmPayment(businessId, reported.id);
    expect(done).toMatchObject({ status: "received", completed_on: "2026-10-13" });
  });
});

describe("bell notification when a Bishop accepts", () => {
  it("every SM person of the office gets it, linked to the lead; firms and owners never do", async () => {
    const api = await as(seed.U_NICOLAS);
    const brisa = await leadNamed(api, "Brisa Clean Services");
    await api.session.setViewAs(net.U_JEFFERSON);
    await api.bishop.acceptOpportunity(brisa.id);
    for (const id of [seed.U_NICOLAS, seed.U_CAMILA, seed.U_ANDREA]) {
      await api.session.setViewAs(id);
      const n = (await api.notifications.list()).find((x) => x.kind === "bishop_accepted");
      expect(n, id).toMatchObject({ lead_id: brisa.id, business_name: "Brisa Clean Services", actor_name: "Jefferson Paula", read_at: null });
    }
    for (const id of [seed.U_LUCIA, seed.U_CARLA, seed.U_MARYLIN]) {
      await api.session.setViewAs(id);
      expect((await api.notifications.list()).some((x) => x.kind === "bishop_accepted"), id).toBe(false);
      expect((await api.notifications.getPreferences()).some((p) => p.kind === "bishop_accepted"), id).toBe(false);
    }
  });
});

describe("distribution (SM office)", () => {
  it("assigns a line within what is left, refuses going over, and locks a line with payments made", async () => {
    const api = await as(seed.U_NICOLAS);
    const d = (await api.distribution.get(seed.BIZ_ENYERMY))!;
    expect(d.unassigned).toBeGreaterThan(0);
    // SM's first installment is paid: that line is locked.
    await expect(api.distribution.saveLine(seed.BIZ_ENYERMY, { organization_id: null, kind: "one_time", payments: [{ amount: 1000, due_on: "2026-11-01", milestone: null }] })).rejects.toThrow("has_paid");
    const unpaid = d.lines.find((l) => l.organization_id && l.kind && l.paid === 0)!;
    const max = unpaid.amount + d.unassigned;
    await expect(api.distribution.saveLine(seed.BIZ_ENYERMY, { organization_id: unpaid.organization_id, kind: "one_time", payments: [{ amount: max + 1, due_on: "2026-11-01", milestone: null }] })).rejects.toThrow("invalid_over_received");
    const next = await api.distribution.saveLine(seed.BIZ_ENYERMY, { organization_id: unpaid.organization_id, kind: "one_time", payments: [{ amount: max, due_on: "2026-11-01", milestone: null }] });
    expect(next.unassigned).toBe(0);
    expect(next.assigned).toBe(next.received);
  });
  it("marks a payment paid and undoes it; an overdue one stops being overdue once paid", async () => {
    const api = await as(seed.U_NICOLAS);
    const d = (await api.distribution.get(seed.BIZ_PRIME))!;
    const overdue = d.lines.flatMap((l) => l.payments).find((p) => p.overdue)!;
    const paid = await api.distribution.markPaid(seed.BIZ_PRIME, overdue.id, { paid_on: "2026-10-14", method: "transfer", reference: "T-1", receipt });
    expect(paid.overdue_count).toBe(0);
    const back = await api.distribution.markPending(seed.BIZ_PRIME, overdue.id);
    expect(back.overdue_count).toBe(1);
  });
  it("SM Global and the Bishop of the business read it; neither can change it", async () => {
    for (const id of [seed.U_MARYLIN, net.U_JEFFERSON]) {
      const api = await as(id);
      expect((await api.distribution.get(seed.BIZ_VOSSLER))!.lines.length, id).toBeGreaterThan(1);
      expect((await api.funds.get(seed.BIZ_VOSSLER))!.received, id).toBe(150000);
      await expect(api.distribution.markPending(seed.BIZ_VOSSLER, "x"), id).rejects.toThrow("sm_only");
      await expect(api.funds.recordPayment(seed.BIZ_VOSSLER, { amount: 1, paid_on: "2026-10-10", method: "wire", reference: null, receipt: null }), id).rejects.toThrow();
    }
    // Another Bishop does not see Vossler's money.
    const laura = await as(net.U_LAURA);
    await expect(laura.funds.get(seed.BIZ_VOSSLER)).rejects.toThrow("forbidden");
  });
});

describe("who receives money: owners, firms and franchisees never do", () => {
  /** Amounts and fields that only SM and the Bishop may receive. */
  const MONEY = /program_amount|"investment":|"received":|"to_confirm":|"unassigned":|"amount":|(?<![\w-])(150000|100000|45000)(?![\w-])/;

  it("funds and distribution answer forbidden, and the rules come without the program amount", async () => {
    const api = createMockApi();
    const owners = [seed.U_CARLA, seed.U_DANIEL, seed.U_ENYERMY];
    const firms = [seed.U_LUCIA, seed.U_JULIAN, seed.U_RODRIGO, seed.U_MARIANA, seed.U_ANDRES, seed.U_SOFIA];
    for (const id of [...owners, ...firms, net.U_LUISA]) {
      await api.session.setViewAs(id);
      for (const biz of [seed.BIZ_VOSSLER, seed.BIZ_PRIME, seed.BIZ_ENYERMY]) {
        await expect(api.funds.get(biz), id).rejects.toThrow("forbidden");
        await expect(api.distribution.get(biz), id).rejects.toThrow("forbidden");
      }
      await expect(api.funds.listMine(), id).rejects.toThrow("bishop_only");
      const rules = await api.rules.get();
      expect(rules.program_amount, id).toBeUndefined();
    }
  }, 30_000);
  it("nothing an owner or a firm can read carries an amount of the program, the funds or the distribution", async () => {
    const api = createMockApi();
    // An owner in program funded by a Bishop (Carla), an owner still entering with partial funds (Techos Delgado), and firms.
    await api.session.setViewAs(seed.U_CAMILA);
    const espiga = await leadNamed(api, "Techos Delgado");
    const espigaOwner = (await api.users.list()).find((u) => u.business_id === espiga.business_id)!.id;
    for (const id of [seed.U_CARLA, espigaOwner, seed.U_LUCIA, seed.U_RODRIGO]) {
      await api.session.setViewAs(id);
      const me = await api.session.getCurrentUser();
      const reads: unknown[] = [
        await api.rules.get(),
        await api.businesses.list(),
        await api.tasks.list(),
        await api.notifications.list(),
        await api.organizations.list(),
        await api.users.list(),
      ];
      if (me.role === "business_owner") {
        reads.push(await api.documents.listContracts(), await api.documents.listDocuments(), await api.documents.getIntake());
      }
      const text = JSON.stringify(reads);
      const hit = text.match(MONEY);
      expect(hit ? `${hit[0]} in …${text.slice(Math.max(0, hit.index! - 80), hit.index! + 40)}` : null, id).toBeNull();
    }
  }, 30_000);
});
