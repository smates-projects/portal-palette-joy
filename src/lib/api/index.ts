import type { ApiClient } from "./repositories";
import { createMockApi } from "./mock";
import {
  HTTP_REPOSITORY_KEYS,
  createAppHttpClient,
  createHttpRepositories,
  resolveRepositoryModes,
} from "./http";

/**
 * Every repository is the mock unless VITE_API_MODE / VITE_API_MODE_<REPO> say "http" (see .env.example). With no
 * variables (Lovable, the demo, the tests) this is exactly createMockApi(). The HTTP side is only built when at
 * least one repository asks for it. Mixing is allowed for the coordinated rollout; note that mock repositories keep
 * the mock's own signed-in demo user, independent of the real session.
 */
function createApi(): ApiClient {
  const mock = createMockApi();
  const modes = resolveRepositoryModes(import.meta.env as Record<string, unknown>);
  const httpKeys = HTTP_REPOSITORY_KEYS.filter((key) => modes[key] === "http");
  if (httpKeys.length === 0) return mock;

  const http = createHttpRepositories(createAppHttpClient());
  const selected: Partial<ApiClient> = {};
  for (const key of httpKeys) Object.assign(selected, { [key]: http[key] });
  return { ...mock, ...selected };
}

export const api: ApiClient = createApi();
export * from "./types";
