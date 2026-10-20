// Sample funds and distribution: the three programs already running (Vossler, Prime 10, Enyermy). Techos Delgado,
// accepted, has its Operating Agreement in the waiting period, so it has no funds yet. Same ids every run.
import { TODAY } from "@/config/app";
import type { AreaCode, Business, Lead, PaymentMethod, PaymentPlanKind } from "../types";
import type { FundsDb, Funds, StoredDistLine } from "./funds";
import { uuid } from "./seed-leads";

interface SeedDeps {
  db: FundsDb & { businesses: Business[] };
  funds: Funds;
  seedSignedTripartite: (l: Lead, id: string, sentOn: string, signedOn: { owner: string; sm: string; bishop: string }) => void;
}

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

interface ProgramSeed {
  lead: string;
  tripartite: { sent: string; owner: string; sm: string; bishop: string };
  payments: { amount: number; on: string; method: PaymentMethod; reference: string | null; by: "sm" | "bishop" }[];
}

/** The plan per area of the firm: amount and how it is paid (sums 100,000 + 45,000 for SM = 145,000 of 150,000). */
const PLAN_BY_AREA: Record<AreaCode, { kind: PaymentPlanKind; amounts: number[]; days?: number[]; milestones?: string[] }> = {
  B1: { kind: "installments", amounts: [7500, 7500], days: [3, 90] },
  B2: { kind: "installments", amounts: [12500, 12500], days: [3, 90] },
  B3: { kind: "installments", amounts: [10000, 10000], days: [3, 90] },
  B4: { kind: "one_time", amounts: [15000], days: [30] },
  B5: { kind: "installments", amounts: [5000, 5000, 5000], days: [3, 45, 90] },
  B6: { kind: "milestones", amounts: [12500, 12500], milestones: ["Contratos tipo y FDD en borrador", "Registro de marca presentado"] },
};
const SM_PLAN = { kind: "installments" as const, amounts: [15000, 15000, 15000], days: [0, 60, 120] };

export function seedFunds({ db, funds, seedSignedTripartite }: SeedDeps) {
  let n = 0;
  const id = () => uuid("9e000000", ++n);
  const leadNamed = (name: string) => db.leads.find((l) => l.business.name === name);

  const programs: ProgramSeed[] = [
    {
      lead: "Vossler",
      tripartite: { sent: "2026-07-27", owner: "2026-07-28", sm: "2026-07-27", bishop: "2026-07-29" },
      payments: [
        { amount: 100000, on: "2026-07-30", method: "wire", reference: "WIRE-778120", by: "sm" },
        { amount: 50000, on: "2026-07-31", method: "wire", reference: "WIRE-778412", by: "sm" },
      ],
    },
    {
      lead: "Prime 10 Solutions",
      tripartite: { sent: "2026-09-07", owner: "2026-09-08", sm: "2026-09-07", bishop: "2026-09-10" },
      payments: [{ amount: 150000, on: "2026-09-11", method: "wire", reference: "WIRE-801533", by: "sm" }],
    },
    {
      lead: "Enyermy Clean Pro",
      tripartite: { sent: "2026-10-05", owner: "2026-10-06", sm: "2026-10-05", bishop: "2026-10-07" },
      payments: [{ amount: 150000, on: "2026-10-08", method: "transfer", reference: "TRF-20261008-JP", by: "bishop" }],
    },
  ];

  for (const p of programs) {
    const l = leadNamed(p.lead);
    if (!l?.business_id || !l.bishop_user_id) continue;
    seedSignedTripartite(l, id(), p.tripartite.sent, p.tripartite);
    funds.seedRecord(l, 150000);
    for (const x of p.payments)
      db.fundPayments.push({
        id: id(), business_id: l.business_id, amount: x.amount, paid_on: x.on, method: x.method, reference: x.reference,
        receipt: { file_name: `Comprobante_${x.reference ?? x.on}.pdf`, size_kb: 184 }, status: "confirmed", reported_by: x.by,
        created_at: `${x.on}T16:00:00Z`, confirmed_at: `${x.on}T18:00:00Z`,
      });
    const b = db.businesses.find((x) => x.id === l.business_id);
    if (b?.status === "in_program") seedDistribution(b);
  }

  /**
   * Distribution of a running program: what was due before today is paid, except the latest firm payment already
   * due, left pending on purpose so the sample shows one "Vencido". Milestones: the first one paid after day 30.
   */
  function seedDistribution(b: Business) {
    const start = b.program_start_date;
    const lines: StoredDistLine[] = [];
    const plan = (orgId: string | null, kind: PaymentPlanKind, amounts: number[], days?: number[], milestones?: string[]) =>
      lines.push({
        business_id: b.id, organization_id: orgId, kind,
        payments: amounts.map((amount, i) => ({
          id: id(), amount, due_on: days ? addDays(start, days[i]!) : null, milestone: milestones?.[i] ?? null,
          status: "pending", paid_on: null, method: null, reference: null, receipt: null,
        })),
      });
    plan(null, SM_PLAN.kind, SM_PLAN.amounts, SM_PLAN.days);
    for (const f of funds.firmsOf(b)) {
      const area = f.areas[0] ?? f.org.area ?? "B1";
      const p = PLAN_BY_AREA[area];
      plan(f.org.id, p.kind, p.amounts, p.days, p.milestones);
    }
    const firmDue = lines.filter((x) => x.organization_id).flatMap((x) => x.payments).filter((x) => x.due_on && x.due_on < TODAY);
    const keepOverdue = [...firmDue].sort((a, c) => (a.due_on ?? "").localeCompare(c.due_on ?? "")).at(-1);
    const programDay = Math.round((Date.parse(`${TODAY}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
    let ref = 0;
    for (const line of lines)
      line.payments.forEach((x, i) => {
        const due = x.due_on ? x.due_on < TODAY && x !== keepOverdue : line.kind === "milestones" && i === 0 && programDay > 30;
        if (!due) return;
        const paidOn = x.due_on ?? addDays(start, 40);
        Object.assign(x, {
          status: "paid", paid_on: paidOn, method: "transfer", reference: `SM-PAY-${b.name.slice(0, 3).toUpperCase()}-${++ref}`,
          receipt: { file_name: `Pago_${paidOn}.pdf`, size_kb: 96 },
        });
      });
    db.distLines.push(...lines);
  }
}
