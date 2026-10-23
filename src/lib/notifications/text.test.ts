import { describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { NOTIFICATION_KINDS, type AppNotification } from "@/lib/api/types";
import { isRetiredKind, notificationText, preferenceLabel } from "./text";

const base = (overrides: Partial<AppNotification>): AppNotification => ({
  id: "n", user_id: "u", kind: "contract_signed", task_id: "", task_code: "", task_name: "", business_id: "", business_name: "",
  actor_user_id: null, actor_name: null, created_at: "2026-10-21T12:00:00Z", read_at: null, ...overrides,
});
const tools = { language: "es", exists: (key: string) => i18n.exists(key) };
const text = (n: AppNotification, language = "es") => notificationText(n, (k, v) => i18n.t(k, { ...v, lng: language }), { ...tools, language });

describe("notificationText", () => {
  it("the API's title wins in Spanish; the locale text is the English", () => {
    const n = base({ title: "Vossler. Firmaron el NDA", business_name: "Vossler", contract_name: "NDA" });
    expect(text(n)).toBe("Vossler. Firmaron el NDA");
    expect(text(n, "en")).toBe("Vossler. The NDA was signed");
  });

  it("a signed framework agreement without a business never starts with a dot and names the agreement", () => {
    const n = base({ kind: "contract_signed", business_name: "", contract_name: null });
    expect(text(n)).toBe("Firmaron el Acuerdo marco");
    expect(text(base({ kind: "contract_sent", business_name: "", contract_name: "Acuerdo marco" }))).toBe("Tienes el Acuerdo marco para firmar");
  });

  it("every kind renders without a dangling 'de' or an empty name when the payload is empty", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const line = text(base({ kind }));
      expect(line, kind).not.toMatch(/^[\s.,]/);
      expect(line, kind).not.toMatch(/\bde\s*$|\bde\s*\(|\(\)|\bel\s*$|\bpara\s*$/);
      expect(line, kind).not.toContain("{{");
    }
  });

  it("preferences: every known kind has its label; an unknown one reads as words, never a raw key (QA M5)", () => {
    const label = (kind: string, language = "es") => preferenceLabel(kind, (k, v) => i18n.t(k, { ...v, lng: language }), (k) => i18n.exists(k));
    expect(isRetiredKind("owner_nda_received")).toBe(true);
    for (const kind of ["contract_due_soon", "document_not_applicable", ...NOTIFICATION_KINDS]) {
      expect(label(kind), kind).not.toMatch(/notifications\.|pref_/);
      expect(label(kind, "en"), kind).not.toMatch(/notifications\.|pref_/);
    }
    expect(label("contract_due_soon")).toBe("El plazo para firmar un contrato está cerca");
    expect(label("brand_new_kind")).toBe("Otros avisos (Brand new kind)");
  });

  it("a person without a name reads as Strategic Mates, an owner without a name as the owner", () => {
    expect(text(base({ kind: "changes_requested" }))).toBe("Strategic Mates te pidió cambios");
    expect(text(base({ kind: "meeting_booked", meeting_at: "2026-10-22T15:00:00Z" }))).toMatch(/^El dueño agendó reunión para el /);
  });
});
