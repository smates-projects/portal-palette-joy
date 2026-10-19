// Small typed client over fetch for the real API (NestJS, /api/v1). It speaks the API's conventions so the
// adapters only map routes and shapes:
// - Cookie session: every call goes with credentials: "include".
// - Envelope { data, meta?, links? } in, plain values out; 204 (and empty 202) resolve to undefined.
// - Errors are RFC 9457 problem details (application/problem+json) with a stable `code`: they become an ApiError
//   whose message IS the code, the same contract as the mock's `new Error("code")` that the screens switch on.
// - Optimistic concurrency: the ETag of a GET is kept per resource path and sent back as If-Match on mutations.
// - Idempotency-Key on POSTs the adapter flags, reused on the single automatic retry of a network failure.
// Nothing here runs at module load (no window, no crypto): Cloudflare SSR evaluates this file.
import type { User } from "../types";
import { emitSessionExpired } from "./session-events";

export const DEFAULT_API_URL = "http://localhost:3100/api/v1";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One field error of a 422 problem; `path` is dotted snake_case ("first_person.email"). */
export interface FieldError {
  path: string;
  message: string;
  code?: string | undefined;
}

export interface ApiErrorInit {
  code: string;
  status: number;
  detail?: string | null | undefined;
  errors?: FieldError[] | undefined;
  requestId?: string | null | undefined;
}

/**
 * Error of an API call. `message` equals `code` on purpose: src/lib/auth/form.ts (authErrorCode) and the screens
 * read `error.message` exactly as they do with the mock. `status` is 0 for a network failure.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string | null;
  readonly errors: FieldError[];
  readonly requestId: string | null;

  constructor(init: ApiErrorInit) {
    super(init.code);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.detail = init.detail ?? null;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId ?? null;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** Pagination block of a list envelope (PLAN_BACKEND 4.3): cursor (`?cursor=`) for feeds, offset (`?page=`) for tables. */
export interface PageMeta {
  next_cursor?: string | null | undefined;
  current_page?: number | undefined;
  last_page?: number | undefined;
  per_page?: number | undefined;
  total?: number | undefined;
}

export interface PageLinks {
  next?: string | null | undefined;
  prev?: string | null | undefined;
}

export interface Envelope<T> {
  data: T;
  meta?: PageMeta | undefined;
  links?: PageLinks | undefined;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue> | undefined;
  /** Sent as JSON. Omit for no body. */
  body?: unknown;
  /** POST with side effects: sends an Idempotency-Key, kept for the one automatic retry of a network failure. */
  idempotent?: boolean | undefined;
  /**
   * Resource whose ETag this call reads or writes, when it differs from the path: PATCH /businesses/{id}/consultant
   * is guarded by the ETag of GET /businesses/{id}. Defaults to the path.
   */
  resource?: string | undefined;
}

/** "Who is signed in" as the client last saw it. undefined = not asked yet; null = no session. */
export interface SessionSnapshot {
  user: User | null | undefined;
  /** While SM Global impersonates: the person being viewed (GET /me `impersonating`). */
  impersonating: { id: string; name: string } | null;
}

export interface HttpClientConfig {
  /** Defaults to VITE_API_URL, then DEFAULT_API_URL. */
  baseUrl?: string | undefined;
  /** Defaults to the global fetch, looked up on every call (so tests can stub it). */
  fetch?: typeof fetch | undefined;
  /** Current UI language for Accept-Language ("es" | "en"). */
  language?: (() => string | null | undefined) | undefined;
}

export interface HttpClient {
  readonly baseUrl: string;
  /** ETag per resource path ("/businesses/{id}" → "\"3\""). In memory only. */
  readonly etags: Map<string, string>;
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
  /** Same call, keeping meta and links (pagination helpers). */
  envelope<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<Envelope<T>>;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  session(): SessionSnapshot;
  /** A new session state (login, logout, impersonation): also forgets every ETag of the previous person. */
  setSession(user: User | null, impersonating?: SessionSnapshot["impersonating"]): void;
  /** Refreshes who is signed in without dropping the ETags (GET /me, own profile edits). */
  updateSessionUser(user: User, impersonating?: SessionSnapshot["impersonating"]): void;
}

/** RFC 4122 v4. Generated per call, never at module load (Cloudflare SSR forbids randomness there). */
export function newUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function")
    cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Sign-in endpoints answer 401 as a normal result (invalid_credentials): it never means "the session expired". */
const isAuthEndpoint = (path: string) => path === "/auth" || path.startsWith("/auth/");

const MUTATING: ReadonlySet<HttpMethod> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** "/businesses/1/" or "/businesses/1?x=y" → "/businesses/1": the key of the ETag map. */
export function resourceKey(path: string): string {
  const [withoutQuery = ""] = path.split("?");
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, QueryValue> | undefined,
): string {
  const url = `${baseUrl.replace(/\/+$/, "")}${resourceKey(path)}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function toFieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    return [
      {
        path: typeof record["path"] === "string" ? record["path"] : "",
        message: typeof record["message"] === "string" ? record["message"] : "",
        code: typeof record["code"] === "string" ? record["code"] : undefined,
      },
    ];
  });
}

/** `Not Found` → `not_found`, the API's own fallback when a problem has no code. */
const codeFromStatusText = (status: number, statusText: string) =>
  statusText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || `http_${status}`;

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function problemToError(response: Response, body: unknown): ApiError {
  const problem = asRecord(body);
  const requestId =
    (typeof problem?.["request_id"] === "string" ? problem["request_id"] : null) ??
    response.headers.get("x-request-id");
  // 412 is always "precondition_failed" for the screens ("alguien cambió esto, recarga"), whatever detail it carries.
  const code =
    response.status === 412
      ? "precondition_failed"
      : typeof problem?.["code"] === "string"
        ? problem["code"]
        : codeFromStatusText(response.status, response.statusText);
  return new ApiError({
    code,
    status: response.status,
    detail: typeof problem?.["detail"] === "string" ? problem["detail"] : null,
    errors: toFieldErrors(problem?.["errors"]),
    requestId,
  });
}

const readEnv = (key: string): string | undefined => {
  const value = (import.meta.env as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const baseUrl = config.baseUrl ?? readEnv("VITE_API_URL") ?? DEFAULT_API_URL;
  const etags = new Map<string, string>();
  const state: SessionSnapshot = { user: undefined, impersonating: null };
  const fetchImpl = (input: string, init: RequestInit) =>
    (config.fetch ?? globalThis.fetch)(input, init);

  function headersFor(
    method: HttpMethod,
    resource: string,
    hasBody: boolean,
    idempotencyKey: string | null,
  ) {
    const headers: Record<string, string> = {
      Accept: "application/json, application/problem+json",
      "X-Request-Id": newUuid(),
    };
    const language = config.language?.();
    if (language) headers["Accept-Language"] = language;
    if (hasBody) headers["Content-Type"] = "application/json";
    const etag = MUTATING.has(method) ? etags.get(resource) : undefined;
    if (etag) headers["If-Match"] = etag;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return headers;
  }

  async function envelope<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<Envelope<T>> {
    const url = buildUrl(baseUrl, path, options.query);
    const resource = resourceKey(options.resource ?? path);
    const hasBody = options.body !== undefined;
    // One key per logical attempt: the retry below reuses it so the server applies the effect once.
    const idempotencyKey = method === "POST" && options.idempotent ? newUuid() : null;
    const maxAttempts = idempotencyKey ? 2 : 1;

    let response: Response | null = null;
    for (let attempt = 1; response === null; attempt += 1) {
      try {
        response = await fetchImpl(url, {
          method,
          credentials: "include",
          headers: headersFor(method, resource, hasBody, idempotencyKey),
          ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch (cause) {
        if (attempt < maxAttempts) continue;
        throw new ApiError({
          code: "network_error",
          status: 0,
          detail: cause instanceof Error ? cause.message : null,
        });
      }
    }

    const etag = response.headers.get("etag");
    if (response.ok && etag) etags.set(resource, etag);

    const body = await readBody(response);
    if (!response.ok) {
      if (response.status === 401 && !isAuthEndpoint(resourceKey(path))) {
        state.user = null;
        state.impersonating = null;
        emitSessionExpired();
      }
      throw problemToError(response, body);
    }
    if (response.status === 204 || body === undefined) return { data: undefined as T };
    const record = asRecord(body);
    if (record && "data" in record) {
      return {
        data: record["data"] as T,
        meta: (asRecord(record["meta"]) ?? undefined) as PageMeta | undefined,
        links: (asRecord(record["links"]) ?? undefined) as PageLinks | undefined,
      };
    }
    return { data: body as T };
  }

  const request = async <T>(method: HttpMethod, path: string, options?: RequestOptions) =>
    (await envelope<T>(method, path, options)).data;

  return {
    baseUrl,
    etags,
    request,
    envelope,
    get: (path, options) => request("GET", path, options),
    post: (path, body, options) => request("POST", path, { ...options, body }),
    patch: (path, body, options) => request("PATCH", path, { ...options, body }),
    delete: (path, options) => request("DELETE", path, options),
    session: () => ({ ...state }),
    setSession: (user, impersonating = null) => {
      state.user = user;
      state.impersonating = user ? impersonating : null;
      etags.clear();
    },
    updateSessionUser: (user, impersonating) => {
      state.user = user;
      if (impersonating !== undefined) state.impersonating = impersonating;
    },
  };
}

// ---------- Pagination ----------
// The repositories return whole arrays (the mock's contract, which hooks.ts and the screens rely on). These helpers
// walk every page of a list endpoint and hand back the flat array. A plain `{ data: [...] }` (no meta, no links,
// which is every list of the API today) is one page.

/** Safety net: a list never needs more pages than this in the portal's scale. */
const MAX_PAGES = 100;

const queryParamOf = (link: string | null | undefined, name: string): string | null => {
  if (!link) return null;
  try {
    return new URL(link, "http://link.invalid").searchParams.get(name);
  } catch {
    return null;
  }
};

/** Cursor lists (feeds, activity, notifications, tasks): follows meta.next_cursor or the `cursor` of links.next. */
export async function listAllByCursor<T>(
  client: HttpClient,
  path: string,
  query: Record<string, QueryValue> = {},
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: Envelope<T[]> = await client.envelope<T[]>("GET", path, {
      query: cursor ? { ...query, cursor } : query,
    });
    items.push(...(result.data ?? []));
    cursor = result.meta?.next_cursor ?? queryParamOf(result.links?.next, "cursor");
    if (!cursor) break;
  }
  return items;
}

/** Offset lists (admin tables): page 1, 2... until meta.last_page, or while links.next exists. */
export async function listAllByPage<T>(
  client: HttpClient,
  path: string,
  query: Record<string, QueryValue> = {},
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result: Envelope<T[]> = await client.envelope<T[]>("GET", path, {
      query: page === 1 ? query : { ...query, page },
    });
    items.push(...(result.data ?? []));
    const meta = result.meta;
    const lastPage =
      meta?.last_page ??
      (meta?.total !== undefined && meta.per_page
        ? Math.ceil(meta.total / meta.per_page)
        : undefined);
    const hasNext =
      lastPage !== undefined
        ? (meta?.current_page ?? page) < lastPage
        : Boolean(result.links?.next);
    if (!hasNext) break;
  }
  return items;
}

/** GET that answers null on 404 (the repositories' "not found" for single reads). */
export async function getOrNull<T>(
  client: HttpClient,
  path: string,
  options?: RequestOptions,
): Promise<T | null> {
  try {
    return await client.get<T>(path, options);
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}
