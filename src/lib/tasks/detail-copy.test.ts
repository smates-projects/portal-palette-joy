import { describe, expect, it } from "vitest";
import es from "../../locales/es.json";
import en from "../../locales/en.json";
import { taskEmptyState, taskViewer } from "./detail-copy";

const names = { ownerFirst: "Rosa", firmName: "Estudio Pérez" };
const lookup = (dict: unknown, key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);

describe("task detail empty states by viewer", () => {
  it("the firm reads about the owner, the owner about the firm, Strategic Mates a neutral line", () => {
    expect(taskViewer("partner_firm")).toBe("firm");
    expect(taskViewer("business_owner")).toBe("owner");
    expect(taskViewer("sm_team")).toBe("neutral");
    expect(taskViewer("sm_global")).toBe("neutral");
    expect(taskEmptyState("partner_firm", "versions", names)).toEqual({ key: "taskDetail.no_versions", name: "Rosa" });
    expect(taskEmptyState("business_owner", "versions", names)).toEqual({ key: "taskDetail.no_versions_owner", name: "Estudio Pérez" });
    expect(taskEmptyState("business_owner", "requests", names)).toEqual({ key: "taskDetail.requests_empty_owner", name: "Estudio Pérez" });
    expect(taskEmptyState("business_owner", "meetings", names)).toEqual({ key: "taskDetail.meetings_empty_owner", name: "Estudio Pérez" });
    expect(taskEmptyState("sm_team", "meetings", names)).toEqual({ key: "taskDetail.meetings_empty_neutral", name: "" });
  });

  it("without the firm's name the owner reads 'la firma'", () => {
    expect(taskEmptyState("business_owner", "versions", { ownerFirst: "Rosa", firmName: " " }).key).toBe("taskDetail.no_versions_owner_nofirm");
    expect(taskEmptyState("business_owner", "meetings", { ownerFirst: "Rosa", firmName: "" }).key).toBe("taskDetail.meetings_empty_owner_nofirm");
  });

  it("every key exists in Spanish and English, and the owner's copy never speaks to the firm", () => {
    const roles = ["partner_firm", "business_owner", "sm_team"] as const;
    const sections = ["versions", "requests", "meetings"] as const;
    for (const role of roles)
      for (const section of sections)
        for (const firmName of ["Estudio Pérez", ""]) {
          const { key } = taskEmptyState(role, section, { ownerFirst: "Rosa", firmName });
          expect(typeof lookup(es, key), key).toBe("string");
          expect(typeof lookup(en, key), key).toBe("string");
        }
    expect(lookup(es, "taskDetail.no_versions_owner")).toBe("{{name}} todavía no envió ninguna entrega. Cuando la envíe, la revisas aquí.");
    expect(lookup(es, "taskDetail.requests_empty_owner")).toBe("La firma no te pidió nada todavía.");
    expect(lookup(es, "taskDetail.meetings_empty_owner")).toBe("No hay reuniones. Si necesitas hablar con {{name}}, agenda una.");
  });
});
