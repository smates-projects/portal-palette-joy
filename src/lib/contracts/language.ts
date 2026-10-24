// Bilingual contracts (Round B): every contract is written in Spanish and English. The readers show one language at a
// time with an "ES | EN" toggle that starts in the app language; a contract without its English version (sent before
// Round B) is read in Spanish. Once every party signed, the API seals one PDF per language (sealed_files) and answers
// a presigned link for each. Pure helpers shared by the readers, the mock and the tests.
import type { Contract, ContractExplainer, ContractLanguage, SealedFile } from "@/lib/api/types";

export const CONTRACT_LANGUAGES: readonly ContractLanguage[] = ["es", "en"];

/** The version that prevails when the platform rules say nothing (the API's default too). */
export const DEFAULT_GOVERNING_LANGUAGE: ContractLanguage = "en";

export const isContractLanguage = (value: unknown): value is ContractLanguage => value === "es" || value === "en";

/** The contract language that matches the app language ("en-US" reads English; anything else, Spanish). */
export const contractLanguageOf = (appLanguage: string | null | undefined): ContractLanguage =>
  appLanguage?.toLowerCase().startsWith("en") ? "en" : "es";

/**
 * The API's download of one sealed copy (the path of Contract.sealed_files.<lang>.download_url: a short-lived redirect
 * for the contract's parties), on the API's origin. The "Contrato firmado" email's /contratos/$id page opens it.
 */
export const sealedCopyUrl = (contractId: string, language: ContractLanguage, apiBase: string): string =>
  new URL(`/api/v1/contracts/${encodeURIComponent(contractId)}/sealed-files?lang=${language}`, apiBase).toString();

type Readable = Pick<Contract, "body" | "text" | "explainer" | "explainers">;

const filled = (value: string | null | undefined): string | null => (value?.trim() ? value : null);

/** The Spanish full text: text.es, or the older body field. */
const spanishText = (c: Readable) => filled(c.text?.es) ?? filled(c.body);

export interface ContractReading<T> {
  /** What to show; null when the contract has no text (or no explainer) in either language. */
  value: T | null;
  /** The language of `value` (Spanish when English was asked for and is missing). */
  language: ContractLanguage;
  /** English was asked for but the contract has no English version: `value` is the Spanish one. */
  fallback: boolean;
}

/** The full text in the chosen language, falling back to Spanish (text.es, then body) when English is missing. */
export function contractTextIn(c: Readable, language: ContractLanguage): ContractReading<string> {
  const es = spanishText(c);
  if (language === "en") {
    const en = filled(c.text?.en);
    if (en) return { value: en, language: "en", fallback: false };
    return { value: es, language: "es", fallback: es !== null };
  }
  return { value: es, language: "es", fallback: false };
}

/** The plain-words window in the chosen language, falling back to Spanish (explainers.es, then explainer). */
export function contractExplainerIn(c: Readable, language: ContractLanguage): ContractReading<ContractExplainer> {
  const es = c.explainers?.es ?? c.explainer ?? null;
  if (language === "en") {
    const en = c.explainers?.en ?? null;
    if (en) return { value: en, language: "en", fallback: false };
    return { value: es, language: "es", fallback: es !== null };
  }
  return { value: es, language: "es", fallback: false };
}

/** The contract has a full text to read, in any language (the "Leer el ... completo" links). */
export const hasContractText = (c: Readable) => spanishText(c) !== null || filled(c.text?.en) !== null;

/** The contract has a plain-words window in some language (the explainer card shows only then). */
export const hasContractExplainer = (c: Readable) => !!(c.explainers?.es ?? c.explainers?.en ?? c.explainer);

/** The contract has an English version of its text or of its explainer. */
export const hasEnglishVersion = (c: Readable) => filled(c.text?.en) !== null || !!c.explainers?.en;

/** The version that prevails, as the contract says; null on contracts older than the bilingual ones. */
export const governingLanguageOf = (c: Pick<Contract, "language_governing">): ContractLanguage | null =>
  isContractLanguage(c.language_governing) ? c.language_governing : null;

export interface SealedCopy extends SealedFile {
  language: ContractLanguage;
}

/**
 * The sealed PDF copies to download, Spanish first. Only the ones with a link: the API seals them after the last
 * signature, and a contract without an English text gets only the Spanish copy.
 */
export function sealedCopiesOf(c: Pick<Contract, "sealed_files">): SealedCopy[] {
  const files = c.sealed_files;
  if (!files) return [];
  return CONTRACT_LANGUAGES.flatMap((language) => {
    const file = files[language];
    return file?.download_url ? [{ language, file_id: file.file_id, download_url: file.download_url }] : [];
  });
}
