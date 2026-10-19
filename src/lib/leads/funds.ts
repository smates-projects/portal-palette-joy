// Bishop funds, start of the program and distribution to the firms. Pure rules shared by the mock and the screens;
// the Laravel backend applies the same ones.
import { TODAY } from "@/config/app";
import { receiptFileName, type NamedReceipt } from "@/lib/funds/receipt";
import type {
  Contract,
  DistributionLineInput,
  DistributionPayment,
  FundPayment,
  FundsStatus,
  IsoDate,
} from "@/lib/api/types";

const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / 86_400_000);
const isIsoDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(ms(v));

/** Only confirmed payments count as received money. */
export const confirmedTotal = (payments: Pick<FundPayment, "amount" | "status">[]) =>
  payments.filter((p) => p.status === "confirmed").reduce((sum, p) => sum + p.amount, 0);

export function fundsStatus(total: number, received: number): FundsStatus {
  if (received <= 0) return "pending";
  return received >= total ? "received" : "partial";
}

/** Day the confirmed payments (in date order) reached the total, or null while they do not. */
export function fundsCompletedOn(total: number, payments: Pick<FundPayment, "amount" | "status" | "paid_on">[]): IsoDate | null {
  let sum = 0;
  for (const p of [...payments].filter((x) => x.status === "confirmed").sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    sum += p.amount;
    if (sum >= total) return p.paid_on;
  }
  return null;
}

/** What is still missing to receive the whole program amount (never negative). */
export const fundsRemaining = (total: number, payments: Pick<FundPayment, "amount" | "status">[]) => Math.max(0, total - confirmedTotal(payments));

export type FundPaymentError = "amount" | "over_total" | "date" | "future" | "method" | "receipt";

/**
 * A payment SM records or the Bishop reports: positive amount that does not go over what is missing,
 * a real date not in the future, a method, and a receipt (PDF or image) when the Bishop reports it.
 */
export function validateFundPayment(
  input: { amount: number; paid_on: string; method: string; receipt: NamedReceipt | null },
  remaining: number,
  opts: { receiptRequired?: boolean; today?: string } = {},
): FundPaymentError | null {
  const today = opts.today ?? TODAY;
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "amount";
  if (input.amount > remaining) return "over_total";
  if (!isIsoDate(input.paid_on)) return "date";
  if (input.paid_on > today) return "future";
  if (!["transfer", "wire", "other"].includes(input.method)) return "method";
  if (input.receipt && !isReceiptFile(receiptFileName(input.receipt))) return "receipt";
  if (opts.receiptRequired && !input.receipt) return "receipt";
  return null;
}

/**
 * Whole dollars as typed: "100000", "100,000" and "100.000" all mean 100000 (separators differ by language).
 * No digits gives NaN, which the validation rejects.
 */
export const parseWholeUsd = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : Number.NaN;
};

/** Receipts are PDF or an image. */
export const isReceiptFile = (name: string) => /\.(pdf|png|jpe?g|webp|heic)$/i.test(name.trim());

// ---------- Start of the program ----------

export type StartReadiness =
  | { ok: true; day1: IsoDate }
  | { ok: false; reason: "tripartite" | "funds" };

/**
 * The program can start when the tripartite contract is signed by the three AND the funds are complete.
 * Day 1 proposed = the date of whichever happened last; SM may pick a later one, never an earlier one.
 */
export function readyToStart(input: {
  tripartite: Pick<Contract, "state" | "signed_at"> | null;
  funds: { total: number; payments: Pick<FundPayment, "amount" | "status" | "paid_on">[] } | null;
}): StartReadiness {
  const signedOn = input.tripartite?.state === "signed" ? input.tripartite.signed_at : null;
  if (!signedOn) return { ok: false, reason: "tripartite" };
  const completedOn = input.funds ? fundsCompletedOn(input.funds.total, input.funds.payments) : null;
  if (!completedOn) return { ok: false, reason: "funds" };
  return { ok: true, day1: signedOn > completedOn ? signedOn : completedOn };
}

/** Whether `day1` is a valid choice: a real date, not before the proposed one. */
export const validDay1 = (day1: string, proposed: IsoDate) => isIsoDate(day1) && day1 >= proposed;

/** Program day on `today` for a program that starts on `day1` (0 while it has not started). */
export const programDayOn = (day1: IsoDate, today: string = TODAY) => Math.max(0, daysBetween(day1, today) + 1);

// ---------- Distribution to the firms ----------

/** Pending, with a due date already past: shown as "Vencido". */
export const isPaymentOverdue = (p: Pick<DistributionPayment, "status" | "due_on">, today: string = TODAY) =>
  p.status === "pending" && !!p.due_on && p.due_on < today;

export type LinePlanError = "no_payments" | "amount" | "date" | "milestone" | "one_time_single" | "over_received";

/**
 * A line of the distribution: one-time = exactly one payment; installments = each with a due date;
 * milestones = each with a short text. Amounts positive. The line cannot take more than what is left
 * (received minus what the other lines already have).
 */
export function validateLinePlan(input: Pick<DistributionLineInput, "kind" | "payments">, available: number): LinePlanError | null {
  const ps = input.payments;
  if (ps.length === 0) return "no_payments";
  if (input.kind === "one_time" && ps.length !== 1) return "one_time_single";
  if (ps.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) return "amount";
  if (input.kind !== "milestones" && ps.some((p) => !isIsoDate(p.due_on))) return "date";
  if (input.kind === "milestones" && ps.some((p) => !p.milestone?.trim())) return "milestone";
  if (ps.some((p) => p.due_on !== null && p.due_on !== "" && !isIsoDate(p.due_on))) return "date";
  if (ps.reduce((sum, p) => sum + p.amount, 0) > available) return "over_received";
  return null;
}

/** Totals of a distribution against the funds received. */
export function distributionTotals(received: number, lines: { amount: number; payments: Pick<DistributionPayment, "amount" | "status" | "due_on">[] }[], today: string = TODAY) {
  const assigned = lines.reduce((sum, l) => sum + l.amount, 0);
  const paid = lines.flatMap((l) => l.payments).filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const overdue_count = lines.flatMap((l) => l.payments).filter((p) => isPaymentOverdue(p, today)).length;
  return { received, assigned, unassigned: Math.max(0, received - assigned), paid, overdue_count };
}
