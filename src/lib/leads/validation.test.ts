import { describe, expect, it } from "vitest";
import { SM_SQUARE_EQUITY, closeBlock, parsePct, splitError, splitErrors, validationInputOf } from "./validation";

const split = (equity_owner: number | null, equity_bishop: number | null, equity_sm: number | null = 10) => ({ equity_owner, equity_bishop, equity_sm });

describe("split validation (50-75 / 15-40 / SM Square 10, summing 100)", () => {
  it("accepts a split inside the ranges that adds up to 100", () => {
    expect(splitErrors(split(60, 30))).toEqual({});
    expect(splitErrors(split(75, 15))).toEqual({});
    expect(splitErrors(split(50, 40))).toEqual({});
    expect(splitError(split(60, 30), true)).toBeNull();
  });
  it("marks each percentage out of its range", () => {
    expect(splitErrors(split(80, 10))).toEqual({ equity_owner: "range", equity_bishop: "range" });
    expect(splitErrors(split(49, 41))).toEqual({ equity_owner: "range", equity_bishop: "range" });
    expect(splitErrors(split(Number.NaN, 30))).toEqual({ equity_owner: "range" });
  });
  it("SM Square stays at 10", () => {
    expect(splitErrors(split(60, 25, 15))).toEqual({ equity_sm: "fixed" });
    expect(SM_SQUARE_EQUITY).toBe(10);
  });
  it("in range but not adding up to 100", () => {
    expect(splitErrors(split(60, 20))).toEqual({ sum: "sum" });
    expect(splitError(split(60, 20))).toBe("invalid_split");
  });
  it("a draft may leave fields empty; closing needs all of them", () => {
    expect(splitErrors(split(60, null))).toEqual({});
    expect(splitErrors(split(60, null), true)).toEqual({ equity_bishop: "required" });
    expect(splitError(split(null, null, null), true)).toBe("invalid_split");
  });
  it("closing also needs the SM Square center and its holder", () => {
    const ok = { ...split(60, 30), sm_square_center: "SM Square Miami", sm_square_holder_user_id: "camila" };
    expect(closeBlock(ok)).toBeNull();
    expect(closeBlock({ ...ok, sm_square_center: " " })).toBe("center_required");
    expect(closeBlock({ ...ok, sm_square_holder_user_id: null })).toBe("holder_required");
    expect(closeBlock({ ...ok, equity_owner: 70 })).toBe("invalid_split");
  });
  it("the form starts with SM Square's 10 % and reads typed numbers", () => {
    expect(validationInputOf(null)).toMatchObject({ equity_owner: null, equity_bishop: null, equity_sm: 10 });
    expect(parsePct("")).toBeNull();
    expect(parsePct("62,5")).toBe(62.5);
    expect(parsePct("abc")).toBeNaN();
  });
});
