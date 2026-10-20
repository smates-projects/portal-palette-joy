// The single source of "now" for the whole front.
//
// The mock (demo, tutorials, Lovable, tests) runs on a frozen demo day so the seeded data always reads the same way
// ("due tomorrow", "day 42 of the program"). As soon as any repository talks to the real API the clock must be the
// real one: real meetings, contracts and payments are dated by the server, and comparing them with a frozen day makes
// meetings look future, waiting periods wrong and so on. src/lib/api/index.ts configures this at boot from the
// repository modes; nothing else should read Date for "today".
//
// Every reader goes through todayIso() / nowIso(); never cache them at module load, the mode is set at boot.

/** The fixed demo day of the mock seed. */
export const DEMO_DAY = "2026-10-14";

let frozenDay: string | null = DEMO_DAY;

/** frozen: true keeps the demo day (pure mock); false follows the real clock (any repository over http). */
export function configureClock(options: { frozen: boolean }) {
  frozenDay = options.frozen ? DEMO_DAY : null;
}

export const isClockFrozen = () => frozenDay !== null;

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as YYYY-MM-DD: the demo day when frozen, otherwise the viewer's local calendar day. */
export function todayIso(): string {
  if (frozenDay) return frozenDay;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Current instant (ISO, UTC). When frozen, the real time of day anchored to the demo day. */
export function nowIso(): string {
  const real = new Date().toISOString();
  return frozenDay ? `${frozenDay}T${real.slice(11)}` : real;
}

/** The clock follows real time when any repository runs over http; only a pure mock build stays frozen. */
export const clockFrozenFor = (modes: Record<string, string>) =>
  !Object.values(modes).includes("http");
