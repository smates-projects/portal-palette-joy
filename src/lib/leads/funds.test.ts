// Part 3: Bishop funds, start of the program (day 1) and distribution to the firms. Pure rules.
import { describe, expect, it } from "vitest";
import {
  confirmedTotal,
  distributionTotals,
  fundsCompletedOn,
  fundsStatus,
  isPaymentOverdue,
  parseWholeUsd,
  programDayOn,
  readyToStart,
  validDay1,
  validateFundPayment,
  validateLinePlan,
} from "./funds";
import { primaryActionFor } from "./pipeline";

const pay = (amount: number, paid_on: string, status: "confirmed" | "reported" = "confirmed") => ({ amount, paid_on, status });
const signed = (signed_at: string) => ({ state: "signed" as const, signed_at });

describe("funds status", () => {
  it("pending, partial, received; only confirmed payments count", () => {
    expect(fundsStatus(150000, 0)).toBe("pending");
    expect(fundsStatus(150000, 100000)).toBe("partial");
    expect(fundsStatus(150000, 150000)).toBe("received");
    expect(confirmedTotal([pay(100000, "2026-09-25"), pay(50000, "2026-10-01", "reported")])).toBe(100000);
  });
  it("complete on the day the confirmed payments reach the total, in date order", () => {
    expect(fundsCompletedOn(150000, [pay(50000, "2026-10-02"), pay(100000, "2026-09-25")])).toBe("2026-10-02");
    expect(fundsCompletedOn(150000, [pay(100000, "2026-09-25"), pay(50000, "2026-10-02", "reported")])).toBeNull();
  });
});

describe("start of the program (readyToStart)", () => {
  const full = { total: 150000, payments: [pay(150000, "2026-10-08")] };
  it("needs the tripartite signed by the three", () => {
    expect(readyToStart({ tripartite: null, funds: full })).toEqual({ ok: false, reason: "tripartite" });
    expect(readyToStart({ tripartite: { state: "opened", signed_at: null }, funds: full })).toEqual({ ok: false, reason: "tripartite" });
  });
  it("needs the funds complete (partial is not enough)", () => {
    expect(readyToStart({ tripartite: signed("2026-09-15"), funds: { total: 150000, payments: [pay(100000, "2026-09-25")] } })).toEqual({ ok: false, reason: "funds" });
    expect(readyToStart({ tripartite: signed("2026-09-15"), funds: null })).toEqual({ ok: false, reason: "funds" });
  });
  it("proposes as day 1 whichever happened last", () => {
    expect(readyToStart({ tripartite: signed("2026-10-07"), funds: full })).toEqual({ ok: true, day1: "2026-10-08" });
    expect(readyToStart({ tripartite: signed("2026-10-12"), funds: full })).toEqual({ ok: true, day1: "2026-10-12" });
  });
  it("day 1 can be the proposed date or later, never earlier", () => {
    expect(validDay1("2026-10-08", "2026-10-08")).toBe(true);
    expect(validDay1("2026-10-20", "2026-10-08")).toBe(true);
    expect(validDay1("2026-10-07", "2026-10-08")).toBe(false);
    expect(validDay1("", "2026-10-08")).toBe(false);
  });
  it("program day counts day 1 as 1, and 0 before it starts", () => {
    expect(programDayOn("2026-10-14", "2026-10-14")).toBe(1);
    expect(programDayOn("2026-10-09", "2026-10-14")).toBe(6);
    expect(programDayOn("2026-10-20", "2026-10-14")).toBe(0);
  });
  it("the lead action in Aceptado goes record funds → confirm start", () => {
    const base = { stage: "accepted" as const, bishop_user_id: "b", tripartite: "signed" as const };
    expect(primaryActionFor({ ...base, funds: { ready_to_start: false } })).toBe("record_funds");
    expect(primaryActionFor({ ...base, funds: null })).toBe("record_funds");
    expect(primaryActionFor({ ...base, funds: { ready_to_start: true } })).toBe("start_program");
    expect(primaryActionFor({ ...base, tripartite: "pending" })).toBe("wait_signatures");
  });
});

describe("a payment the Bishop sends", () => {
  const ok = { amount: 50000, paid_on: "2026-10-10", method: "wire", receipt: null };
  it("positive, not over what is missing, dated not after today", () => {
    expect(validateFundPayment(ok, 50000, { today: "2026-10-14" })).toBeNull();
    expect(validateFundPayment({ ...ok, amount: 0 }, 50000)).toBe("amount");
    expect(validateFundPayment({ ...ok, amount: 50001 }, 50000)).toBe("over_total");
    expect(validateFundPayment({ ...ok, paid_on: "2026-10-15" }, 50000, { today: "2026-10-14" })).toBe("future");
    expect(validateFundPayment({ ...ok, paid_on: "10/10/2026" }, 50000)).toBe("date");
  });
  it("the Bishop must attach a PDF or image receipt", () => {
    expect(validateFundPayment(ok, 50000, { receiptRequired: true, today: "2026-10-14" })).toBe("receipt");
    expect(validateFundPayment({ ...ok, receipt: { file_name: "transfer.docx" } }, 50000, { today: "2026-10-14" })).toBe("receipt");
    expect(validateFundPayment({ ...ok, receipt: { file_name: "transfer.JPG" } }, 50000, { receiptRequired: true, today: "2026-10-14" })).toBeNull();
  });
  it("whole dollars as typed in either language", () => {
    expect(parseWholeUsd("100.000")).toBe(100000);
    expect(parseWholeUsd("USD 100,000")).toBe(100000);
    expect(Number.isNaN(parseWholeUsd("abc"))).toBe(true);
  });
});

describe("distribution to the firms", () => {
  it("a line cannot take more than what is left of the funds received", () => {
    const plan = { kind: "installments" as const, payments: [{ amount: 10000, due_on: "2026-11-01", milestone: null }, { amount: 10000, due_on: "2026-12-01", milestone: null }] };
    expect(validateLinePlan(plan, 20000)).toBeNull();
    expect(validateLinePlan(plan, 19999)).toBe("over_received");
  });
  it("one-time has one payment; installments need dates; milestones need a text", () => {
    expect(validateLinePlan({ kind: "one_time", payments: [] }, 1000)).toBe("no_payments");
    expect(validateLinePlan({ kind: "one_time", payments: [{ amount: 1, due_on: "2026-11-01", milestone: null }, { amount: 1, due_on: "2026-11-01", milestone: null }] }, 1000)).toBe("one_time_single");
    expect(validateLinePlan({ kind: "installments", payments: [{ amount: 500, due_on: null, milestone: null }] }, 1000)).toBe("date");
    expect(validateLinePlan({ kind: "milestones", payments: [{ amount: 500, due_on: null, milestone: " " }] }, 1000)).toBe("milestone");
    expect(validateLinePlan({ kind: "milestones", payments: [{ amount: 500, due_on: null, milestone: "Manual aprobado" }] }, 1000)).toBeNull();
    expect(validateLinePlan({ kind: "one_time", payments: [{ amount: -5, due_on: "2026-11-01", milestone: null }] }, 1000)).toBe("amount");
  });
  it("a pending payment with a past date is overdue; paid or undated ones never are", () => {
    expect(isPaymentOverdue({ status: "pending", due_on: "2026-10-12" }, "2026-10-14")).toBe(true);
    expect(isPaymentOverdue({ status: "pending", due_on: "2026-10-14" }, "2026-10-14")).toBe(false);
    expect(isPaymentOverdue({ status: "paid", due_on: "2026-10-01" }, "2026-10-14")).toBe(false);
    expect(isPaymentOverdue({ status: "pending", due_on: null }, "2026-10-14")).toBe(false);
  });
  it("totals: assigned, unassigned, paid and overdue against what was received", () => {
    const lines = [
      { amount: 45000, payments: [{ amount: 15000, status: "paid" as const, due_on: "2026-08-02" }, { amount: 30000, status: "pending" as const, due_on: "2026-12-01" }] },
      { amount: 20000, payments: [{ amount: 20000, status: "pending" as const, due_on: "2026-10-01" }] },
    ];
    expect(distributionTotals(150000, lines, "2026-10-14")).toEqual({ received: 150000, assigned: 65000, unassigned: 85000, paid: 15000, overdue_count: 1 });
  });
});
