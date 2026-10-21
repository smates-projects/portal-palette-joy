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

  it("every notification kind has its bell text (title) and its preference label (body) in both languages, never empty", () => {
    const missing = (locale: { notifications: Record<string, unknown> }) =>
      NOTIFICATION_KINDS.flatMap((kind) => [`kind_${kind}`, `pref_${kind}`]).filter((key) => typeof locale.notifications[key] !== "string" || !(locale.notifications[key] as string).trim());
    expect(missing(es)).toEqual([]);
    expect(missing(en)).toEqual([]);
    expect(NOTIFICATION_KINDS).toContain("transfer_received");
    expect(NOTIFICATION_KINDS).toContain("lead_auto_discarded");
    // The fallbacks the bell fills empty names with.
    for (const locale of [es, en]) for (const key of ["actor_fallback", "owner_fallback", "framework_fallback", "contract_fallback"]) expect((locale.notifications as Record<string, unknown>)[key]).toEqual(expect.any(String));
  });

  it("the MOU ready has its texts; every text of the owner's own NDA is gone", () => {
    for (const locale of [es, en] as { notifications: Record<string, unknown> }[]) {
      expect(locale.notifications["kind_mou_ready"]).toEqual(expect.any(String));
      expect(locale.notifications["pref_mou_ready"]).toEqual(expect.any(String));
      expect(Object.keys(locale.notifications).filter((k) => k.includes("own_nda") || k.includes("owner_nda"))).toEqual([]);
      expect(keysOf(locale).filter((k) => k.includes("own_nda") || k.includes("owner_nda"))).toEqual([]);
    }
    expect(NOTIFICATION_KINDS).toContain("mou_ready");
    expect(NOTIFICATION_KINDS).not.toContain("owner_nda_received");
  });

  it("client-facing texts carry no colon and no em or en dash (times like 10:00 and URLs excepted)", () => {
    const offending = (locale: unknown) =>
      textsOf(locale).filter((text) => /[—–]/.test(text) || /:/.test(text.replace(/\d{1,2}:\d{2}/g, "").replace(/https?:\/\/\S+/g, "")));
    expect(offending(es)).toEqual([]);
    expect(offending(en)).toEqual([]);
  });

  it("the screens write no em or en dash of their own either (an empty value says Sin dato)", () => {
    const sources = import.meta.glob("/src/{components,routes}/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(Object.entries(sources).filter(([, code]) => /[—–]/.test(code)).map(([path]) => path)).toEqual([]);
  });

  it("the signature toasts name the contract with its article", () => {
    expect(es.intake.docuseal.t_signed).toBe("Firmaste el {{name}}.");
    expect(en.intake.docuseal.t_signed).toBe("You signed the {{name}}.");
  });

  it("the MOU explainer and the meeting warning say it in the agreed words", () => {
    expect(es.intake.owner.mou.when).toBe("Puedes leerlo ahora. Lo firman juntos al final de la reunión");
    expect(es.entry.outcome.mou_warning_body).toBe("El MOU no está firmado. Si marcas que la reunión se hizo, el prospecto sale del proceso");
    expect(es.entry.outcome.mou_warning_reschedule).toBe("Reagendar");
    expect(es.entry.outcome.mou_warning_confirm).toBe("Confirmar igual");
    expect(es.pipeline.actions.reactivate).toBe("Reactivar");
    expect(es.pipeline.actions.transfer).toBe("Derivar a oficina");
    expect(es.topbar.viewing).toBe("Viendo");
    expect(es.entry.rules.eligibility.min_revenue).toBe("Facturación anual mínima declarada");
  });

  it("Spanish says aquí, never acá", () => {
    expect(textsOf(es).filter((text) => /\bacá\b/i.test(text))).toEqual([]);
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
