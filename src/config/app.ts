// Fixed "today" so the demo is stable regardless of the real date.
export const TODAY = "2026-10-14";
export const PROGRAM_LENGTH_DAYS = 180;

export type ApiMode = "mock" | "http";
export const API_MODE: ApiMode =
  (import.meta.env.VITE_API_MODE as ApiMode | undefined) === "http" ? "http" : "mock";
