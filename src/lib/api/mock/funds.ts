// Bishop funds and their distribution to the firms, in the mock. It simulates the backend authorization:
// money goes only to the SM team of the office, SM Global (read) and the Bishop of that business (read, plus his
// receipt). Owners, firms and franchisees get "forbidden" and never an amount.
import { TODAY, nowIso } from "@/config/app";
import {
  confirmedTotal,
  distributionTotals,
  fundsCompletedOn,
  fundsStatus,
  isPaymentOverdue,
  isReceiptFile,
  readyToStart,
  validateFundPayment,
  validateLinePlan,
} from "@/lib/leads/funds";
import type {
  AreaCode,
  BishopFunds,
  Business,
  Contract,
  Distribution,
  DistributionLine,
  DistributionPayment,
  FundPayment,
  FundPaymentInput,
  IsoDate,
  Lead,
  LeadEvent,
  LeadWithComputed,
  MarkPaidInput,
  NotificationKind,
  Organization,
  PaymentPlanKind,
  Receipt,
  ReceiptUpload,
  Task,
  User,
  Uuid,
} from "../types";
import type { PlatformRules } from "../network-types";
import type { DistributionRepository, FundsRepository } from "../repositories";

/** Funds of one business: created when the tripartite contract is signed, with the program amount of that day. */
export interface FundRecord {
  business_id: Uuid;
  lead_id: Uuid;
  total: number;
}

type StoredDistPayment = Omit<DistributionPayment, "overdue">;
export interface StoredDistLine {
  business_id: Uuid;
  organization_id: Uuid | null;
  kind: PaymentPlanKind;
  payments: StoredDistPayment[];
}

export interface FundsDb {
  leads: Lead[];
  users: User[];
  businesses: Business[];
  orgs: Organization[];
  tasks: Task[];
  rules: PlatformRules;
  fundRecords: FundRecord[];
  fundPayments: FundPayment[];
  distLines: StoredDistLine[];
}

interface Deps {
  db: FundsDb;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(v: T) => Promise<T>;
  tripartiteOf: (l: Lead) => Contract | null;
  pushLeadEvent: (e: Omit<LeadEvent, "id" | "actor_user_id" | "created_at">) => LeadEvent;
  notifyLead: (l: Lead, kind: NotificationKind) => void;
}

/** The mock only keeps name and size: a picked File becomes its placeholder. */
const receiptOf = (upload: ReceiptUpload | null): Receipt | null => {
  if (!upload) return null;
  if (typeof Blob !== "undefined" && upload instanceof Blob) {
    const name = typeof File !== "undefined" && upload instanceof File ? upload.name : "receipt";
    return { file_name: name, size_kb: Math.max(1, Math.round(upload.size / 1024)) };
  }
  return upload as Receipt;
};

/** Program amount used when the rules have none (never in practice: SM Global always has one). */
const FALLBACK_PROGRAM_AMOUNT = 150_000;

export function createFunds(d: Deps) {
  const { db } = d;

  const leadOfBusiness = (businessId: Uuid) => db.leads.find((l) => l.business_id === businessId);
  const businessOf = (businessId: Uuid) => db.businesses.find((b) => b.id === businessId);

  /** The funds record of a lead, created the first time the tripartite contract is seen signed. */
  const recordOf = (l: Lead): FundRecord | null => {
    if (!l.business_id) return null;
    const existing = db.fundRecords.find((r) => r.business_id === l.business_id);
    if (existing) return existing;
    if (d.tripartiteOf(l)?.state !== "signed" || !l.bishop_user_id) return null;
    const r: FundRecord = { business_id: l.business_id, lead_id: l.id, total: db.rules.program_amount ?? FALLBACK_PROGRAM_AMOUNT };
    db.fundRecords.push(r);
    return r;
  };
  const paymentsOf = (businessId: Uuid) =>
    db.fundPayments.filter((p) => p.business_id === businessId).sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));

  const toFunds = (l: Lead, r: FundRecord): BishopFunds => {
    const payments = paymentsOf(r.business_id);
    const received = confirmedTotal(payments);
    return {
      business_id: r.business_id,
      lead_id: l.id,
      business_name: l.business.name,
      bishop_user_id: l.bishop_user_id ?? "",
      bishop_name: db.users.find((u) => u.id === l.bishop_user_id)?.full_name ?? "",
      total: r.total,
      received,
      to_confirm: payments.filter((p) => p.status === "reported").reduce((s, p) => s + p.amount, 0),
      status: fundsStatus(r.total, received),
      completed_on: fundsCompletedOn(r.total, payments),
      payments,
      program_started: l.stage === "in_program",
    };
  };

  /** What the Embudo shows of the funds (no amounts): status and whether the program can start. */
  const leadFunds = (l: Lead): LeadWithComputed["funds"] => {
    const r = recordOf(l);
    if (!r) return null;
    const payments = paymentsOf(r.business_id);
    const ready = readyToStart({ tripartite: d.tripartiteOf(l), funds: { total: r.total, payments } });
    return {
      status: fundsStatus(r.total, confirmedTotal(payments)),
      to_confirm: payments.some((p) => p.status === "reported"),
      ready_to_start: l.stage === "accepted" && ready.ok,
      proposed_day1: ready.ok ? ready.day1 : null,
    };
  };

  // ---------- Authorization ----------
  type Access = "write" | "read" | "bishop";
  /** Who may see the money of a business. Everybody else gets "forbidden", never a partial answer. */
  const access = (businessId: Uuid): { b: Business; l: Lead; level: Access } => {
    const u = d.me();
    const b = businessOf(businessId);
    const l = leadOfBusiness(businessId);
    if (!b || !l) throw new Error("not_found");
    if (u.role === "sm_team" && u.organization_id === b.office_id) return { b, l, level: "write" };
    if (u.role === "sm_global") return { b, l, level: "read" };
    if (u.role === "bishop" && l.bishop_user_id === u.id) return { b, l, level: "bishop" };
    throw new Error("forbidden");
  };
  /**
   * A business with no lead behind it (programs loaded before the Embudo existed) has no funds: SM gets null,
   * everybody else still gets "forbidden".
   */
  const smReadsWithoutLead = (businessId: Uuid) => {
    const u = d.me();
    const b = businessOf(businessId);
    if (!b || leadOfBusiness(businessId)) return false;
    return u.role === "sm_global" || (u.role === "sm_team" && u.organization_id === b.office_id);
  };
  const smWriter = (businessId: Uuid) => {
    const a = access(businessId);
    if (a.level !== "write") throw new Error("sm_only");
    return a;
  };
  const requireRecord = (l: Lead) => {
    const r = recordOf(l);
    if (!r) throw new Error("no_funds");
    return r;
  };

  const cleanInput = (input: FundPaymentInput): Omit<FundPaymentInput, "receipt"> & { receipt: Receipt | null } => {
    const receipt = receiptOf(input.receipt);
    return {
      amount: Math.round(input.amount * 100) / 100,
      paid_on: input.paid_on,
      method: input.method,
      reference: input.reference?.trim() || null,
      receipt: receipt && receipt.file_name.trim() ? { file_name: receipt.file_name.trim(), size_kb: Math.max(1, Math.round(receipt.size_kb)) } : null,
    };
  };

  const funds: FundsRepository = {
    get: async (businessId) => {
      if (smReadsWithoutLead(businessId)) return d.delay(null);
      const { l } = access(businessId);
      const r = recordOf(l);
      return d.delay(r ? toFunds(l, r) : null);
    },
    listMine: async () => {
      const u = d.me();
      if (u.role !== "bishop") throw new Error("bishop_only");
      const mine = db.leads
        .filter((l) => l.bishop_user_id === u.id)
        .flatMap((l) => {
          const r = recordOf(l);
          return r ? [toFunds(l, r)] : [];
        });
      return d.delay(mine.sort((a, b) => (b.payments.at(-1)?.paid_on ?? "").localeCompare(a.payments.at(-1)?.paid_on ?? "")));
    },
    recordPayment: async (businessId, input) => {
      const { l } = smWriter(businessId);
      const r = requireRecord(l);
      if (l.stage === "in_program") throw new Error("closed");
      const clean = cleanInput(input);
      const err = validateFundPayment(clean, r.total - confirmedTotal(paymentsOf(businessId)));
      if (err) throw new Error(`invalid_${err}`);
      db.fundPayments.push({ id: d.newId(), business_id: businessId, ...clean, status: "confirmed", reported_by: "sm", created_at: nowIso(), confirmed_at: nowIso() });
      d.pushLeadEvent({ lead_id: l.id, kind: "funds_recorded", from: null, to: null, body: null });
      return d.delay(toFunds(l, r));
    },
    reportPayment: async (businessId, input) => {
      const { l, level } = access(businessId);
      if (level !== "bishop") throw new Error("bishop_only");
      const r = requireRecord(l);
      if (l.stage === "in_program") throw new Error("closed");
      const clean = cleanInput(input);
      const ps = paymentsOf(businessId);
      const remaining = r.total - confirmedTotal(ps) - ps.filter((p) => p.status === "reported").reduce((s, p) => s + p.amount, 0);
      const err = validateFundPayment(clean, remaining, { receiptRequired: true });
      if (err) throw new Error(`invalid_${err}`);
      db.fundPayments.push({ id: d.newId(), business_id: businessId, ...clean, status: "reported", reported_by: "bishop", created_at: nowIso(), confirmed_at: null });
      d.pushLeadEvent({ lead_id: l.id, kind: "funds_reported", from: null, to: null, body: null });
      d.notifyLead(l, "funds_reported");
      return d.delay(toFunds(l, r));
    },
    confirmPayment: async (businessId, paymentId) => {
      const { l } = smWriter(businessId);
      const r = requireRecord(l);
      const p = db.fundPayments.find((x) => x.id === paymentId && x.business_id === businessId);
      if (!p || p.status !== "reported") throw new Error("invalid_state");
      if (p.amount > r.total - confirmedTotal(paymentsOf(businessId))) throw new Error("invalid_over_total");
      p.status = "confirmed";
      p.confirmed_at = nowIso();
      d.pushLeadEvent({ lead_id: l.id, kind: "funds_confirmed", from: null, to: null, body: null });
      return d.delay(toFunds(l, r));
    },
    removePayment: async (businessId, paymentId) => {
      const { l } = smWriter(businessId);
      const r = requireRecord(l);
      if (l.stage === "in_program") throw new Error("closed");
      const i = db.fundPayments.findIndex((x) => x.id === paymentId && x.business_id === businessId);
      if (i < 0) throw new Error("not_found");
      db.fundPayments.splice(i, 1);
      d.pushLeadEvent({ lead_id: l.id, kind: "funds_removed", from: null, to: null, body: null });
      return d.delay(toFunds(l, r));
    },
  };

  // ---------- Distribution ----------
  /** Partner firms working on the business (from its tasks), or the office firms before tasks exist. */
  const firmsOf = (b: Business): { org: Organization; areas: AreaCode[] }[] => {
    const tasks = db.tasks.filter((t) => t.business_id === b.id && t.status !== "cancelled");
    const byOrg = new Map<Uuid, Set<AreaCode>>();
    for (const t of tasks) {
      const o = db.orgs.find((x) => x.id === t.organization_id);
      if (o?.kind !== "partner_firm") continue;
      if (!byOrg.has(o.id)) byOrg.set(o.id, new Set());
      byOrg.get(o.id)!.add(t.area);
    }
    if (byOrg.size === 0)
      for (const o of db.orgs.filter((x) => x.kind === "partner_firm" && x.parent_id === b.office_id)) byOrg.set(o.id, new Set(o.area ? [o.area] : []));
    return [...byOrg.entries()]
      .map(([id, areas]) => ({ org: db.orgs.find((o) => o.id === id)!, areas: [...areas].sort() }))
      .sort((a, b2) => (a.areas[0] ?? "").localeCompare(b2.areas[0] ?? ""));
  };
  const lineId = (businessId: Uuid, orgId: Uuid | null) => `${businessId}:${orgId ?? "sm"}`;
  const storedLine = (businessId: Uuid, orgId: Uuid | null) => db.distLines.find((x) => x.business_id === businessId && x.organization_id === orgId);

  const toLine = (b: Business, orgId: Uuid | null, firmName: string | null, areas: AreaCode[]): DistributionLine => {
    const s = storedLine(b.id, orgId);
    const payments: DistributionPayment[] = (s?.payments ?? []).map((p) => ({ ...p, overdue: isPaymentOverdue(p, TODAY) }));
    return {
      id: lineId(b.id, orgId), business_id: b.id, organization_id: orgId, firm_name: firmName, areas,
      kind: s?.kind ?? null,
      amount: payments.reduce((sum, p) => sum + p.amount, 0),
      paid: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
      payments,
    };
  };

  const toDistribution = (b: Business, l: Lead, r: FundRecord): Distribution => {
    const firms = firmsOf(b);
    const lines = [
      toLine(b, null, null, []),
      ...firms.map((f) => toLine(b, f.org.id, f.org.name, f.areas)),
      // Lines kept for a firm that no longer works on the business.
      ...db.distLines
        .filter((x) => x.business_id === b.id && x.organization_id && !firms.some((f) => f.org.id === x.organization_id))
        .map((x) => toLine(b, x.organization_id, db.orgs.find((o) => o.id === x.organization_id)?.name ?? "", [])),
    ];
    const received = confirmedTotal(paymentsOf(b.id));
    return { business_id: b.id, business_name: l.business.name, ...distributionTotals(received, lines), lines };
  };
  const distributionFor = (businessId: Uuid) => {
    const { b, l, level } = access(businessId);
    const r = recordOf(l);
    return { b, l, level, r };
  };
  const writable = (businessId: Uuid) => {
    const x = distributionFor(businessId);
    if (x.level !== "write") throw new Error("sm_only");
    if (!x.r) throw new Error("no_funds");
    return x as typeof x & { r: FundRecord };
  };
  const findPayment = (businessId: Uuid, paymentId: Uuid) => {
    for (const line of db.distLines.filter((x) => x.business_id === businessId)) {
      const p = line.payments.find((x) => x.id === paymentId);
      if (p) return p;
    }
    throw new Error("not_found");
  };

  const distribution: DistributionRepository = {
    get: async (businessId) => {
      if (smReadsWithoutLead(businessId)) return d.delay(null);
      const { b, l, r } = distributionFor(businessId);
      return d.delay(r ? toDistribution(b, l, r) : null);
    },
    saveLine: async (businessId, input) => {
      const { b, l, r } = writable(businessId);
      const known = input.organization_id === null || firmsOf(b).some((f) => f.org.id === input.organization_id) || !!storedLine(b.id, input.organization_id);
      if (!known) throw new Error("unknown_firm");
      const current = storedLine(b.id, input.organization_id);
      if (current?.payments.some((p) => p.status === "paid")) throw new Error("has_paid");
      const dist = toDistribution(b, l, r);
      const others = dist.lines.filter((x) => x.organization_id !== input.organization_id).reduce((s, x) => s + x.amount, 0);
      const payments = input.payments.map((p) => ({ amount: Math.round(p.amount * 100) / 100, due_on: p.due_on || null, milestone: p.milestone?.trim() || null }));
      const err = validateLinePlan({ kind: input.kind, payments }, dist.received - others);
      if (err) throw new Error(`invalid_${err}`);
      const stored: StoredDistLine = {
        business_id: b.id, organization_id: input.organization_id, kind: input.kind,
        payments: payments.map((p) => ({ id: d.newId(), ...p, status: "pending", paid_on: null, method: null, reference: null, receipt: null })),
      };
      if (current) db.distLines.splice(db.distLines.indexOf(current), 1, stored);
      else db.distLines.push(stored);
      return d.delay(toDistribution(b, l, r));
    },
    clearLine: async (businessId, organizationId) => {
      const { b, l, r } = writable(businessId);
      const current = storedLine(b.id, organizationId);
      if (!current) throw new Error("not_found");
      if (current.payments.some((p) => p.status === "paid")) throw new Error("has_paid");
      db.distLines.splice(db.distLines.indexOf(current), 1);
      return d.delay(toDistribution(b, l, r));
    },
    markPaid: async (businessId, paymentId, input: MarkPaidInput) => {
      const { b, l, r } = writable(businessId);
      const p = findPayment(businessId, paymentId);
      if (p.status !== "pending") throw new Error("invalid_state");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_on) || input.paid_on > TODAY) throw new Error("invalid_date");
      if (!["transfer", "wire", "other"].includes(input.method)) throw new Error("invalid_method");
      const receipt = receiptOf(input.receipt);
      if (receipt && !isReceiptFile(receipt.file_name)) throw new Error("invalid_receipt");
      Object.assign(p, {
        status: "paid", paid_on: input.paid_on as IsoDate, method: input.method, reference: input.reference?.trim() || null,
        receipt: receipt ? { file_name: receipt.file_name.trim(), size_kb: Math.max(1, Math.round(receipt.size_kb)) } : null,
      });
      return d.delay(toDistribution(b, l, r));
    },
    markPending: async (businessId, paymentId) => {
      const { b, l, r } = writable(businessId);
      const p = findPayment(businessId, paymentId);
      if (p.status !== "paid") throw new Error("invalid_state");
      Object.assign(p, { status: "pending", paid_on: null, method: null, reference: null, receipt: null });
      return d.delay(toDistribution(b, l, r));
    },
  };

  /** Records an already-signed program for sample data (same ids every run). */
  const seedRecord = (l: Lead, total: number) => {
    if (!l.business_id) return;
    if (!db.fundRecords.some((r) => r.business_id === l.business_id)) db.fundRecords.push({ business_id: l.business_id, lead_id: l.id, total });
  };

  return { funds, distribution, leadFunds, recordOf, paymentsOf, firmsOf, seedRecord };
}
export type Funds = ReturnType<typeof createFunds>;
