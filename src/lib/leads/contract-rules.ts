// Entry contracts as rules: which contracts a business entering gets, when each one is created, who signs it (and for
// which Strategic Mates company) and what waits for it. SM Global (Corporate) edits them in Reglas, like the program
// tasks. Pure helpers shared by the mock (its small rule engine), the http adapter and the screens; the API applies
// the same rules.
import { todayIso } from "@/lib/clock";
import {
  CONTRACT_TRIGGER_EVENTS,
  type Contract,
  type ContractTrigger,
  type ContractTriggerEvent,
  type EntryContractRule,
  type IsoDate,
  type SmEntities,
  type SmEntity,
} from "@/lib/api/types";
import { BINDING_TEMPLATE, MOU_TEMPLATE, NDA_TEMPLATE, OPERATING_AGREEMENT_TEMPLATE } from "./contract-templates";

// ---------- Strategic Mates companies ----------

export const DEFAULT_SM_ENTITIES: SmEntities = {
  corporate: { name: "Strategic Mates Corporate" },
  sm_square: { name: "SM Square", signer_mode: "corporate" },
};

/**
 * The names SM Global set (the API always sends them); the defaults only while the rules load or in the demo.
 * corporate.signer_user_id is the SM person who signs for Corporate (null when SM Global has not named one);
 * sm_square.signer_mode who signs for SM Square (corporate, the default: that same person).
 */
export const smEntitiesOf = (rules: { sm_entities?: SmEntities | undefined } | null | undefined): SmEntities => ({
  corporate: {
    name: rules?.sm_entities?.corporate.name?.trim() || DEFAULT_SM_ENTITIES.corporate.name,
    signer_user_id: rules?.sm_entities?.corporate.signer_user_id ?? null,
  },
  sm_square: {
    name: rules?.sm_entities?.sm_square.name?.trim() || DEFAULT_SM_ENTITIES.sm_square.name,
    signer_mode: rules?.sm_entities?.sm_square.signer_mode ?? "corporate",
  },
});

/**
 * Global signs for SM Square (owner's decision of 23 Oct 2026, the default): the Corporate signer signs the SM Square
 * party of the Operating Agreement and the validation names no holder. false: the office designates a holder.
 */
export const globalSignsSmSquare = (entities: SmEntities): boolean => (entities.sm_square.signer_mode ?? "corporate") === "corporate";

/**
 * The company an SM signer signed for ("en nombre de …"): the name frozen on that signature, so renaming the company
 * in the rules never rewrites a signed contract. Older signatures without it fall back to the current name.
 */
export const smSignerEntityName = (
  signer: { sm_entity?: SmEntity | null | undefined; sm_entity_name?: string | null | undefined },
  entities: SmEntities,
): string => signer.sm_entity_name?.trim() || entities[signer.sm_entity ?? "corporate"].name;

// ---------- Templates ----------

/** Placeholders a template can use; the editor shows them as chips to insert. */
export const CONTRACT_TEMPLATE_PLACEHOLDERS = [
  "business_name", "owner_name", "owner_email", "business_activity", "bishop_name", "bishop_email",
  "sm_corporate_name", "sm_square_name", "sm_square_center", "sm_square_holder_name",
  "equity_owner", "equity_bishop", "equity_sm", "investment_amount", "mou_date", "date",
] as const;
export type ContractTemplatePlaceholder = (typeof CONTRACT_TEMPLATE_PLACEHOLDERS)[number];

/** Fills {{placeholder}} with its value; unknown or missing values keep the placeholder as written. */
export function fillContractTemplate(template: string, values: Partial<Record<ContractTemplatePlaceholder, string | number | null | undefined>>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => {
    const value = values[key as ContractTemplatePlaceholder];
    return value === null || value === undefined || value === "" ? whole : String(value);
  });
}

/** The text inserted at the cursor for one placeholder chip. */
export const placeholderToken = (key: ContractTemplatePlaceholder) => `{{${key}}}`;

// ---------- Triggers ----------

const CONTRACT_SIGNED = "contract_signed:";

export type ParsedTrigger = { kind: "event"; event: ContractTriggerEvent } | { kind: "contract"; code: string };

export function parseTrigger(trigger: string): ParsedTrigger | null {
  if (trigger.startsWith(CONTRACT_SIGNED)) {
    const code = trigger.slice(CONTRACT_SIGNED.length).trim();
    return code ? { kind: "contract", code } : null;
  }
  return (CONTRACT_TRIGGER_EVENTS as readonly string[]).includes(trigger) ? { kind: "event", event: trigger as ContractTriggerEvent } : null;
}

export const contractSignedTrigger = (code: string): ContractTrigger => `${CONTRACT_SIGNED}${code}`;

/** A contract whose SM signer is SM Square waits for the validation closed: its holder comes from there. */
export const needsValidation = (rule: Pick<EntryContractRule, "signers">) =>
  rule.signers.some((s) => s.party === "sm" && s.sm_entity === "sm_square");

/** Rules in the order the screens show them (position, then name). */
export const byPosition = <T extends Pick<EntryContractRule, "position" | "name">>(a: T, b: T) =>
  a.position - b.position || a.name.localeCompare(b.name);

/**
 * Why a rule cannot be saved, or null: name_required, invalid_trigger (unknown, or "signed" of itself or of a rule
 * that does not exist), signers_required, sm_entity_required (an SM signer without its company), invalid_days.
 */
export function ruleError(
  rule: Pick<EntryContractRule, "name" | "trigger" | "signers" | "delay_days" | "deadline_days"> & { code?: string | undefined },
  otherCodes: readonly string[],
): "name_required" | "invalid_trigger" | "signers_required" | "sm_entity_required" | "invalid_days" | null {
  if (!rule.name.trim()) return "name_required";
  const trigger = parseTrigger(rule.trigger);
  if (!trigger || (trigger.kind === "contract" && (trigger.code === rule.code || !otherCodes.includes(trigger.code)))) return "invalid_trigger";
  if (rule.signers.length === 0) return "signers_required";
  if (rule.signers.some((s) => s.party === "sm" && !s.sm_entity)) return "sm_entity_required";
  const days = [rule.delay_days, rule.deadline_days];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 365)) return "invalid_days";
  return null;
}

// ---------- The engine (what the mock runs; the API does the same) ----------

const addDays = (date: string, n: number): IsoDate => {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** What happened on one lead, as dates (YYYY-MM-DD) or null. `signed` maps a rule code to its full-signature day. */
export interface EntryFacts {
  meeting_booked: IsoDate | null;
  nda_signed: IsoDate | null;
  meeting_held: IsoDate | null;
  documents_approved: IsoDate | null;
  bishop_accepted: IsoDate | null;
  validation_closed: IsoDate | null;
  signed: Record<string, IsoDate | null | undefined>;
}

/** The day the trigger of a rule happened, or null while it did not. */
export function triggerDate(rule: Pick<EntryContractRule, "trigger">, facts: EntryFacts): IsoDate | null {
  const trigger = parseTrigger(rule.trigger);
  if (!trigger) return null;
  const at = trigger.kind === "event" ? facts[trigger.event] : facts.signed[trigger.code];
  return at ? at.slice(0, 10) : null;
}

export interface RuleSchedule {
  /** Day the contract is (or will be) created: trigger + delay, and not before the validation when it needs it. */
  creates_on: IsoDate | null;
  /** Last day to sign it: trigger + delay + deadline_days; null without a deadline or while the trigger is pending. */
  sign_by: IsoDate | null;
  /** The trigger happened but the contract waits for the validation to close. */
  waiting_validation: boolean;
}

export function ruleSchedule(rule: Pick<EntryContractRule, "trigger" | "delay_days" | "deadline_days" | "signers">, facts: EntryFacts): RuleSchedule {
  const at = triggerDate(rule, facts);
  if (!at) return { creates_on: null, sign_by: null, waiting_validation: false };
  const start = addDays(at, rule.delay_days);
  const sign_by = rule.deadline_days > 0 ? addDays(start, rule.deadline_days) : null;
  if (needsValidation(rule)) {
    if (!facts.validation_closed) return { creates_on: null, sign_by, waiting_validation: true };
    const closed = facts.validation_closed.slice(0, 10);
    return { creates_on: closed > start ? closed : start, sign_by, waiting_validation: false };
  }
  return { creates_on: start, sign_by, waiting_validation: false };
}

/**
 * The rules whose contract has to be created today: active, not created yet (idempotent: `existing` holds the codes
 * already there), trigger happened, delay over and, when it needs it, the validation closed. A rule placed before a
 * contract that already exists is skipped too: that business entered before the rule (no binding agreement for a
 * business whose Operating Agreement already went out).
 */
export function dueRules(
  rules: readonly EntryContractRule[],
  facts: EntryFacts,
  existing: ReadonlySet<string>,
  today: IsoDate = todayIso(),
): { rule: EntryContractRule; sign_by: IsoDate | null }[] {
  const active = rules.filter((r) => r.active).sort(byPosition);
  const latestExisting = Math.max(-Infinity, ...rules.filter((r) => existing.has(r.code)).map((r) => r.position));
  return active.flatMap((rule) => {
    if (existing.has(rule.code) || rule.position < latestExisting) return [];
    const s = ruleSchedule(rule, facts);
    return s.creates_on && s.creates_on <= today ? [{ rule, sign_by: s.sign_by }] : [];
  });
}

// ---------- The entry contracts of one business, by rule ----------

/** The contract a rule produced: tagged with its code, or (older answers) the only contract of the rule's kind. */
export function contractForRule<C extends Pick<Contract, "kind" | "rule_code">>(rule: Pick<EntryContractRule, "code" | "kind">, contracts: readonly C[], rules: readonly Pick<EntryContractRule, "code" | "kind" | "active">[]): C | null {
  const tagged = contracts.find((c) => c.rule_code === rule.code);
  if (tagged) return tagged;
  if (rule.kind === "other" || rules.some((r) => r.code !== rule.code && r.kind === rule.kind && r.active)) return null;
  return contracts.find((c) => c.kind === rule.kind && !c.rule_code) ?? null;
}

/**
 * The entry checklist of a business: one row per active rule in order, with its contract or null (not created
 * yet), then the contracts no rule explains (the owner's own NDA, older ones).
 */
export function checklistByRule<C extends Pick<Contract, "id" | "kind" | "rule_code">>(rules: readonly EntryContractRule[], contracts: readonly C[]) {
  const active = rules.filter((r) => r.active).sort(byPosition);
  const all = active.map((rule) => ({ rule, contract: contractForRule(rule, contracts, rules) }));
  // A rule before a contract that already exists will never be created for this business (it entered before it).
  const latest = Math.max(-Infinity, ...all.filter((r) => r.contract).map((r) => r.rule.position));
  const rows = all.filter((r) => r.contract || r.rule.position > latest);
  const used = new Set(rows.flatMap((r) => (r.contract ? [r.contract.id] : [])));
  return { rows, others: contracts.filter((c) => !used.has(c.id)) };
}

/** What the screens know of one business to tell when a pending rule is created: its signed contracts and the validation. */
export function factsFromContracts(
  rules: readonly EntryContractRule[],
  contracts: readonly Contract[],
  validationClosedAt: string | null | undefined,
): EntryFacts {
  const signed: EntryFacts["signed"] = {};
  for (const rule of rules) {
    const c = contractForRule(rule, contracts, rules);
    signed[rule.code] = c && fullySigned(c) ? c.signed_at ?? c.signers.map((s) => s.signed_at ?? "").sort().at(-1) ?? null : null;
  }
  return {
    meeting_booked: null, nda_signed: null, meeting_held: null, documents_approved: null, bishop_accepted: null,
    validation_closed: validationClosedAt ?? null, signed,
  };
}

// ---------- Deadline of a contract ----------

const fullySigned = (c: Pick<Contract, "signers">) => c.signers.length > 0 && c.signers.every((s) => s.status === "signed");

export type DeadlineState = { state: "none" } | { state: "open"; sign_by: IsoDate } | { state: "overdue"; sign_by: IsoDate };

/** "Firma antes del ..." while it runs, overdue once the day passed without every signature. */
export function contractDeadline(c: Pick<Contract, "signers" | "sign_by">, today: IsoDate = todayIso()): DeadlineState {
  if (!c.sign_by || fullySigned(c)) return { state: "none" };
  return today > c.sign_by ? { state: "overdue", sign_by: c.sign_by } : { state: "open", sign_by: c.sign_by };
}

// ---------- Who signs for Strategic Mates ----------

/**
 * Why the current SM person cannot sign the SM part of a contract, or null. A signer with a person (the binding
 * agreement: Corporate's CEO; the Operating Agreement: Global's Corporate signer, or the SM Square holder the office
 * designated) is signed only by that person, as the API checks; an SM Square row with nobody named yet also needs the
 * permission (sm_square_signer_required).
 */
export function smSignBlock(
  signer: { user_id?: string | null | undefined; sm_entity?: SmEntity | null | undefined } | undefined,
  me: { id: string; can_sign_sm_square?: boolean | undefined } | undefined,
): "sm_square_signer_required" | "not_signer" | null {
  if (!signer || !me) return "not_signer";
  if (signer.sm_entity === "sm_square") {
    if (signer.user_id) return signer.user_id === me.id ? null : "sm_square_signer_required";
    return me.can_sign_sm_square ? null : "sm_square_signer_required";
  }
  if (signer.user_id && signer.user_id !== me.id) return "not_signer";
  return null;
}

// ---------- Default rules (Strategic Mates' documents, 20 Oct 2026) ----------

export const BINDING_RULE_CODE = "binding";
export const OPERATING_AGREEMENT_RULE_CODE = "operating_agreement";

/** The four contracts of the entry, as SM Global finds them before editing anything. */
export const DEFAULT_ENTRY_CONTRACT_RULES: EntryContractRule[] = [
  {
    code: "nda", name: "NDA mutuo", kind: "nda", template: NDA_TEMPLATE,
    explainer: {
      title: "Qué es el NDA",
      paragraphs: [
        "Es un acuerdo de confidencialidad. Strategic Mates se compromete a cuidar todo lo que nos cuentes de tu negocio.",
        "Lo pedimos antes de la reunión para que puedas hablar con confianza de tus números, tus clientes y tu forma de trabajar.",
      ],
      bullets: [
        "Lo que compartas se usa solo para evaluar tu negocio y, si siguen juntos, para el programa.",
        "Solo lo ven las personas que trabajan en tu evaluación, con el mismo deber de confidencialidad.",
        "No te compromete a entrar al programa ni a pagar nada.",
      ],
    },
    signers: [{ party: "owner" }, { party: "sm", sm_entity: "corporate", auto_sign: true }],
    trigger: "meeting_booked", delay_days: 0, deadline_days: 0, blocks: ["mou"], required: true, position: 1, active: true, version: 1,
  },
  {
    code: "mou", name: "MOU", kind: "mou", template: MOU_TEMPLATE,
    explainer: {
      title: "Qué es el MOU",
      paragraphs: [
        "El MOU es un memorando de entendimiento. Explica cómo vamos a trabajar juntos antes de los acuerdos definitivos.",
        "Lo firmas en la reunión con tu consultor, o antes si ya lo leíste. No es un préstamo ni una venta de tu negocio.",
      ],
      bullets: [
        "Un inversor (Business Bishop) cubre el programa: tú no pagas.",
        "Tu negocio sigue siendo tuyo: se crea una empresa nueva para vender las franquicias.",
        "En esa empresa nueva tú tienes del 50 % al 75 %, el inversor del 15 % al 40 % y SM Square el 10 %.",
        "Si algo no sale como esperamos, no quedas con deudas por el programa.",
      ],
    },
    signers: [{ party: "owner" }, { party: "sm", sm_entity: "corporate", auto_sign: true }],
    trigger: "nda_signed", delay_days: 0, deadline_days: 0, blocks: ["documents"], required: true, position: 2, active: true, version: 1,
  },
  {
    code: BINDING_RULE_CODE, name: "Acuerdo de Vinculación y Formalización", kind: "binding", template: BINDING_TEMPLATE,
    explainer: {
      title: "Qué es el Acuerdo de Vinculación",
      paragraphs: [
        "Es el acuerdo entre tú, el inversor y Strategic Mates para seguir juntos. Se firma en la reunión de vinculación.",
        "Con él, los tres se comprometen a firmar el Operating Agreement dentro de los 7 días siguientes.",
      ],
      bullets: [
        "Tú conservas del 50 % al 75 % de la empresa nueva; el inversor del 15 % al 40 %; SM Square el 10 %.",
        "Strategic Mates fija los porcentajes dentro de esos rangos y te los explica antes del Operating Agreement.",
        "Si después de firmar desistes sin motivo, cubres los costos de gestión hasta USD 2.000.",
        "Firmarlo no inicia los 180 días del programa.",
      ],
    },
    signers: [{ party: "owner" }, { party: "bishop" }, { party: "sm", sm_entity: "corporate" }],
    trigger: "bishop_accepted", delay_days: 0, deadline_days: 0, blocks: [OPERATING_AGREEMENT_RULE_CODE], required: true, position: 3, active: true, version: 1,
  },
  {
    code: OPERATING_AGREEMENT_RULE_CODE, name: "Operating Agreement", kind: "tripartite", template: OPERATING_AGREEMENT_TEMPLATE,
    explainer: {
      title: "Qué es el Operating Agreement",
      paragraphs: [
        "Es el contrato de la empresa nueva que va a vender las franquicias: quiénes son los socios, con qué porcentaje y cómo se decide.",
        "Se firma dentro de los 7 días siguientes al Acuerdo de Vinculación. Por Strategic Mates firma el titular de SM Square.",
      ],
      bullets: [
        "Tiene los porcentajes definitivos que Strategic Mates validó.",
        "El inversor recupera primero lo que aportó, con lo que la empresa nueva distribuya.",
        "Tu negocio original queda fuera de esa empresa: sigue siendo solo tuyo.",
      ],
    },
    signers: [{ party: "owner" }, { party: "bishop" }, { party: "sm", sm_entity: "sm_square" }],
    trigger: contractSignedTrigger(BINDING_RULE_CODE), delay_days: 0, deadline_days: 7, blocks: ["program_start"], required: true, position: 4, active: true, version: 1,
  },
];

/** The default rule of one code (the mock seeds and the texts of the NDA and the MOU come from here). */
export const defaultRule = (code: string) => DEFAULT_ENTRY_CONTRACT_RULES.find((r) => r.code === code);
