// RulesRepository over the real API (catalog module: catalog.controller.ts). Everyone reads the rules; only SM
// Global changes them. GET /rules answers an ETag, kept under "/rules"; PATCH /rules requires it as If-Match and
// answers the next one. When none is known the rules are read first; a stale one answers precondition_failed.
import type { RulesRepository } from "../repositories";
import type { PlatformRules, RulesChange } from "../types";
import type { HttpClient } from "./client";

const RULES_PATH = "/rules";

/** The API adds its flag for the open decision "100 % of the funds before day 1", which no screen uses yet. */
interface PlatformRulesResponse extends PlatformRules {
  program_start_requires_full_funds?: boolean | undefined;
}

/** program_amount is money: absent for owners, firms and franchisees, and left absent here too. */
const toRules = (rules: PlatformRulesResponse): PlatformRules => ({
  franchisability_goal: rules.franchisability_goal,
  required_task_codes: rules.required_task_codes,
  area_amber_days: rules.area_amber_days,
  franchisability_amber_tolerance: rules.franchisability_amber_tolerance,
  document_review_days: rules.document_review_days,
  intake_documents: rules.intake_documents,
  ...(rules.program_amount !== undefined ? { program_amount: rules.program_amount } : {}),
  ...(rules.assessment_area_map !== undefined
    ? { assessment_area_map: rules.assessment_area_map }
    : {}),
  // Revised entry: absent until the API sends them (lib/leads/entry-flow applies the defaults then).
  ...(rules.opportunity_visibility !== undefined
    ? { opportunity_visibility: rules.opportunity_visibility }
    : {}),
  ...(rules.oa_waiting_days !== undefined ? { oa_waiting_days: rules.oa_waiting_days } : {}),
  ...(rules.require_expansion_meeting !== undefined
    ? { require_expansion_meeting: rules.require_expansion_meeting }
    : {}),
  ...(rules.nda_auto_signed_by_sm !== undefined
    ? { nda_auto_signed_by_sm: rules.nda_auto_signed_by_sm }
    : {}),
  // Calendar v2: absent until SM Global sets it (lib/calendar applies 09:00-18:00 America/New_York).
  ...(rules.meeting_hours !== undefined ? { meeting_hours: rules.meeting_hours } : {}),
  // Entry help: the owner's own NDA template and the general note of the documents list (help per document travels
  // inside intake_documents).
  ...(rules.owner_nda_template !== undefined ? { owner_nda_template: rules.owner_nda_template } : {}),
  ...(rules.intake_help_text !== undefined ? { intake_help_text: rules.intake_help_text } : {}),
  // Configurable entry contracts: the names of Corporate and SM Square (absent = lib/leads/contract-rules defaults).
  ...(rules.sm_entities !== undefined ? { sm_entities: rules.sm_entities } : {}),
});

export function createHttpRulesRepository(client: HttpClient): RulesRepository {
  return {
    get: async () => toRules(await client.get<PlatformRulesResponse>(RULES_PATH)),

    /** PATCH /rules (If-Match): the changed fields plus the note kept in the history. */
    update: async (patch, note) => {
      if (!client.etags.has(RULES_PATH)) await client.get<PlatformRulesResponse>(RULES_PATH);
      return toRules(
        await client.patch<PlatformRulesResponse>(RULES_PATH, { ...patch, note: note ?? null }),
      );
    },

    /** Newest first. SM Global only. */
    listHistory: () => client.get<RulesChange[]>(`${RULES_PATH}/history`),
  };
}
