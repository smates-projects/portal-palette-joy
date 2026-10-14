import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import { bishopNav, franchiseeNav, franchisorNav, smGlobalNav } from "@/components/layout/nav";
import { formatNumber, formatUsd, localeTag } from "./format";

describe("formatting", () => {
  it("uses es-US for Spanish and en-US for English", () => {
    expect(localeTag("es")).toBe("es-US");
    expect(localeTag("en")).toBe("en-US");
    expect(formatUsd(3760, "es")).toContain("3,760");
    expect(formatNumber(1234.5, "es", { maximumFractionDigits: 1 })).toBe("1,234.5");
  });
});

type Dict = Record<string, unknown>;
const get = (obj: Dict, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], obj);

describe("i18n", () => {
  it("has the four feature namespaces as separate top-level keys in both languages", () => {
    for (const dict of [es, en] as Dict[]) for (const ns of ["global", "owner_extra", "bishop", "franchisee"]) expect(dict).toHaveProperty(ns);
  });
  it("every new menu entry has a label and a page title in both languages", () => {
    for (const item of [...smGlobalNav, ...franchisorNav, ...bishopNav, ...franchiseeNav]) {
      for (const dict of [es, en] as Dict[]) {
        expect(get(dict, `nav.${item.key}`), `nav.${item.key}`).toBeTypeOf("string");
        expect(get(dict, `pages.${item.key}.title`), `pages.${item.key}.title`).toBeTypeOf("string");
      }
    }
  });
  it("the Spanish copy has no voseo", () => {
    expect(JSON.stringify(es)).not.toMatch(/\b(Vos|vos|Tenés|tenés|Podés|podés|enviás|Pedile|trabajás)\b/);
  });
});
