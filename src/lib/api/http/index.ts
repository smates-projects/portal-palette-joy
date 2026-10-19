// Adapters to the real API, and which repositories use them. Selection (see .env.example):
// - VITE_API_MODE = mock | http: default for every repository (absent = mock, what Lovable runs).
// - VITE_API_MODE_<REPO> = mock | http: per repository override, e.g. VITE_API_MODE_SESSION=http.
// Only the repositories in HTTP_REPOSITORY_KEYS have an adapter; the rest stay on the mock whatever the variables say.
import i18n from "@/lib/i18n";
import type { ApiClient } from "../repositories";
import { createHttpClient, type HttpClient, type HttpClientConfig } from "./client";
import { createHttpBusinessProfileRepository } from "./business-profile";
import { createHttpBusinessesRepository } from "./businesses";
import { createHttpOrganizationsRepository } from "./organizations";
import { createHttpRoutingRepository } from "./routing";
import { createHttpSessionRepository } from "./session";
import { createHttpUsersRepository } from "./users";

export type RepositoryMode = "mock" | "http";

/** Repositories with an HTTP adapter today, and the suffix of their override variable. */
export const HTTP_REPOSITORIES = {
  session: "SESSION",
  users: "USERS",
  organizations: "ORGANIZATIONS",
  businesses: "BUSINESSES",
  businessProfile: "BUSINESS_PROFILE",
  routing: "ROUTING",
} as const satisfies Partial<Record<keyof ApiClient, string>>;

export type HttpRepositoryKey = keyof typeof HTTP_REPOSITORIES;
export type HttpRepositories = Pick<ApiClient, HttpRepositoryKey>;

export const HTTP_REPOSITORY_KEYS = Object.keys(HTTP_REPOSITORIES) as HttpRepositoryKey[];

const parseMode = (value: unknown): RepositoryMode | undefined => {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  return clean === "http" || clean === "mock" ? clean : undefined;
};

/** Mode of each adaptable repository from the environment. Anything unknown or missing is "mock". */
export function resolveRepositoryModes(
  env: Record<string, unknown>,
): Record<HttpRepositoryKey, RepositoryMode> {
  const fallback = parseMode(env["VITE_API_MODE"]) ?? "mock";
  const modes = {} as Record<HttpRepositoryKey, RepositoryMode>;
  for (const key of HTTP_REPOSITORY_KEYS) {
    modes[key] = parseMode(env[`VITE_API_MODE_${HTTP_REPOSITORIES[key]}`]) ?? fallback;
  }
  return modes;
}

export function createHttpRepositories(client: HttpClient): HttpRepositories {
  return {
    session: createHttpSessionRepository(client),
    users: createHttpUsersRepository(client),
    organizations: createHttpOrganizationsRepository(client),
    businesses: createHttpBusinessesRepository(client),
    businessProfile: createHttpBusinessProfileRepository(client),
    routing: createHttpRoutingRepository(client),
  };
}

/** The app's client: VITE_API_URL and the current i18n language (read per request, never at module load). */
export function createAppHttpClient(config: HttpClientConfig = {}): HttpClient {
  return createHttpClient({ language: () => i18n.language, ...config });
}
