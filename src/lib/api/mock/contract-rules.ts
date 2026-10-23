// Entry contracts as rules in the mock: the repository SM Global edits (list, add, edit with the version, archive,
// restore, history) and a small rule engine that creates each business's contracts when their rule says, so the demo
// follows whatever Corporate configured. The NDA and the MOU keep their own flow (booking, NDA signature): the engine
// only tags them with their rule. The real API runs the same engine on its side.
import { nowIso, todayIso } from "@/lib/clock";
import {
  DEFAULT_ENTRY_CONTRACT_RULES, byPosition, dueRules, globalSignsSmSquare, parseTrigger, ruleError, smEntitiesOf, type EntryFacts,
} from "@/lib/leads/contract-rules";
import { typedSignatureDataUrl } from "@/lib/contracts/signature";
import { bilingualContract, governingLanguageOfRules } from "./contract-texts";
import type { ContractRulesRepository } from "../repositories";
import type {
  Contract, EntryContractRule, EntryContractRuleChange, EntryContractRuleInput, EntryContractSigner, Lead, LeadEvent,
  NotificationKind, PlatformRules, Signer, User, Uuid,
} from "../types";
import type { IntakeRecord } from "./intake";

export interface ContractRulesDb {
  leads: Lead[];
  users: User[];
  contracts: Contract[];
  rules: PlatformRules;
  intakes: IntakeRecord[];
  leadEvents: LeadEvent[];
  contractRules: EntryContractRule[];
  contractRulesHistory: EntryContractRuleChange[];
}

interface Deps {
  db: ContractRulesDb;
  me: () => User;
  newId: () => Uuid;
  delay: <T>(v: T) => Promise<T>;
  /** Bell notification to the parties of one entering business (owner, Bishop, SM team, Corporate signer). */
  notifyParties: (l: Lead, kind: NotificationKind, contract: Contract | null, extra?: Uuid[]) => void;
}

/** Kinds the engine creates; nda and mou are created by their own flow, framework belongs to the Bishop. */
const ENGINE_KINDS = new Set(["binding", "tripartite", "other"]);
const fullySigned = (c: Contract) => c.signers.length > 0 && c.signers.every((s) => s.status === "signed");
const lastSignedOn = (c: Contract) => c.signed_at ?? c.signers.map((s) => s.signed_at ?? "").sort().at(-1) ?? null;
const usd = (n: number | null | undefined) => (typeof n === "number" ? `USD ${n.toLocaleString("en-US")}` : null);

export function createContractRules(d: Deps) {
  const { db } = d;

  const corporateOnly = () => {
    if (d.me().role !== "sm_global") throw new Error("forbidden");
    return d.me();
  };
  const findRule = (code: string) => {
    const r = db.contractRules.find((x) => x.code === code);
    if (!r) throw new Error("not_found");
    return r;
  };
  const log = (code: string, kind: EntryContractRuleChange["kind"], changes: EntryContractRuleChange["changes"], note: string | null) =>
    db.contractRulesHistory.unshift({ id: d.newId(), code, kind, actor_user_id: d.me().id, created_at: nowIso(), changes, note });
  const otherCodes = (code?: string) => db.contractRules.filter((r) => r.code !== code).map((r) => r.code);
  const check = (rule: EntryContractRuleInput & { code?: string }) => {
    const error = ruleError(rule, otherCodes(rule.code));
    if (error) throw new Error(error);
  };
  const slug = (name: string) =>
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "contract";

  // ---------- The engine ----------

  const contractsOf = (businessId: Uuid) => db.contracts.filter((c) => c.business_id === businessId && c.area === "intake");
  /** The contract a rule produced: tagged with its code, or (older contracts) the only one of the rule's kind. */
  const contractOfRule = (businessId: Uuid, rule: EntryContractRule) => {
    const all = contractsOf(businessId);
    const tagged = all.find((c) => c.rule_code === rule.code);
    if (tagged) return tagged;
    if (rule.kind === "other" || db.contractRules.some((r) => r !== rule && r.kind === rule.kind && r.active)) return undefined;
    const legacy = all.find((c) => c.kind === rule.kind && !c.rule_code);
    if (legacy) legacy.rule_code = rule.code;
    return legacy;
  };

  const factsOf = (l: Lead, businessId: Uuid): EntryFacts => {
    const record = db.intakes.find((i) => i.lead_id === l.id);
    const nda = contractsOf(businessId).find((c) => c.kind === "nda");
    const signed: EntryFacts["signed"] = {};
    for (const rule of db.contractRules) {
      const c = contractOfRule(businessId, rule);
      signed[rule.code] = c && fullySigned(c) ? lastSignedOn(c) : null;
    }
    return {
      meeting_booked: l.meeting?.booked_at ?? null,
      nda_signed: nda?.signers.find((s) => s.party === "owner" && s.status === "signed")?.signed_at ?? null,
      meeting_held: l.meeting?.outcome === "held" ? l.meeting.notes_at ?? l.meeting.starts_at : null,
      documents_approved: record?.approved_at ?? null,
      bishop_accepted: l.bishop_user_id ? l.bishop_accepted_at : null,
      validation_closed: l.validation?.status === "closed" ? l.validation.closed_at : null,
      signed,
    };
  };

  /** Corporate signs for Strategic Mates: its CEO (the first SM Global admin). */
  const corporateSigner = () => db.users.find((u) => u.role === "sm_global" && u.is_admin) ?? db.users.find((u) => u.role === "sm_global");

  const signerOf = (s: EntryContractSigner, l: Lead, owner: User | undefined, on: string): Signer | null => {
    const base = (name: string, user_id: Uuid | null): Signer => ({
      name, role: s.party, party: s.party, user_id, status: "sent", signed_at: null, decline_reason: null,
      history: [{ status: "sent", at: on }],
      // As the API: the company's name is frozen on the signature when the contract is created.
      ...(s.party === "sm" ? { sm_entity: s.sm_entity ?? "corporate", sm_entity_name: smEntitiesOf(db.rules)[s.sm_entity ?? "corporate"].name } : {}),
    });
    if (s.party === "owner") return base(owner?.full_name ?? l.contact.name, owner?.id ?? null);
    if (s.party === "bishop") {
      const bishop = db.users.find((u) => u.id === l.bishop_user_id);
      return bishop ? base(bishop.full_name, bishop.id) : null;
    }
    // Corporate signs through its CEO, also when the rule pre-signs ("Firmado por Marilyn Boraei en nombre de ...").
    // SM Square too while Global signs for it (signer_mode corporate); else the holder of the validation.
    const person = s.sm_entity === "sm_square" && !globalSignsSmSquare(smEntitiesOf(db.rules))
      ? db.users.find((u) => u.id === l.validation?.sm_square_holder_user_id)
      : corporateSigner();
    if (s.sm_entity === "sm_square" && !person) return null;
    const signer = base(person?.full_name ?? "Strategic Mates", person?.id ?? null);
    if (s.auto_sign) {
      Object.assign(signer, { status: "signed", signed_at: on, history: [{ status: "sent", at: on }, { status: "signed", at: on }], signature: { kind: "typed", image_url: typedSignatureDataUrl(signer.name) } });
    }
    return signer;
  };

  const create = (l: Lead, businessId: Uuid, rule: EntryContractRule, on: string, sign_by: string | null): Contract | null => {
    const owner = db.users.find((u) => u.role === "business_owner" && u.business_id === businessId);
    const signers = rule.signers.map((s) => signerOf(s, l, owner, on));
    if (signers.some((s) => s === null)) return null;
    const bishop = db.users.find((u) => u.id === l.bishop_user_id);
    const holder = globalSignsSmSquare(smEntitiesOf(db.rules)) ? corporateSigner() : db.users.find((u) => u.id === l.validation?.sm_square_holder_user_id);
    const mou = contractsOf(businessId).find((c) => c.kind === "mou");
    const entities = smEntitiesOf(db.rules);
    const c: Contract = {
      id: d.newId(), business_id: businessId, area: "intake", kind: rule.kind, rule_code: rule.code, name: rule.name,
      state: "sent", sent_at: on, signed_at: null, sign_by,
      // Both languages (English while the rule keeps the default text), as the API sends them.
      ...bilingualContract(rule.kind, rule, {
        business_name: l.business.name, owner_name: owner?.full_name ?? l.contact.name, owner_email: owner?.email ?? l.contact.email,
        business_activity: l.business.activity, bishop_name: bishop?.full_name, bishop_email: bishop?.email,
        sm_corporate_name: entities.corporate.name, sm_square_name: entities.sm_square.name,
        sm_square_center: l.validation?.sm_square_center, sm_square_holder_name: holder?.full_name,
        equity_owner: l.validation?.equity_owner, equity_bishop: l.validation?.equity_bishop, equity_sm: l.validation?.equity_sm,
        investment_amount: usd(l.validation?.investment_amount ?? db.rules.program_amount), mou_date: mou?.signed_at, date: on,
      }, governingLanguageOfRules(db.rules)),
      signers: signers as Signer[],
    };
    db.contracts.push(c);
    db.leadEvents.push({ id: d.newId(), lead_id: l.id, kind: "contract_created", actor_user_id: null, created_at: nowIso(), from: null, to: null, body: rule.name });
    if (rule.kind === "binding") d.notifyParties(l, "binding_ready", c, signers.flatMap((s) => (s?.party === "sm" && s.user_id ? [s.user_id] : [])));
    return c;
  };

  /**
   * Creates every contract whose rule is due today, for every business still entering. Idempotent: a rule that
   * already has its contract is never created again, so it runs on every read (as the API's scheduler would).
   */
  const sweep = () => {
    const rules = [...db.contractRules].sort(byPosition);
    for (const l of db.leads) {
      if (!l.business_id || l.stage === "discarded" || l.stage === "in_program") continue;
      if (!db.intakes.some((i) => i.lead_id === l.id)) continue;
      const businessId = l.business_id;
      // Keep going while one creation unlocks the next one (a contract signed in the same pass).
      for (let pass = 0; pass < rules.length; pass += 1) {
        const existing = new Set(rules.filter((r) => contractOfRule(businessId, r)).map((r) => r.code));
        const due = dueRules(rules, factsOf(l, businessId), existing, todayIso()).filter(({ rule }) => ENGINE_KINDS.has(rule.kind));
        const made = due.map(({ rule, sign_by }) => {
          const s = factsOf(l, businessId);
          const trigger = parseTrigger(rule.trigger);
          const at = trigger?.kind === "contract" ? s.signed[trigger.code] : trigger ? s[trigger.event] : null;
          const closed = s.validation_closed?.slice(0, 10);
          const start = at ? at.slice(0, 10) : todayIso();
          const on = closed && closed > start && rule.signers.some((x) => x.sm_entity === "sm_square") ? closed : start;
          return create(l, businessId, rule, on > todayIso() ? todayIso() : on, sign_by);
        });
        if (!made.some(Boolean)) break;
      }
    }
  };

  /** The contract of a rule kind for one business (binding, Operating Agreement), for the Bishop and SM screens. */
  const contractOfKind = (businessId: Uuid | null, kind: EntryContractRule["kind"]) =>
    businessId ? db.contracts.find((c) => c.business_id === businessId && c.area === "intake" && c.kind === kind) ?? null : null;

  // ---------- Repository (SM Global writes, every SM person reads) ----------

  const repository: ContractRulesRepository = {
    list: async () => {
      const u = d.me();
      if (u.role !== "sm_global" && u.role !== "sm_team") throw new Error("forbidden");
      return d.delay([...db.contractRules].sort(byPosition));
    },
    add: async (input) => {
      corporateOnly();
      const code = input.code?.trim() || slug(input.name);
      if (db.contractRules.some((r) => r.code === code)) throw new Error("code_taken");
      const rule: EntryContractRule = { ...structuredClone(input), code, active: true, version: 1 };
      check(rule);
      db.contractRules.push(rule);
      log(code, "added", [], null);
      sweep();
      return d.delay(rule);
    },
    update: async (code, patch, version, note) => {
      corporateOnly();
      const rule = findRule(code);
      if (version !== rule.version) throw new Error("precondition_failed");
      const next = { ...rule, ...structuredClone(patch), code, active: rule.active, version: rule.version + 1 };
      check(next);
      const changes = (Object.keys(patch) as (keyof EntryContractRuleInput)[])
        .filter((k) => k !== "code" && JSON.stringify(rule[k as keyof EntryContractRule]) !== JSON.stringify(next[k as keyof EntryContractRule]))
        .map((k) => ({ field: k, from: rule[k as keyof EntryContractRule], to: next[k as keyof EntryContractRule] }));
      Object.assign(rule, next);
      if (changes.length > 0) log(code, "edited", changes, note?.trim() || null);
      sweep();
      return d.delay(rule);
    },
    archive: async (code, reason) => {
      corporateOnly();
      const rule = findRule(code);
      // Another active rule waits for this one to be signed: archiving it would leave that one without a trigger.
      if (db.contractRules.some((r) => r.active && r.code !== code && parseTrigger(r.trigger)?.kind === "contract" && r.trigger.endsWith(`:${code}`))) throw new Error("rule_in_use");
      if (rule.active) {
        rule.active = false;
        rule.version += 1;
        log(code, "archived", [], reason?.trim() || null);
      }
      return d.delay(rule);
    },
    restore: async (code) => {
      corporateOnly();
      const rule = findRule(code);
      if (!rule.active) {
        rule.active = true;
        rule.version += 1;
        log(code, "restored", [], null);
        sweep();
      }
      return d.delay(rule);
    },
    listHistory: async () => {
      corporateOnly();
      return d.delay(db.contractRulesHistory);
    },
  };

  /** The default rules, as SM Global finds them. */
  const seed = () => {
    db.contractRules.push(...structuredClone(DEFAULT_ENTRY_CONTRACT_RULES));
  };

  return { repository, sweep, seed, contractOfKind, corporateSigner };
}
export type ContractRules = ReturnType<typeof createContractRules>;
