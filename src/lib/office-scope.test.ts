import { beforeEach, describe, expect, it } from "vitest";
import { ALL_OFFICES, OFFICE_SCOPE_STORAGE_KEY, getOfficeScope, inOfficeScope, officeIdForQuery, resetOfficeScope, setOfficeScope } from "./office-scope";

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
};

describe("office scope (Viendo)", () => {
  beforeEach(() => {
    storage.clear();
    resetOfficeScope();
    Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true });
  });

  it("starts on the whole network and remembers the chosen office in localStorage", () => {
    expect(getOfficeScope()).toBe(ALL_OFFICES);
    setOfficeScope("office-1");
    expect(getOfficeScope()).toBe("office-1");
    expect(storage.get(OFFICE_SCOPE_STORAGE_KEY)).toBe("office-1");
    resetOfficeScope();
    expect(getOfficeScope()).toBe("office-1");
    setOfficeScope(ALL_OFFICES);
    expect(storage.has(OFFICE_SCOPE_STORAGE_KEY)).toBe(false);
  });

  it("filters by office and lets through what has no office", () => {
    expect(inOfficeScope(ALL_OFFICES, "office-1")).toBe(true);
    expect(inOfficeScope("office-1", "office-1")).toBe(true);
    expect(inOfficeScope("office-1", "office-2")).toBe(false);
    expect(inOfficeScope("office-1", null)).toBe(true);
    expect(officeIdForQuery(ALL_OFFICES)).toBeUndefined();
    expect(officeIdForQuery("office-1")).toBe("office-1");
  });
});
