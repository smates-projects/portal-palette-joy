// "Today" and "now" live in src/lib/clock.ts (frozen demo day in mock mode, real time over http).
export const PROGRAM_LENGTH_DAYS = 180;

export type ApiMode = "mock" | "http";
export const API_MODE: ApiMode =
  (import.meta.env["VITE_API_MODE"] as ApiMode | undefined) === "http" ? "http" : "mock";
