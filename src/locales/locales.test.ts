import { describe, expect, it } from "vitest";
import en from "./en.json";
import es from "./es.json";
import { NOTIFICATION_KINDS } from "@/lib/api/types";

/** Dotted path of every text in a locale file. */
function keysOf(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => keysOf(value, prefix ? `${prefix}.${key}` : key));
}
function textsOf(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node === null || typeof node !== "object") return [];
  return Object.values(node as Record<string, unknown>).flatMap(textsOf);
}

describe("locales", () => {
  it("English has every key Spanish has, and the other way round", () => {
    const spanish = new Set(keysOf(es));
    const english = new Set(keysOf(en));
    expect([...spanish].filter((k) => !english.has(k))).toEqual([]);
    expect([...english].filter((k) => !spanish.has(k))).toEqual([]);
  });

  it("Spanish uses the neutral tú: no voseo", () => {
    // Voseo imperatives and verb forms (hacé, tenés, podés, mirá, subí) and the pronoun "vos".
    const voseo = /\bvos\b|\b(hacé|mirá|subí|tenés|podés|querés|sabés|elegí|escribí|agregá|revisá|completá|cargá|enviá|confirmá|decí|fijate|andá|vení|poné|seguí|volvé|salí|pedí|abrí|cerrá|buscá|usá|probá|esperá|guardá|editá|eliminá|descargá|creá|asigná)\b/i;
    expect(textsOf(es).filter((text) => voseo.test(text))).toEqual([]);
  });

  it("Spanish says provisional, never provisorio", () => {
    expect(textsOf(es).filter((text) => /provisori/i.test(text))).toEqual([]);
  });

  it("every notification kind has its bell text and its preference label in both languages", () => {
    const missing = (locale: { notifications: Record<string, unknown> }) =>
      NOTIFICATION_KINDS.flatMap((kind) => [`kind_${kind}`, `pref_${kind}`]).filter((key) => typeof locale.notifications[key] !== "string");
    expect(missing(es)).toEqual([]);
    expect(missing(en)).toEqual([]);
  });

  it("the signed contract names the contract and the business from the payload", () => {
    expect(es.notifications.kind_contract_signed).toContain("{{contract_name}}");
    expect(es.notifications.kind_contract_signed).toContain("{{business_name}}");
    expect(en.notifications.kind_contract_signed).toContain("{{contract_name}}");
    expect(en.notifications.kind_contract_signed).toContain("{{business_name}}");
  });

  it("the payment receipt is stored, not only its name", () => {
    expect(es.funds.form.receipt_hint).not.toMatch(/nombre del archivo/i);
    expect(en.funds.form.receipt_hint).not.toMatch(/file name/i);
  });
});
