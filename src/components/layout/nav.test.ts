import { describe, expect, it } from "vitest";
import { bishopNav, franchiseeNav, franchisorNav, navFor, ownerNav, smGlobalNav, smNav } from "./nav";

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe("menu per role", () => {
  it("SM Global: Inicio, Estructura, Oficinas, Embudo, Catálogo, Reglas, Personas", () => {
    expect(navFor("sm_global")).toBe(smGlobalNav);
    expect(keys(smGlobalNav)).toEqual(["home", "structure", "offices", "global_pipeline", "global_catalog", "rules", "people"]);
    expect(smGlobalNav.map((i) => i.to)).toEqual(["/", "/estructura", "/oficinas", "/embudo", "/catalogo", "/reglas", "/personas"]);
  });
  it("owner of a franchisor: Inicio, Mi franquiciadora, Mis franquicias, Mis números, Documentos, Mi negocio", () => {
    expect(navFor("business_owner", { franchisor: true })).toBe(franchisorNav);
    expect(keys(franchisorNav)).toEqual(["home", "franchisor", "franchises", "numbers", "documents", "business"]);
  });
  it("owner still in the program keeps the existing menu", () => {
    expect(navFor("business_owner")).toBe(ownerNav);
    expect(navFor("business_owner", { franchisor: false })).toBe(ownerNav);
    expect(keys(ownerNav)).toContain("tasks");
  });
  it("Bishop: Mi portafolio (home), Oportunidades, Acuerdos", () => {
    expect(navFor("bishop")).toBe(bishopNav);
    expect(keys(bishopNav)).toEqual(["portfolio", "opportunities", "agreements"]);
    expect(bishopNav[0]!.to).toBe("/");
  });
  it("franchisee: Inicio, Manual, Pagos y reportes, Mi negocio", () => {
    expect(navFor("franchisee")).toBe(franchiseeNav);
    expect(keys(franchiseeNav)).toEqual(["home", "franchisee_manual", "payments", "franchisee_business"]);
  });
  it("SM office team is unchanged", () => {
    expect(navFor("sm_team")).toBe(smNav);
  });
});
