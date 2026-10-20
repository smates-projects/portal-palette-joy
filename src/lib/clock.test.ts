import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_DAY, clockFrozenFor, configureClock, isClockFrozen, nowIso, todayIso } from "./clock";
import { resolveRepositoryModes } from "./api/http";
import { meetingHeld } from "./leads/entry";
import { programDayOn } from "./leads/funds";

afterEach(() => {
  configureClock({ frozen: true });
  vi.useRealTimers();
});

describe("clock", () => {
  it("is frozen on the demo day by default (pure mock: demo, tutorials, Lovable, tests)", () => {
    expect(isClockFrozen()).toBe(true);
    expect(todayIso()).toBe(DEMO_DAY);
    expect(nowIso().slice(0, 10)).toBe(DEMO_DAY);
  });

  it("follows the real time once configured unfrozen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 15, 30));
    configureClock({ frozen: false });
    expect(todayIso()).toBe("2026-10-20");
    expect(nowIso()).toBe(new Date(2026, 9, 20, 15, 30).toISOString());
  });

  it("stays frozen only when no repository runs over http", () => {
    expect(clockFrozenFor(resolveRepositoryModes({}))).toBe(true);
    expect(clockFrozenFor(resolveRepositoryModes({ VITE_API_MODE: "http" }))).toBe(false);
    expect(clockFrozenFor(resolveRepositoryModes({ VITE_API_MODE_LEADS: "http" }))).toBe(false);
  });

  it("feeds the date helpers: a meeting on 20 Oct is held in real mode, future in the demo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T18:00:00Z"));
    const meeting = { starts_at: "2026-10-20T14:00:00Z", duration_minutes: 45 };
    expect(meetingHeld(meeting)).toBe(false);
    expect(programDayOn("2026-10-01")).toBe(14);
    configureClock({ frozen: false });
    expect(meetingHeld(meeting)).toBe(true);
    expect(programDayOn("2026-10-01")).toBe(20);
  });
});
