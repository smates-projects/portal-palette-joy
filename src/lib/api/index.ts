import { API_MODE } from "@/config/app";
import type { ApiClient } from "./repositories";
import { createMockApi } from "./mock";

// The "http" implementation (Laravel + Sanctum) plugs in here later.
function createApi(): ApiClient {
  if (API_MODE === "http") {
    console.warn("VITE_API_MODE=http is not implemented yet; using mock data.");
  }
  return createMockApi();
}

export const api: ApiClient = createApi();
export * from "./types";
