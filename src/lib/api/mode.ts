// Which repositories run on the in-memory mock and which on the real API, read once from the environment (the same
// resolution src/lib/api/index.ts uses to build the client). Screens ask here before showing anything that only
// makes sense on the demo: the seeded password, the fixed two-factor code, "Simular aceptación", "Simular entrada".
import { resolveRepositoryModes, type HttpRepositoryKey, type RepositoryMode } from "./http";

export type RepositoryModes = Record<HttpRepositoryKey, RepositoryMode>;

export const apiModes: RepositoryModes = resolveRepositoryModes(import.meta.env as Record<string, unknown>);

/** True while that repository is the mock (no VITE_API_MODE for it): the demo shortcuts of its screens may show. */
export const isMockRepository = (key: HttpRepositoryKey, modes: RepositoryModes = apiModes): boolean => modes[key] === "mock";

/** The demo texts and buttons, each tied to the repository it talks to. Never true with the HTTP adapter. */
export interface DemoFlags {
  /** Login hint with the seeded password, the fixed two-factor code. */
  session: boolean;
  /** "(simulado)" in Invitar persona, "Simular aceptación". */
  users: boolean;
  /** "Simular entrada / assessment / reserva" of the embudo. */
  leads: boolean;
}

export const demoFlags = (modes: RepositoryModes = apiModes): DemoFlags => ({
  session: isMockRepository("session", modes),
  users: isMockRepository("users", modes),
  leads: isMockRepository("leads", modes),
});
