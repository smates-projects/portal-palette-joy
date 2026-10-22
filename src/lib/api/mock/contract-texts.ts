// Texts of the entry contracts in the mock: the plain-words window above the signer (explainer) and the full text
// the document dialog shows (body). They come from the default entry contract rules, which carry Strategic Mates'
// own documents (lib/leads/contract-templates); the real API sends its own in the same shape. Every contract is
// bilingual (text, explainers): the English version exists while the rule keeps the default Spanish text, as in the
// API, and both end with the governing language clause. Once every party signed, the mock "seals" two fake PDFs.
import { DEFAULT_ENTRY_CONTRACT_RULES, defaultRule, fillContractTemplate, type ContractTemplatePlaceholder } from "@/lib/leads/contract-rules";
import { BINDING_TEMPLATE_EN, DEFAULT_EXPLAINERS_EN, MOU_TEMPLATE_EN, NDA_TEMPLATE_EN, OPERATING_AGREEMENT_TEMPLATE_EN } from "@/lib/leads/contract-templates-en";
import { DEFAULT_GOVERNING_LANGUAGE } from "@/lib/contracts/language";
import type { Contract, ContractExplainer, ContractKind, ContractLanguage, PlatformRules } from "../types";

const explainerOf = (code: string): ContractExplainer => structuredClone(defaultRule(code)!.explainer);

/** Strategic Mates' NDA: already signed by Strategic Mates, the owner signs. */
export const NDA_EXPLAINER: ContractExplainer = explainerOf("nda");

type Values = Partial<Record<ContractTemplatePlaceholder, string | number | null | undefined>>;

export const ndaBody = (businessName: string, ownerName: string, values: Values = {}) =>
  fillContractTemplate(defaultRule("nda")!.template, { business_name: businessName, owner_name: ownerName, ...values });

/** The MOU: the four points in plain words come after this window, each one with its own "Entendí". */
export const MOU_EXPLAINER: ContractExplainer = explainerOf("mou");

export const mouBody = (businessName: string, ownerName: string, values: Values = {}) =>
  fillContractTemplate(defaultRule("mou")!.template, { business_name: businessName, owner_name: ownerName, ...values });

// ---------- Bilingual contracts ----------

const ENGLISH_TEMPLATES: Partial<Record<ContractKind, string>> = {
  nda: NDA_TEMPLATE_EN, mou: MOU_TEMPLATE_EN, binding: BINDING_TEMPLATE_EN, tripartite: OPERATING_AGREEMENT_TEMPLATE_EN,
};

const defaultOfKind = (kind: ContractKind | undefined) => DEFAULT_ENTRY_CONTRACT_RULES.find((r) => r.kind === kind);

/** The default Spanish text of a kind (the NDA and the MOU when no rule is active). */
export const defaultTemplateOf = (kind: ContractKind) => defaultOfKind(kind)?.template ?? "";

/** The governing language clause every text ends with (the API's wording; SM's lawyer must approve it). */
const GOVERNING_CLAUSE: Record<ContractLanguage, (governing: ContractLanguage) => string> = {
  es: (g) => `Este documento se firma en español y en inglés. Si hay diferencias, prevalece la versión en ${g === "es" ? "español" : "inglés"}.`,
  en: (g) => `This document is signed in Spanish and in English. In the event of any discrepancy, the ${g === "es" ? "Spanish" : "English"} version prevails.`,
};

export const governingLanguageOfRules = (rules: Pick<PlatformRules, "contracts"> | null | undefined): ContractLanguage =>
  rules?.contracts?.governing_language ?? DEFAULT_GOVERNING_LANGUAGE;

/**
 * The text and window of a new contract in both languages, plus the older Spanish fields (body, explainer). English
 * only while the rule keeps the default Spanish text (or window): an edited one has no translation yet.
 */
export function bilingualContract(
  kind: ContractKind | undefined,
  spanish: { template: string; explainer: ContractExplainer },
  values: Values,
  governing: ContractLanguage,
): Pick<Contract, "body" | "explainer" | "text" | "explainers" | "language_governing"> {
  const seed = defaultOfKind(kind);
  const englishTemplate = kind && seed && seed.template === spanish.template ? ENGLISH_TEMPLATES[kind] : undefined;
  const englishExplainer = kind && seed && JSON.stringify(seed.explainer) === JSON.stringify(spanish.explainer)
    ? DEFAULT_EXPLAINERS_EN[kind as keyof typeof DEFAULT_EXPLAINERS_EN] : undefined;
  const es = `${fillContractTemplate(spanish.template, values).trimEnd()}\n\n${GOVERNING_CLAUSE.es(governing)}`;
  const en = englishTemplate ? `${fillContractTemplate(englishTemplate, values).trimEnd()}\n\n${GOVERNING_CLAUSE.en(governing)}` : null;
  const explainer = structuredClone(spanish.explainer);
  return {
    body: es,
    explainer,
    text: { es, en },
    explainers: { es: structuredClone(explainer), en: englishExplainer ? structuredClone(englishExplainer) : null },
    language_governing: governing,
  };
}

/** Fake storage of the sealed copies: the demo has no real PDF (the screens say so instead of opening it). */
export const MOCK_SEALED_ORIGIN = "https://sealed.mock.strategicmates.local";

/**
 * After the last signature: one sealed copy per language the contract has (Spanish always, English when it has its
 * text), each with a fake file id and a fake presigned link. Once sealed it stays sealed.
 */
export function sealIfSigned(c: Contract): Contract {
  if (c.state !== "signed" || c.sealed_files) return c;
  const copy = (language: ContractLanguage) => ({
    file_id: `${c.id.slice(0, 24)}${language === "es" ? "5ea1ed0000e5" : "5ea1ed0000e6"}`,
    download_url: `${MOCK_SEALED_ORIGIN}/contracts/${c.id}/${language}.pdf?X-Amz-Expires=900`,
  });
  c.sealed_files = { es: copy("es"), en: c.text?.en ? copy("en") : null };
  return c;
}
