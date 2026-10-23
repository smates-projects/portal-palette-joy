// "Today" and "now" live in src/lib/clock.ts (frozen demo day in mock mode, real time over http). The program length
// is not a constant: it comes from GET /rules (program_length_days).

export type ApiMode = "mock" | "http";
export const API_MODE: ApiMode =
  (import.meta.env["VITE_API_MODE"] as ApiMode | undefined) === "http" ? "http" : "mock";
