import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { industryLabel } from "./industry";

describe("industryLabel", () => {
  afterEach(() => void i18n.changeLanguage("es"));

  it("uses the API label in the UI language", async () => {
    const b = { industry: "construction", industry_label: "Construcción residencial", industry_label_en: "Residential construction" };
    await i18n.changeLanguage("es");
    expect(industryLabel(b, i18n)).toBe("Construcción residencial");
    await i18n.changeLanguage("en");
    expect(industryLabel(b, i18n)).toBe("Residential construction");
  });

  it("without label translates the catalog key and never shows it raw", async () => {
    await i18n.changeLanguage("es");
    expect(industryLabel({ industry: "cleaning" }, i18n)).toBe("Limpieza");
  });

  it("keeps a readable industry of older rows", () => {
    expect(industryLabel({ industry: "Techos y remodelaciones" }, i18n)).toBe("Techos y remodelaciones");
  });
});
