import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import { bishopNav, franchiseeNav, franchisorNav, smGlobalNav } from "@/components/layout/nav";
import { formatDate, formatDateTime, formatNumber, formatShortDate, formatTime, formatUsd, formatWeekdayDate, localeTag, oneFinalPeriod } from "./format";

describe("formatting", () => {
  it("a deadline day reads with its weekday, the US date and no time-zone shift (QA B12)", () => {
    expect(formatWeekdayDate("2026-10-18", "es")).toBe("domingo 10/18/2026");
    expect(formatWeekdayDate("2026-10-18", "en")).toBe("Sunday 10/18/2026");
  });
  it("Bajas of the QA: the dialog X, one report, the band of SM's Embudo (QA B1, B3, B6)", () => {
    expect(es.app.close).toBe("Cerrar");
    expect(en.app.close).toBe("Close");
    expect(es.owner_extra.franchisor_home.reports_due_one).toBe("Hay {{count}} reporte por entregar.");
    expect(es.pipeline.bands.track).toBe("En camino");
  });
  it("a sentence ending in p.m. keeps one period", () => {
    expect(oneFinalPeriod("Reunión hecha. Lo marcaste el mié 10/14, 03:00 p.m..")).toBe("Reunión hecha. Lo marcaste el mié 10/14, 03:00 p.m.");
    expect(oneFinalPeriod("Listo.")).toBe("Listo.");
  });
  it("uses es-US for Spanish and en-US for English", () => {
    expect(localeTag("es")).toBe("es-US");
    expect(localeTag("en")).toBe("en-US");
    expect(formatUsd(3760, "es")).toContain("3,760");
    expect(formatNumber(1234.5, "es", { maximumFractionDigits: 1 })).toBe("1,234.5");
  });

  it("writes every date the US way (month, day, year) in both languages", () => {
    expect(formatDate("2026-10-14", "es")).toBe("10/14/2026");
    expect(formatDate("2026-10-14", "en")).toBe("10/14/2026");
    expect(formatDate("2026-01-05T15:00:00Z", "es")).toMatch(/^01\/0[45]\/2026$/);
    expect(formatShortDate("2026-10-14", "es")).toBe("10/14");
    const when = formatDateTime("2026-10-14T15:00:00Z", "es");
    expect(when).toMatch(/10\/1[45], /);
    expect(when).not.toMatch(/oct/i);
  });

  it("formats the hour alone in the viewer's language", () => {
    expect(formatTime("2026-10-14T15:30:00Z", "es")).toMatch(/\d{1,2}:\d{2}/);
    expect(formatTime("2026-10-14T15:30:00Z", "en")).toMatch(/\d{1,2}:\d{2}/);
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
