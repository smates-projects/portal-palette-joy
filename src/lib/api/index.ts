import type { ApiClient } from "./repositories";
import { createMockApi } from "./mock";
import { clockFrozenFor, configureClock } from "@/lib/clock";
import { withMockUserSync } from "./http/mixed-mode";
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
 * the mock's own user, which follows the real session by email (http/mixed-mode.ts).
 */
function createApi(): ApiClient {
  const modes = resolveRepositoryModes(import.meta.env as Record<string, unknown>);
  // Real time as soon as anything talks to the API; the frozen demo day only for a pure mock build.
  configureClock({ frozen: clockFrozenFor(modes) });
  const mock = createMockApi();
  const httpKeys = HTTP_REPOSITORY_KEYS.filter((key) => modes[key] === "http");
  if (httpKeys.length === 0) return mock;

  const http = createHttpRepositories(createAppHttpClient());
  const selected: Partial<ApiClient> = {};
  for (const key of httpKeys) Object.assign(selected, { [key]: http[key] });
  // Mixed: while any repository of the client is still the mock (not only the ones that already have an HTTP
  // adapter), the mock must authorize as the person really signed in, not as the demo user.
  const mockKeysLeft = (Object.keys(mock) as (keyof ApiClient)[]).filter((key) => !(key in selected));
  if (selected.session && mockKeysLeft.length > 0) {
    selected.session = withMockUserSync(selected.session, {
      adopt: mock.session.adoptUserByEmail,
      reset: mock.session.resetUser,
    });
  }
  return { ...mock, ...selected };
}

export const api: ApiClient = createApi();
export * from "./types";
