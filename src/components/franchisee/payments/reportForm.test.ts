import { describe, expect, it } from "vitest";
import { parseSales, validateSales } from "./reportForm";

describe("parseSales", () => {
  it("reads plain numbers, thousands separators and a dollar sign", () => {
    expect(parseSales("12500")).toBe(12500);
    expect(parseSales("$12,500.50")).toBe(12500.5);
    expect(parseSales(" 12 500 ")).toBe(12500);
    expect(parseSales(".5")).toBe(0.5);
  });

  it("rejects text, empty values and negatives", () => {
    expect(parseSales("")).toBeNull();
    expect(parseSales("abc")).toBeNull();
    expect(parseSales("12.5.3")).toBeNull();
    expect(parseSales("-100")).toBeNull();
  });
});

describe("validateSales", () => {
  it("accepts a normal amount", () => {
    expect(validateSales("45,000")).toBeNull();
  });

  it("reports each problem with its own code", () => {
    expect(validateSales("  ")).toBe("required");
    expect(validateSales("doce")).toBe("invalid");
    expect(validateSales("0")).toBe("not_positive");
    // The limit is the API's (max_monthly_sales); without it only the API checks it.
    expect(validateSales("5000001", 5_000_000)).toBe("too_large");
    expect(validateSales("5000001")).toBeNull();
  });
});
