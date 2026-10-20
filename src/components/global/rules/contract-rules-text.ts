// Plain words for an entry contract rule ("Cuando el inversor acepta", "Firman: Dueño, Inversor y Strategic Mates por
// Corporate"), shared by Reglas, the lead's checklist and "Tu ingreso". Not a component: helpers only.
import type { TFunction } from "i18next";
import type { EntryContractRule, SmEntities } from "@/lib/api/types";
import { needsValidation, parseTrigger } from "@/lib/leads/contract-rules";

const nameOfRule = (rules: readonly Pick<EntryContractRule, "code" | "name">[], code: string) => rules.find((r) => r.code === code)?.name ?? code;

/** When the contract is created: the trigger, the delay, the validation it waits for and the deadline to sign. */
export function whenText(t: TFunction, rule: EntryContractRule, rules: readonly EntryContractRule[]): string {
  const trigger = parseTrigger(rule.trigger);
  const base = !trigger
    ? rule.trigger
    : trigger.kind === "event"
      ? t(`entry_contracts.when.${trigger.event}`)
      : t("entry_contracts.when.contract_signed", { name: nameOfRule(rules, trigger.code) });
  const parts = [base];
  if (rule.delay_days > 0) parts.push(t("entry_contracts.when.delay", { count: rule.delay_days }));
  if (needsValidation(rule)) parts.push(t("entry_contracts.when.with_validation"));
  const sentence = parts.join("");
  return rule.deadline_days > 0 ? `${sentence}. ${t("entry_contracts.when.deadline", { count: rule.deadline_days })}` : sentence;
}

/** Who signs, with the Strategic Mates company: "Dueño, Inversor, Strategic Mates por SM Square". */
export function signersText(t: TFunction, rule: Pick<EntryContractRule, "signers">, entities: SmEntities): string {
  return rule.signers
    .map((s) =>
      s.party === "sm"
        ? t(s.auto_sign ? "entry_contracts.signers.sm_auto" : "entry_contracts.signers.sm", { entity: entities[s.sm_entity ?? "corporate"].name })
        : t(`entry_contracts.signers.${s.party}`),
    )
    .join(", ");
}

/** What waits for it signed: the documents, the program start or another contract. */
export function blocksText(t: TFunction, rule: Pick<EntryContractRule, "blocks">, rules: readonly EntryContractRule[]): string {
  if (rule.blocks.length === 0) return t("entry_contracts.blocks.none");
  return rule.blocks
    .map((b) => (b === "documents" || b === "program_start" ? t(`entry_contracts.blocks.${b}`) : nameOfRule(rules, b)))
    .join(", ");
}

/** The things a rule can block, for the editor's checkboxes: the two fixed ones and every other rule. */
export const blockOptions = (rules: readonly EntryContractRule[], code: string | undefined) => [
  "documents",
  "program_start",
  ...rules.filter((r) => r.code !== code).map((r) => r.code),
];
