import { describe, expect, it } from "vitest";
import type { Contract } from "@/lib/api/types";
import {
  contractExplainerIn,
  contractLanguageOf,
  contractTextIn,
  governingLanguageOf,
  hasContractText,
  hasEnglishVersion,
  sealedCopiesOf,
  sealedCopyUrl,
} from "./language";

const ES = { title: "Qué es el NDA", paragraphs: ["Es un acuerdo."], bullets: ["Cuida tu información."] };
const EN = { title: "What the NDA is", paragraphs: ["It is an agreement."], bullets: ["It protects your information."] };

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: "c1",
  business_id: "b1",
  area: "intake",
  kind: "nda",
  name: "NDA",
  state: "sent",
  sent_at: "2026-10-20",
  signed_at: null,
  signers: [],
  ...overrides,
});

describe("contract language", () => {
  it("starts in the app language: English for en and en-US, Spanish for anything else", () => {
    expect(contractLanguageOf("en")).toBe("en");
    expect(contractLanguageOf("en-US")).toBe("en");
    expect(contractLanguageOf("es")).toBe("es");
    expect(contractLanguageOf(undefined)).toBe("es");
  });

  it("reads text.es or text.en as chosen", () => {
    const c = contract({ text: { es: "ACUERDO", en: "AGREEMENT" }, body: "ACUERDO" });
    expect(contractTextIn(c, "es")).toEqual({ value: "ACUERDO", language: "es", fallback: false });
    expect(contractTextIn(c, "en")).toEqual({ value: "AGREEMENT", language: "en", fallback: false });
    expect(hasEnglishVersion(c)).toBe(true);
  });

  it("falls back to Spanish when the English text is missing (older contracts), and says so", () => {
    expect(contractTextIn(contract({ text: { es: "ACUERDO", en: null } }), "en")).toEqual({ value: "ACUERDO", language: "es", fallback: true });
    // Only the older body field: the Spanish text.
    expect(contractTextIn(contract({ body: "ACUERDO" }), "en")).toEqual({ value: "ACUERDO", language: "es", fallback: true });
    expect(contractTextIn(contract({ text: { es: "ACUERDO", en: "  " } }), "en").fallback).toBe(true);
    expect(hasEnglishVersion(contract({ body: "ACUERDO" }))).toBe(false);
  });

  it("a contract without text has nothing to read in either language, and no fallback note", () => {
    expect(contractTextIn(contract(), "en")).toEqual({ value: null, language: "es", fallback: false });
    expect(hasContractText(contract())).toBe(false);
    expect(hasContractText(contract({ body: "ACUERDO" }))).toBe(true);
    expect(hasContractText(contract({ text: { es: "ACUERDO", en: null } }))).toBe(true);
  });

  it("the explainers follow the same choice, falling back to explainers.es and then the older explainer", () => {
    const both = contract({ explainers: { es: ES, en: EN }, explainer: ES });
    expect(contractExplainerIn(both, "en")).toEqual({ value: EN, language: "en", fallback: false });
    expect(contractExplainerIn(both, "es").value).toEqual(ES);
    expect(contractExplainerIn(contract({ explainers: { es: ES, en: null } }), "en")).toEqual({ value: ES, language: "es", fallback: true });
    expect(contractExplainerIn(contract({ explainer: ES }), "en")).toEqual({ value: ES, language: "es", fallback: true });
    expect(contractExplainerIn(contract(), "en").value).toBeNull();
  });

  it("the governing language comes from the contract; absent on older ones", () => {
    expect(governingLanguageOf(contract({ language_governing: "en" }))).toBe("en");
    expect(governingLanguageOf(contract({ language_governing: "es" }))).toBe("es");
    expect(governingLanguageOf(contract())).toBeNull();
  });

  it("the sealed copies: Spanish first, only the ones with a link, none before the last signature", () => {
    const es = { file_id: "f-es", download_url: "https://storage.test/es.pdf" };
    const en = { file_id: "f-en", download_url: "https://storage.test/en.pdf" };
    expect(sealedCopiesOf(contract({ sealed_files: { en, es } }))).toEqual([
      { language: "es", ...es },
      { language: "en", ...en },
    ]);
    expect(sealedCopiesOf(contract({ sealed_files: { es, en: null } }))).toEqual([{ language: "es", ...es }]);
    expect(sealedCopiesOf(contract({ sealed_files: null }))).toEqual([]);
    expect(sealedCopiesOf(contract())).toEqual([]);
  });

  it("sealedCopyUrl is the API's download of one copy, on the API's origin", () => {
    expect(sealedCopyUrl("c-1", "en", "https://app.example.com/api/v1")).toBe(
      "https://app.example.com/api/v1/contracts/c-1/sealed-files?lang=en",
    );
    expect(sealedCopyUrl("a/b", "es", "http://localhost:3100/api/v1")).toBe(
      "http://localhost:3100/api/v1/contracts/a%2Fb/sealed-files?lang=es",
    );
  });
});
