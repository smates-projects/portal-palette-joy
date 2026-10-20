// ContractRulesRepository over the real API: the entry contracts as rules (GET /entry-contract-rules). Every SM person
// reads them; only SM Global writes. PATCH /entry-contract-rules/{code} needs If-Match with the rule's version, which
// the editor knows from the list (rules carry `version`); a stale one answers precondition_failed.
import type { ContractRulesRepository } from "../repositories";
import type { EntryContractRule, EntryContractRuleChange } from "../types";
import type { HttpClient } from "./client";

const BASE = "/entry-contract-rules";
const rulePath = (code: string) => `${BASE}/${encodeURIComponent(code)}`;

/** Older answers may come without deadline_days or blocks: the front reads them as "no deadline" and "nothing". */
const toRule = (rule: EntryContractRule): EntryContractRule => ({
  ...rule,
  deadline_days: rule.deadline_days ?? 0,
  delay_days: rule.delay_days ?? 0,
  blocks: rule.blocks ?? [],
  signers: rule.signers ?? [],
  explainer: rule.explainer ?? { title: "", paragraphs: [], bullets: [] },
});

export function createHttpContractRulesRepository(client: HttpClient): ContractRulesRepository {
  return {
    list: async () => (await client.get<EntryContractRule[]>(BASE)).map(toRule),

    add: async (input) => toRule(await client.post<EntryContractRule>(BASE, input, { idempotent: true })),

    /** The version travels as If-Match ("3"), the same way an ETag of a GET would. */
    update: async (code, patch, version, note) => {
      const path = rulePath(code);
      client.etags.set(path, `"${version}"`);
      return toRule(await client.patch<EntryContractRule>(path, { ...patch, note: note ?? null }));
    },

    archive: async (code, reason) =>
      toRule(await client.post<EntryContractRule>(`${rulePath(code)}/archive`, reason?.trim() ? { reason: reason.trim() } : undefined)),

    restore: async (code) => toRule(await client.post<EntryContractRule>(`${rulePath(code)}/restore`)),

    listHistory: () => client.get<EntryContractRuleChange[]>(`${BASE}/history`),
  };
}
