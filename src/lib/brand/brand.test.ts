import { describe, expect, it } from "vitest";
import type { BusinessBrand } from "@/lib/api/types";
import { checkAccent, checkPrimary, contrastRatio, darken, hoverOf, isHex } from "./contrast";
import { brandFileNames, detectBrandFromManual } from "./detect";
import { brandBusinessIdFor, brandFor, canReadBrand, canResetBrand, canSetBrand } from "./scope";

describe("contrast AA", () => {
  it("measures the ratio against white and accepts the SM blue", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(checkPrimary("#153f58").ok).toBe(true);
    expect(checkPrimary("#153f58").ratio).toBeGreaterThan(4.5);
  });
  it("proposes a darker tone when the primary does not reach 4.5:1 with white text", () => {
    const check = checkPrimary("#7fb3d5");
    expect(check.ok).toBe(false);
    expect(check.suggestion).not.toBe("#7fb3d5");
    expect(contrastRatio(check.suggestion, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(isHex(check.suggestion)).toBe(true);
  });
  it("accent needs 3:1 as an indicator; the SM gold and a pale yellow differ", () => {
    expect(checkAccent("#a77e00").ok).toBe(true);
    const pale = checkAccent("#ffe9a8");
    expect(pale.ok).toBe(false);
    expect(contrastRatio(pale.suggestion, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
  it("hover is a darker tone of the same color", () => {
    expect(contrastRatio(hoverOf("#1f4e3d"), "#ffffff")).toBeGreaterThan(contrastRatio("#1f4e3d", "#ffffff"));
    expect(darken("#ffffff", 0.5)).toBe("#808080");
  });
});

describe("simulated reading of the manual", () => {
  it("is stable for the same business and keeps the uploaded file names", () => {
    const a = detectBrandFromManual("Vossler", "manual.pdf", "logo.png");
    const b = detectBrandFromManual("Vossler", "manual.pdf", "logo.png");
    expect(a).toEqual(b);
    expect(a.manual_file_name).toBe("manual.pdf");
    expect(a.logo_file_name).toBe("logo.png");
    expect(isHex(a.primary_color) && isHex(a.accent_color)).toBe(true);
    expect(brandFileNames("Bimbo Remodelaciones")).toEqual({ manual: "Bimbo_Remodelaciones_manual_de_marca.pdf", logo: "Bimbo_Remodelaciones_logo.png" });
  });
});

const brand: BusinessBrand = { business_id: "bimbo", primary_color: "#1f4e3d", accent_color: "#d9a441", font_family: null, logo_file_name: null, logo_url: null, source: "b5_13", version: 1, applied_at: "2026-10-10T11:20:00Z", applied_by_user_id: null, manual_file_name: null };
const franchises = [{ id: "unit-1", franchisor_business_id: "bimbo" }, { id: "unit-2", franchisor_business_id: "other" }];
const business = { id: "bimbo", office_id: "miami", owner_user_id: "rodrigo" };

describe("who sees the brand", () => {
  it("the owner and the team see their business brand; a franchise inherits the franchisor's", () => {
    expect(brandFor({ role: "business_owner", business_id: "bimbo", organization_id: null }, [brand], franchises)).toEqual(brand);
    expect(brandFor({ role: "franchisee", business_id: null, organization_id: "unit-1" }, [brand], franchises)).toEqual(brand);
    expect(brandBusinessIdFor({ role: "franchisee", business_id: null, organization_id: "unit-2" }, franchises)).toBe("other");
  });
  it("SM, firms and Bishops keep the Strategic Mates brand", () => {
    for (const role of ["sm_global", "sm_team", "partner_firm", "bishop"] as const)
      expect(brandFor({ role, business_id: null, organization_id: "x" }, [brand], franchises)).toBeNull();
  });
  it("read scope: owner, franchise, office SM and Global; never a firm or another office", () => {
    expect(canReadBrand({ role: "business_owner", business_id: "bimbo", organization_id: null }, business, franchises)).toBe(true);
    expect(canReadBrand({ role: "franchisee", business_id: null, organization_id: "unit-1" }, business, franchises)).toBe(true);
    expect(canReadBrand({ role: "sm_team", business_id: null, organization_id: "miami" }, business, franchises)).toBe(true);
    expect(canReadBrand({ role: "sm_team", business_id: null, organization_id: "orlando" }, business, franchises)).toBe(false);
    expect(canReadBrand({ role: "sm_global", business_id: null, organization_id: "global" }, business, franchises)).toBe(true);
    expect(canReadBrand({ role: "partner_firm", business_id: null, organization_id: "perez" }, business, franchises)).toBe(false);
    expect(canReadBrand({ role: "business_owner", business_id: "vossler", organization_id: null }, business, franchises)).toBe(false);
  });
  it("only SM loads it by hand; the owner in charge or SM resets it; a franchise never edits it", () => {
    expect(canSetBrand({ role: "sm_team", organization_id: "miami" }, business)).toBe(true);
    expect(canSetBrand({ role: "business_owner", organization_id: null }, business)).toBe(false);
    expect(canResetBrand({ id: "rodrigo", role: "business_owner", organization_id: null }, business)).toBe(true);
    expect(canResetBrand({ id: "staff", role: "business_owner", organization_id: null }, business)).toBe(false);
    expect(canResetBrand({ id: "luisa", role: "franchisee", organization_id: "unit-1" }, business)).toBe(false);
  });
});
