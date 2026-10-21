// Bishop opportunities in the mock: born from the lead once NDA + MOU are signed by both. Also the framework agreement,
// the tripartite contract and what SM sees (who viewed, who passed, who accepted, release).
import { PROFIT_SPLIT } from "@/config/economics";
import { todayIso, nowIso } from "@/lib/clock";
import { projectYears } from "@/lib/bishop/split";
import { opportunityPhase, tripartiteState, acceptBlock } from "@/lib/leads/opportunity";
import { bishopSees, entryRules, oaSendBlock } from "@/lib/leads/entry-flow";
import { signingStatus } from "@/lib/contracts/parties";
import type {
  BishopAgreement, BishopOpportunity, Contract, Lead, LeadEvent, LeadInvestors, LeadWithComputed,
  OpportunityDecision, OpportunityDetail, RevenueRange, Signer, User, Uuid,
} from "../types";
import type { PlatformRules } from "../network-types";
import type { Intake } from "./intake";
import type { BishopRepository } from "../repositories";

export interface OpportunityView {
  lead_id: Uuid;
  bishop_user_id: Uuid;
  viewed_at: string;
  decision: OpportunityDecision;
  decided_at: string | null;
}

/** SM presented an approved business to one Bishop ("Presentar a Bishops"). */
export interface Presentation {
  lead_id: Uuid;
  bishop_user_id: Uuid;
  presented_at: string;
  presented_by: Uuid | null;
}

export interface OpportunitiesDb {
  leads: Lead[];
  users: User[];
  contracts: Contract[];
  rules: PlatformRules;
  frameworkContracts: Contract[];
  oppViews: OpportunityView[];
  presentations: Presentation[];
}

interface Deps {
  db: OpportunitiesDb;
  intake: Intake;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(v: T) => Promise<T>;
  findLead: (id: Uuid) => Lead;
  readableLeads: () => Lead[];
  withBooking: (l: Lead) => LeadWithComputed;
  pushLeadEvent: (e: Omit<LeadEvent, "id" | "actor_user_id" | "created_at">) => LeadEvent;
  /** Bell notification to the SM team of the lead's office. */
  notifyLead: (l: Lead, kind: "bishop_accepted") => void;
  /** Bell notification to one Bishop: SM presented him the business. */
  notifyBishop: (l: Lead, bishopUserId: Uuid) => void;
  /** Program amount agreed for this lead once its funds exist (it does not move if SM Global changes the rule). */
  agreedAmount: (l: Lead) => number | null;
}

/** The Operating Agreement: the program contract between the owner, Strategic Mates and the Bishop. */
export const OPERATING_AGREEMENT_NAME = "Operating Agreement";

/** Midpoint of the declared revenue range, only to scale the provisional projection. */
const REVENUE_MID: Record<RevenueRange, number> = {
  lt_250k: 180_000, "250k_500k": 375_000, "500k_750k": 625_000, "750k_1m": 875_000, "1m_2m": 1_500_000, gt_2m: 2_500_000,
};
/** Billing and tax files the Bishop can read after accepting (rule order: 1 billing, 6 last tax return). */
const BISHOP_FILE_RULES = ["a1000000-0000-4000-8000-000000000001", "a1000000-0000-4000-8000-000000000006"];

export function createOpportunities(d: Deps) {
  const { db, intake } = d;

  const tripartiteOf = (l: Lead): Contract | null =>
    (l.business_id && db.contracts.find((c) => c.business_id === l.business_id && c.kind === "tripartite")) || null;
  /** The Acuerdo de Vinculación, created by its rule when the Bishop accepts (./contract-rules). */
  const bindingOf = (l: Lead): Contract | null =>
    (l.business_id && db.contracts.find((c) => c.business_id === l.business_id && c.kind === "binding")) || null;

  const phaseFor = (l: Lead, viewer: Uuid) => {
    const s = intake.summaryFor(l);
    return opportunityPhase(
      { stage: l.stage, nda_signed: !!s?.nda_signed, mou_signed: !!s?.mou_signed, bishop_user_id: l.bishop_user_id, tripartite: tripartiteState(tripartiteOf(l)) },
      viewer,
    );
  };
  const frameworkOf = (userId: Uuid) => db.frameworkContracts.find((c) => c.signers.some((s) => s.party === "bishop" && s.user_id === userId)) ?? null;
  const frameworkSigned = (userId: Uuid) => frameworkOf(userId)?.state === "signed";
  const viewOf = (leadId: Uuid, userId: Uuid) => db.oppViews.find((v) => v.lead_id === leadId && v.bishop_user_id === userId);
  const presentationOf = (leadId: Uuid, userId: Uuid) => db.presentations.find((p) => p.lead_id === leadId && p.bishop_user_id === userId);
  /** Active Bishops with the framework agreement signed: the ones SM can present a business to. */
  const candidates = () =>
    db.users.filter((u) => u.role === "bishop" && (u.status === undefined || u.status === "active") && frameworkSigned(u.id));

  const bishopOnly = () => {
    const u = d.me();
    if (u.role !== "bishop") throw new Error("bishop_only");
    return u;
  };

  const toOpportunity = (l: Lead, u: User): BishopOpportunity => {
    const phase = phaseFor(l, u.id)!;
    const mine = l.bishop_user_id === u.id;
    const v = viewOf(l.id, u.id);
    const final = l.validation?.status === "closed" && typeof l.validation.equity_bishop === "number";
    return {
      id: l.id, lead_id: l.id, phase, industry: l.business.industry, city: l.contact.city, state: l.contact.state,
      business_name: mine ? l.business.name : null, owner_name: mine ? l.contact.name : null,
      investment: d.agreedAmount(l) ?? db.rules.program_amount ?? 0,
      // Once SM closed the validation the Bishop sees his definitive participation in the franchisor instead.
      ...(final
        ? { share_year1_pct: l.validation!.equity_bishop!, share_stable_pct: l.validation!.equity_bishop!, split_final: true }
        : { share_year1_pct: Math.round(PROFIT_SPLIT.bishop_year1 * 100), share_stable_pct: Math.round(PROFIT_SPLIT.bishop_stabilized * 100), split_final: false }),
      score: l.result?.score ?? 0, band: l.result?.band ?? "track",
      review: phase === "in_review" ? intake.summaryFor(l)?.clock ?? null : null,
      decision: v?.decision ?? "none", decided_at: v?.decided_at ?? null,
      presented_at: presentationOf(l.id, u.id)?.presented_at ?? null,
    };
  };

  const detailOf = (l: Lead, u: User): OpportunityDetail => {
    const base = toOpportunity(l, u);
    const s = intake.summaryFor(l)!;
    const docs = l.business_id ? intake.docsOf(l.business_id) : [];
    const mine = l.bishop_user_id === u.id;
    const { name: _name, ...declared } = l.business;
    const mid = REVENUE_MID[l.business.revenue_range];
    return {
      ...base,
      declared,
      // A business added by hand may have no assessment yet: the Bishop sees an empty result.
      result: l.result ?? { readiness: "on_track", band: "track", score: 0, eligible_program: false, eligibility_gaps: [], blocks: [], strengths: [], priorities: [] },
      know_how_example: l.know_how_example,
      verified: docs.filter((x) => x.required).map((x) => ({ name: x.name, fact: x.state === "reviewed" ? x.verified_fact ?? null : null })),
      checklist: { nda_signed: s.nda_signed, mou_signed: s.mou_signed, required_total: s.required_total, uploaded: s.uploaded, accepted: s.accepted, approved: !!s.approved_at },
      // Provisional: franchise fees grow with the size of the business. Same split as everywhere (PROFIT_SPLIT).
      projection: projectYears([1, 2, 3, 4, 5].map((year) => {
        const franchises = Math.round((year * (year + 3)) * (mid / 1_000_000 + 0.6));
        const revenue = Math.round(franchises * mid * 0.08 / 1000) * 1000;
        return { year, franchises, revenue, result: Math.round(revenue * 0.36 / 1000) * 1000 };
      })),
      files: mine
        ? docs.filter((x) => x.rule_id && BISHOP_FILE_RULES.includes(x.rule_id) && x.state === "reviewed" && x.file_name).map((x) => ({ id: x.id, name: x.name, file_name: x.file_name! }))
        : [],
      tripartite: mine ? tripartiteOf(l) : null,
      binding: mine ? bindingOf(l) : null,
    };
  };

  /**
   * Framework signed, a phase for him, and the visibility rule: with "presented" only what SM presented to him (or
   * what he already took); with "all" every business with NDA and MOU signed.
   */
  const visibleTo = (u: User) => {
    if (!frameworkSigned(u.id)) return [];
    const visibility = entryRules(db.rules).opportunity_visibility;
    return db.leads.filter((l) => phaseFor(l, u.id) !== null && bishopSees(visibility, !!presentationOf(l.id, u.id) || l.bishop_user_id === u.id));
  };
  const myLead = (id: Uuid) => {
    const u = bishopOnly();
    const l = visibleTo(u).find((x) => x.id === id);
    if (!l) throw new Error("not_found");
    return { u, l };
  };
  const decide = (id: Uuid, decision: OpportunityDecision) => {
    const { u, l } = myLead(id);
    let v = viewOf(l.id, u.id);
    if (!v) { v = { lead_id: l.id, bishop_user_id: u.id, viewed_at: nowIso(), decision: "none", decided_at: null }; db.oppViews.push(v); }
    v.decision = decision;
    v.decided_at = decision === "none" ? null : nowIso();
    return toOpportunity(l, u);
  };

  const signerFromUser = (party: "owner" | "sm" | "bishop", name: string, user_id: Uuid | null): Signer =>
    ({ name, role: party, party, user_id, status: "sent", signed_at: null, decline_reason: null, history: [{ status: "sent", at: todayIso() }] });

  const makeTripartite = (l: Lead): Contract => {
    const bishop = db.users.find((u) => u.id === l.bishop_user_id)!;
    const owner = db.users.find((u) => u.role === "business_owner" && u.business_id === l.business_id);
    return {
      id: d.newId(), business_id: l.business_id!, area: "intake", kind: "tripartite", name: OPERATING_AGREEMENT_NAME,
      state: "sent", sent_at: todayIso(), signed_at: null,
      signers: [signerFromUser("owner", owner?.full_name ?? l.contact.name, owner?.id ?? null), signerFromUser("sm", "Strategic Mates", null), signerFromUser("bishop", bishop.full_name, bishop.id)],
    };
  };

  const bishop: Omit<BishopRepository, "getPortfolio" | "listAgreements"> = {
    listOpportunities: async () => {
      const u = bishopOnly();
      return d.delay(visibleTo(u).map((l) => toOpportunity(l, u)));
    },
    getOpportunity: async (id) => {
      const u = bishopOnly();
      const l = visibleTo(u).find((x) => x.id === id);
      if (!l) return d.delay(null);
      // Opening the detail counts as a view (SM sees it in the lead).
      if (!viewOf(l.id, u.id)) db.oppViews.push({ lead_id: l.id, bishop_user_id: u.id, viewed_at: nowIso(), decision: "none", decided_at: null });
      return d.delay(detailOf(l, u));
    },
    acceptOpportunity: async (id) => {
      const { u, l } = myLead(id);
      const block = acceptBlock(phaseFor(l, u.id)!, frameworkSigned(u.id));
      if (block) throw new Error(block === "in_review" ? "not_available" : block === "framework" ? "framework_required" : "taken");
      l.bishop_user_id = u.id;
      l.bishop_accepted_at = nowIso();
      const v = viewOf(l.id, u.id);
      if (v) { v.decision = "none"; v.decided_at = null; }
      d.pushLeadEvent({ lead_id: l.id, kind: "bishop_accepted", from: null, to: null, body: u.full_name });
      d.notifyLead(l, "bishop_accepted");
      return d.delay(toOpportunity(l, u));
    },
    pass: async (id) => d.delay(decide(id, "passed")),
    clearDecision: async (id) => d.delay(decide(id, "none")),
  };

  /** Framework first, then tripartite contracts where this Bishop signs. */
  const signableAgreements = (u: User): BishopAgreement[] => {
    const out: BishopAgreement[] = [];
    const fw = frameworkOf(u.id);
    const view = (c: Contract) => {
      const status = signingStatus(c, "bishop");
      return { my_signature: status.mine ? ("signed" as const) : ("pending" as const), pending_parties: status.pending };
    };
    if (fw) out.push({
      id: fw.id, kind: "framework", contract: fw, bishop_user_id: u.id, business_id: null, name: fw.name, counterparties: "Strategic Mates",
      state: fw.state === "signed" ? "signed" : "sent", signed_at: fw.signed_at, has_file: true, file_name: `${fw.name}.pdf`, ...view(fw),
    });
    // The Acuerdo de Vinculación comes before the Operating Agreement of the same business.
    const mine = db.contracts.filter((x) => (x.kind === "binding" || x.kind === "tripartite") && x.signers.some((s) => s.party === "bishop" && s.user_id === u.id));
    for (const c of [...mine.filter((x) => x.kind === "binding"), ...mine.filter((x) => x.kind === "tripartite")]) {
      const owner = c.signers.find((s) => s.party === "owner")?.name ?? "";
      const lead = db.leads.find((l) => l.business_id === c.business_id);
      out.push({
        id: c.id, kind: c.kind === "binding" ? "binding" : "tripartite", contract: c, bishop_user_id: u.id, business_id: c.business_id,
        name: lead ? `${c.name}: ${lead.business.name}` : c.name, counterparties: `${owner}, Strategic Mates`,
        state: c.state === "signed" ? "signed" : "sent", signed_at: c.signed_at, has_file: true, file_name: `${c.name}.pdf`, ...view(c),
      });
    }
    return out;
  };

  const investorsOf = (l: Lead): LeadInvestors => {
    const name = (uid: Uuid) => db.users.find((u) => u.id === uid)?.full_name ?? "";
    return {
      views: db.oppViews.filter((v) => v.lead_id === l.id).map((v) => ({ ...v, name: name(v.bishop_user_id) })),
      bishop: l.bishop_user_id ? { user_id: l.bishop_user_id, name: name(l.bishop_user_id), accepted_at: l.bishop_accepted_at ?? "" } : null,
      tripartite: tripartiteOf(l),
      presented: db.presentations
        .filter((p) => p.lead_id === l.id)
        .sort((a, b) => a.presented_at.localeCompare(b.presented_at))
        .map((p) => ({ bishop_user_id: p.bishop_user_id, name: name(p.bishop_user_id), presented_at: p.presented_at })),
      candidates: candidates().map((u) => ({ user_id: u.id, name: u.full_name })),
    };
  };

  const leads = {
    getInvestors: async (id: Uuid): Promise<LeadInvestors | null> => {
      const l = d.readableLeads().find((x) => x.id === id);
      return d.delay(l ? investorsOf(l) : null);
    },
    /** "Presentar a Bishops": accepted and not taken yet; only Bishops with the framework signed. Each one is told. */
    presentToBishops: async (id: Uuid, bishopUserIds: Uuid[]): Promise<LeadInvestors> => {
      const l = d.findLead(id);
      if (l.stage !== "accepted" || l.bishop_user_id) throw new Error("invalid_state");
      const ids = [...new Set(bishopUserIds)];
      if (ids.length === 0) throw new Error("bishops_required");
      const allowed = new Set(candidates().map((u) => u.id));
      if (ids.some((x) => !allowed.has(x))) throw new Error("invalid_bishop");
      const fresh = ids.filter((x) => !presentationOf(l.id, x));
      for (const bishopId of fresh) {
        db.presentations.push({ lead_id: l.id, bishop_user_id: bishopId, presented_at: nowIso(), presented_by: d.me().id });
        d.notifyBishop(l, bishopId);
      }
      if (fresh.length > 0)
        d.pushLeadEvent({ lead_id: id, kind: "presented_to_bishops", from: null, to: null, body: fresh.map((x) => db.users.find((u) => u.id === x)?.full_name ?? "").join(", ") });
      return d.delay(investorsOf(l));
    },
    releaseOpportunity: async (id: Uuid, reason: string) => {
      if (!reason.trim()) throw new Error("reason_required");
      const l = d.findLead(id);
      if (l.stage !== "accepted" || !l.bishop_user_id) throw new Error("invalid_state");
      const c = tripartiteOf(l);
      if (c?.state === "signed") throw new Error("tripartite_signed");
      if (c) db.contracts.splice(db.contracts.indexOf(c), 1);
      // An unsigned Acuerdo de Vinculación goes with the Bishop; a signed one keeps the business tied (binding_signed).
      const b = bindingOf(l);
      if (b?.state === "signed") throw new Error("binding_signed");
      if (b) db.contracts.splice(db.contracts.indexOf(b), 1);
      const prev = db.users.find((u) => u.id === l.bishop_user_id)?.full_name ?? "";
      l.bishop_user_id = null;
      l.bishop_accepted_at = null;
      d.pushLeadEvent({ lead_id: id, kind: "bishop_released", from: null, to: null, body: `${prev}: ${reason.trim()}` });
      return d.delay(d.withBooking(l));
    },
    sendTripartite: async (id: Uuid) => {
      const l = d.findLead(id);
      if (l.stage !== "accepted" || !l.bishop_user_id || !l.business_id || tripartiteOf(l)) throw new Error("invalid_state");
      if (oaSendBlock(l, entryRules(db.rules)) === "expansion_meeting_required") throw new Error("expansion_meeting_required");
      const c = makeTripartite(l);
      db.contracts.push(c);
      d.pushLeadEvent({ lead_id: id, kind: "tripartite_sent", from: null, to: null, body: null });
      return d.delay(c);
    },
  };

  /** Sample data: views on Brisa Clean (Jefferson saw it, Laura passed) and Sol Remodeling's tripartite (2 of 3 signed). */
  const seed = (ids: { jefferson: Uuid; laura: Uuid }) => {
    const brisa = db.leads.find((l) => l.business.name === "Brisa Clean Services");
    if (brisa) db.oppViews.push(
      { lead_id: brisa.id, bishop_user_id: ids.jefferson, viewed_at: "2026-09-12T14:00:00Z", decision: "none", decided_at: null },
      { lead_id: brisa.id, bishop_user_id: ids.laura, viewed_at: "2026-09-15T16:00:00Z", decision: "passed", decided_at: "2026-09-16T10:00:00Z" },
    );
    const sol = db.leads.find((l) => l.business.name === "Sol Remodeling");
    if (sol?.business_id) {
      db.oppViews.push({ lead_id: sol.id, bishop_user_id: ids.jefferson, viewed_at: "2026-09-24T15:00:00Z", decision: "none", decided_at: null });
      const c = makeTripartite(sol);
      c.id = "9d000000-0000-4000-8000-000000000001";
      c.sent_at = "2026-10-02";
      const step = (s: Signer, h: [Signer["status"] & string, string][]) => {
        s.history = h.map(([status, at]) => ({ status: status as NonNullable<Signer["status"]>, at }));
        s.status = h.at(-1)![0] as NonNullable<Signer["status"]>;
        s.signed_at = s.status === "signed" ? h.at(-1)![1] : null;
      };
      step(c.signers[0]!, [["sent", "2026-10-02"], ["opened", "2026-10-04"], ["signed", "2026-10-05"]]);
      step(c.signers[1]!, [["sent", "2026-10-02"], ["signed", "2026-10-03"]]);
      step(c.signers[2]!, [["sent", "2026-10-02"], ["opened", "2026-10-06"]]);
      c.state = "opened";
      db.contracts.push(c);
    }
    // Techos Delgado: presented to Jefferson and Laura, both opened it, Jefferson took it; the expansion meeting was held.
    // Its Acuerdo de Vinculación, the validation and the Operating Agreement come from ./contract-rules (seedTechos).
    const techos = db.leads.find((l) => l.business.name === "Techos Delgado");
    if (techos?.business_id) {
      db.presentations.push(
        { lead_id: techos.id, bishop_user_id: ids.jefferson, presented_at: "2026-09-02T14:00:00Z", presented_by: null },
        { lead_id: techos.id, bishop_user_id: ids.laura, presented_at: "2026-09-02T14:00:00Z", presented_by: null },
      );
      db.oppViews.push(
        { lead_id: techos.id, bishop_user_id: ids.jefferson, viewed_at: "2026-09-02T18:00:00Z", decision: "none", decided_at: null },
        { lead_id: techos.id, bishop_user_id: ids.laura, viewed_at: "2026-09-03T10:00:00Z", decision: "none", decided_at: null },
      );
    }

  };

  /** Sample data: a tripartite contract the three already signed (programs funded before today). */
  const seedSignedTripartite = (l: Lead, id: Uuid, sentOn: string, signedOn: { owner: string; sm: string; bishop: string }) => {
    if (!l.business_id || !l.bishop_user_id || tripartiteOf(l)) return;
    const c = makeTripartite(l);
    c.id = id;
    c.sent_at = sentOn;
    for (const s of c.signers) {
      const on = signedOn[s.party ?? "owner"];
      s.history = [{ status: "sent", at: sentOn }, { status: "opened", at: on }, { status: "signed", at: on }];
      s.status = "signed";
      s.signed_at = on;
    }
    c.state = "signed";
    c.signed_at = [signedOn.owner, signedOn.sm, signedOn.bishop].sort().at(-1)!;
    db.contracts.push(c);
  };

  return { bishop, leads, seed, seedSignedTripartite, signableAgreements, tripartiteOf, bindingOf, frameworkOf, candidates };
}
