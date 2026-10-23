// How each rules field reads in the Reglas history ("<field>: antes X, ahora Y"). Every field type has its own form
// (ranges, weekdays, objects), and a field the front does not know yet reads as its words, never "NaN puntos" or a
// raw key (QA M4 of 23 Oct 2026).
import type { EligibilityRules, EquityRanges, SmEntities } from "@/lib/api/types";
import type { IntakeDocRule, MeetingHours } from "@/lib/api/network-types";
import { formatUsd } from "@/lib/format";
import { zoneKey } from "./MeetingHoursRules";

type Translate = (key: string, values?: Record<string, unknown>) => string;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** "contract_due_soon" -> "Contract due soon". */
const words = (key: string) => {
  const text = key.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The weekdays of the meeting hours (1 Monday ... 7 or 0 Sunday) in the locale's short names, in week order. */
export function weekdaysText(weekdays: readonly number[] | undefined, language: string): string {
  const days = [...new Set((weekdays ?? [1, 2, 3, 4, 5]).map((d) => (d === 0 ? 7 : d)))].sort((a, b) => a - b);
  // 2026-10-19 is a Monday: day n of the week is that date plus n - 1.
  const name = (d: number) => new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 18 + d))).replace(/\.$/, "");
  return days.map(name).join(", ");
}

const range = (r: { min: number; max: number } | undefined) => (!r ? "" : r.min === r.max ? `${r.min} %` : `${r.min}-${r.max} %`);

/** A value of a field nobody taught the front to read: numbers, words, lists and "key: value" pairs. */
function genericText(value: unknown, t: Translate): string {
  if (typeof value === "boolean") return t(value ? "entry.rules.flow.yes" : "entry.rules.flow.no");
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((v) => genericText(v, t)).join(", ") : t("global.rules.required_none");
  if (isRecord(value)) return Object.entries(value).map(([key, v]) => `${words(key)}: ${genericText(v, t)}`).join("; ");
  return String(value);
}

export function rulesFieldLabel(field: string, t: Translate): string {
  return t(`global.rules.fields.${field}`, { defaultValue: words(field) });
}

export function rulesValueText(field: string, value: unknown, t: Translate, language: string): string {
  // Revised entry: absent before SM Global set it (the default applied).
  if (value === undefined || value === null) return t("entry.rules.flow.default_value");
  switch (field) {
    case "meeting_hours": {
      if (!isRecord(value)) return genericText(value, t);
      const h = value as unknown as MeetingHours & { weekdays?: number[] };
      const hours = t("calendar.rules.value", { start: h.start, end: h.end, zone: t(`calendar.rules.zones.${zoneKey(h.timezone)}`, { defaultValue: h.timezone }) });
      return t("global.rules.hours_value", { hours, days: weekdaysText(h.weekdays, language) });
    }
    case "equity_ranges": {
      if (!isRecord(value)) return genericText(value, t);
      const r = value as unknown as EquityRanges;
      return t("global.rules.equity_value", { owner: range(r.owner), bishop: range(r.bishop), sm: range(r.sm) });
    }
    case "opportunity_visibility":
      return t(`entry.rules.flow.visibility_${String(value)}`);
    case "require_expansion_meeting":
    case "nda_auto_signed_by_sm":
      return t(value ? "entry.rules.flow.yes" : "entry.rules.flow.no");
    case "oa_waiting_days":
    case "document_review_days":
    case "area_amber_days":
      return t("global.rules.days", { count: Number(value) });
    case "assessment_area_map":
      return t("entry.rules.map_history");
    case "eligibility":
      return formatUsd(Number((value as EligibilityRules).min_annual_revenue), language);
    case "intake_help_text":
      return String(value);
    case "sm_entities": {
      const e = value as SmEntities;
      const names = t("entry_contracts.entities.value", { corporate: e.corporate?.name ?? "", sm_square: e.sm_square?.name ?? "" });
      const mode = e.sm_square?.signer_mode;
      return mode ? `${names} · ${t(mode === "office_holder" ? "entry_contracts.signers_rule.mode_office_holder" : "entry_contracts.signers_rule.mode_global_short")}` : names;
    }
    case "contracts":
      return t(`contracts_lang.rules.option_${(value as { governing_language?: string }).governing_language === "es" ? "es" : "en"}`);
    case "program_amount":
      return formatUsd(Number(value), language);
    case "intake_documents":
      return Array.isArray(value) ? t("intake.rules.count", { count: (value as IntakeDocRule[]).filter((d) => !d.archived).length }) : genericText(value, t);
    case "required_task_codes":
      return Array.isArray(value) && value.length ? value.join(", ") : t("global.rules.required_none");
    case "franchisability_goal":
      return t("global.rules.percent", { value });
    case "franchisability_amber_tolerance":
      return typeof value === "number" ? t("global.rules.points", { count: value }) : genericText(value, t);
    default:
      return genericText(value, t);
  }
}
