import { describe, expect, it } from "vitest";
import { resolveRepositoryModes } from "./http";
import { demoFlags, isMockRepository } from "./mode";

describe("api mode: demo texts only on the mock", () => {
  it("without variables everything is the mock and every demo flag is on", () => {
    const modes = resolveRepositoryModes({});
    expect(demoFlags(modes)).toEqual({ session: true, users: true, leads: true });
    expect(isMockRepository("leads", modes)).toBe(true);
  });

  it("with VITE_API_MODE=http every demo flag is off", () => {
    const modes = resolveRepositoryModes({ VITE_API_MODE: "http" });
    expect(demoFlags(modes)).toEqual({ session: false, users: false, leads: false });
    expect(isMockRepository("session", modes)).toBe(false);
  });

  it("mixed mode: each flag follows its own repository", () => {
    const modes = resolveRepositoryModes({ VITE_API_MODE_SESSION: "http", VITE_API_MODE_USERS: "http" });
    expect(demoFlags(modes)).toEqual({ session: false, users: false, leads: true });
  });
});
