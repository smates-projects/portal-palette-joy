// Test helpers for the HTTP adapters: a recorded fetch stub and responses shaped like the API's
// (envelope { data }, RFC 9457 problems). Used only by src/lib/api/http/*.test.ts.
import { vi } from "vitest";
import { createHttpClient, type HttpClient } from "./client";

export const TEST_BASE_URL = "http://api.test/api/v1";

export interface RecordedCall {
  url: string;
  /** Path after the base URL, query included: "/users?include_inactive=true". */
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | (() => Response);

/** Replaces the global fetch; answers the queued replies in order and records every call. */
export function stubFetch(...replies: Reply[]) {
  const queue = [...replies];
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    calls.push({
      url: input,
      path: input.startsWith(TEST_BASE_URL) ? input.slice(TEST_BASE_URL.length) : input,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch ${init.method ?? "GET"} ${input}`);
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const dataResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const emptyResponse = (status = 204) => new Response(null, { status });

export const problemResponse = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) =>
  new Response(
    JSON.stringify({
      type: `urn:sm:problem:${code}`,
      title: "Error",
      status,
      detail: `Problem ${code}.`,
      instance: "/api/v1/test",
      request_id: "req-123",
      code,
      ...extra,
    }),
    { status, headers: { "Content-Type": "application/problem+json" } },
  );

export const testClient = (): HttpClient =>
  createHttpClient({ baseUrl: TEST_BASE_URL, language: () => "es" });

// ---------- Fixtures shaped like the API's Zod schemas (packages/domain/src/schemas) ----------

export const IDS = {
  global: "11111111-1111-4111-8111-111111111111",
  office: "22222222-2222-4222-8222-222222222222",
  firm: "33333333-3333-4333-8333-333333333333",
  business: "44444444-4444-4444-8444-444444444444",
  marilyn: "55555555-5555-4555-8555-555555555555",
  andrea: "66666666-6666-4666-8666-666666666666",
  carla: "77777777-7777-4777-8777-777777777777",
  lucia: "88888888-8888-4888-8888-888888888888",
  event: "99999999-9999-4999-8999-999999999999",
  zone: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  member: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  request: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  newFirm: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as const;

/** UserSchema. */
export const userFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.andrea,
  full_name: "Andrea Salazar",
  email: "andrea@strategicmates.com",
  role: "sm_team",
  organization_id: IDS.office,
  business_id: null,
  title: "Directora",
  google_calendar_email: null,
  booking_url: null,
  is_admin: true,
  status: "active",
  invited_at: "2026-01-10T12:00:00.000Z",
  activated_at: "2026-01-11T12:00:00.000Z",
  deactivated_at: null,
  deactivation_reason: null,
  ...overrides,
});

/** MeSchema: UserSchema plus impersonating. */
export const meFixture = (
  overrides: Record<string, unknown> = {},
  impersonating: { id: string; name: string } | null = null,
) => ({
  ...userFixture(overrides),
  impersonating,
});

/** OrganizationSchema. */
export const organizationFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.firm,
  name: "Estudio Pérez",
  kind: "partner_firm",
  area: "B1",
  specialty: "Abogados",
  city: "Miami",
  email: "contacto@estudioperez.com",
  phone: "+1 305 555 0101",
  parent_id: IDS.office,
  internal: false,
  firm_status: "active",
  contact_name: "Lucía Pérez",
  replaced_by_id: null,
  deactivated_at: null,
  deactivation_reason: null,
  ...overrides,
});

/** BusinessSchema. */
export const businessFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.business,
  name: "Vossler",
  industry: "construction",
  city: "Orlando",
  state: "FL",
  owner_user_id: IDS.carla,
  status: "in_program",
  program_start_date: "2026-08-02",
  program_day: 74,
  office_id: IDS.office,
  consultant_id: IDS.andrea,
  ...overrides,
});
