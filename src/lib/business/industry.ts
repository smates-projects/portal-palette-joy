import type { i18n as I18n } from "i18next";

interface WithIndustry {
  industry: string;
  industry_label?: string | undefined;
  industry_label_en?: string | undefined;
}

/**
 * Readable industry of a business or profile. The API sends the label in both languages; older rows only carry the
 * industry, which is either a catalog key (pipeline.industries.*) or already a readable name. Never shows a raw key.
 */
export function industryLabel(item: WithIndustry, i18n: I18n): string {
  const english = i18n.language.startsWith("en");
  const label = english ? (item.industry_label_en ?? item.industry_label) : item.industry_label;
  if (label) return label;
  const key = `pipeline.industries.${item.industry}`;
  return i18n.exists(key) ? i18n.t(key) : item.industry;
}
