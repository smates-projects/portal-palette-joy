import { describe, expect, it } from "vitest";
import { DEMO_EQUITY_RANGES as R, closeBlock, equityRangesError, parsePct, splitError, splitErrors, validationInputOf } from "./validation";

const split = (equity_owner: number | null, equity_bishop: number | null, equity_sm: number | null = 10) => ({ equity_owner, equity_bishop, equity_sm });

describe("split validation (the rule's ranges: 50-75 / 15-40 / SM Square 10, summing 100)", () => {
  it("accepts a split inside the ranges that adds up to 100", () => {
    expect(splitErrors(split(60, 30), R)).toEqual({});
    expect(splitErrors(split(75, 15), R)).toEqual({});
    expect(splitErrors(split(50, 40), R)).toEqual({});
    expect(splitError(split(60, 30), R, true)).toBeNull();
  });
  it("marks each percentage out of its range", () => {
    expect(splitErrors(split(80, 10), R)).toEqual({ equity_owner: "range", equity_bishop: "range" });
    expect(splitErrors(split(49, 41), R)).toEqual({ equity_owner: "range", equity_bishop: "range" });
    expect(splitErrors(split(Number.NaN, 30), R)).toEqual({ equity_owner: "range" });
  });
  it("SM Square stays at its single value", () => {
    expect(splitErrors(split(60, 25, 15), R)).toEqual({ equity_sm: "fixed" });
  });
  it("follows other ranges when the rules change", () => {
    const wider = { owner: { min: 40, max: 80 }, bishop: { min: 10, max: 50 }, sm: { min: 5, max: 15 } };
    expect(splitErrors(split(45, 45, 10), wider)).toEqual({});
    expect(splitErrors(split(45, 45, 10), R)).toEqual({ equity_owner: "range", equity_bishop: "range" });
  });
  it("in range but not adding up to 100", () => {
    expect(splitErrors(split(60, 20), R)).toEqual({ sum: "sum" });
    expect(splitError(split(60, 20), R)).toBe("invalid_split");
  });
  it("a draft may leave fields empty; closing needs all of them", () => {
    expect(splitErrors(split(60, null), R)).toEqual({});
    expect(splitErrors(split(60, null), R, true)).toEqual({ equity_bishop: "required" });
    expect(splitError(split(null, null, null), R, true)).toBe("invalid_split");
  });
  it("closing also needs the SM Square center and its holder", () => {
    const ok = { ...split(60, 30), sm_square_center: "Centro A", sm_square_holder_user_id: "camila" };
    expect(closeBlock(ok, R)).toBeNull();
    expect(closeBlock({ ...ok, sm_square_center: " " }, R)).toBe("center_required");
    expect(closeBlock({ ...ok, sm_square_holder_user_id: null }, R)).toBe("holder_required");
    expect(closeBlock({ ...ok, equity_owner: 70 }, R)).toBe("invalid_split");
  });
  it("the form starts with SM Square's fixed share and reads typed numbers", () => {
    expect(validationInputOf(null, R)).toMatchObject({ equity_owner: null, equity_bishop: null, equity_sm: 10 });
    expect(validationInputOf(null, null)).toMatchObject({ equity_sm: null });
    expect(parsePct("")).toBeNull();
    expect(parsePct("62,5")).toBe(62.5);
    expect(parsePct("abc")).toBeNaN();
  });
  it("ranges that cannot add up to 100 are invalid", () => {
    expect(equityRangesError(R)).toBeNull();
    expect(equityRangesError({ ...R, owner: { min: 80, max: 90 } })).toBe("invalid_equity_ranges");
    expect(equityRangesError({ ...R, bishop: { min: 40, max: 15 } })).toBe("invalid_equity_ranges");
  });
});
