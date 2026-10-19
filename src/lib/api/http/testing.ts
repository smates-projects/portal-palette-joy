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

/** LeadWithComputedSchema: a lead in Reunión with its booked meeting. */
export const leadFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.request,
  office_id: IDS.office,
  source: "landing",
  summary_sent_at: "2026-10-10T15:00:00.000Z",
  meeting: {
    starts_at: "2026-10-20T15:00:00.000Z",
    duration_minutes: 30,
    meet_url: "https://meet.google.com/abc-defg-hij",
    consultant_user_id: IDS.andrea,
    booked_at: "2026-10-10T15:00:00.000Z",
    notes_at: null,
  },
  stage: "meeting",
  discarded_from: null,
  discard_reason: null,
  stage_entered_at: "2026-10-10T15:00:00.000Z",
  submitted_at: "2026-10-09T12:00:00.000Z",
  last_contact_at: null,
  consultant_user_id: IDS.andrea,
  business_id: null,
  contact: {
    name: "Ramón Castillo",
    email: "ramon@castillo.com",
    phone: "+1 305 555 0123",
    city: "Miami",
    state: "FL",
    hispanic_owner: "yes",
  },
  business: {
    name: "Castillo Instalaciones",
    industry: "installations_repairs",
    activity_other: null,
    activity: "Instalaciones eléctricas",
    revenue_range: "500k_750k",
    margin_range: "margin_21_40",
    team_range: "team_6_10",
    years_range: "years_6_10",
    has_active_clients: true,
  },
  result: null,
  know_how_example: null,
  assessment_sent_at: null,
  bishop_user_id: null,
  bishop_accepted_at: null,
  booking_url: "https://calendar.app.google/andrea",
  intake: null,
  tripartite: "none",
  funds: null,
  ...overrides,
});

/** LeadEventSchema. */
export const leadEventFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.event,
  lead_id: IDS.request,
  kind: "note",
  actor_user_id: IDS.andrea,
  created_at: "2026-10-11T12:00:00.000Z",
  from: null,
  to: null,
  body: "Llamó para confirmar",
  ...overrides,
});

/** IntakeDocumentSchema: an entry document SM asked for. */
export const documentFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.member,
  business_id: IDS.business,
  area: "intake",
  name: "Estados de cuenta bancarios",
  state: "requested",
  requested_at: "2026-10-12",
  received_at: null,
  file_name: null,
  required: true,
  ...overrides,
});

/** ContractSchema: the NDA waiting for the owner. */
export const contractFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.newFirm,
  business_id: IDS.business,
  area: "intake",
  kind: "nda",
  name: "NDA",
  state: "sent",
  sent_at: "2026-10-12",
  signed_at: null,
  signers: [
    {
      name: "Ramón Castillo",
      role: "Dueño",
      signed_at: null,
      party: "owner",
      user_id: IDS.carla,
      status: "sent",
    },
  ],
  ...overrides,
});

/** IntakeSummarySchema. */
export const intakeSummaryFixture = (overrides: Record<string, unknown> = {}) => ({
  business_id: IDS.business,
  required_total: 8,
  uploaded: 3,
  accepted: 1,
  to_review: 2,
  nda_signed: true,
  mou_signed: false,
  nda_signed_by_owner: true,
  clock: { status: "running", day: 2, total: 5, tone: "ok" },
  approval: { ok: false, reason: "contracts", missing: ["MOU"] },
  approved_at: null,
  ...overrides,
});

/** NotificationSchema: a task notification. */
export const notificationFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.event,
  user_id: IDS.carla,
  kind: "submitted_for_approval",
  task_id: IDS.member,
  task_code: "B1-01",
  task_name: "Contrato de franquicia",
  business_id: IDS.business,
  business_name: "Vossler",
  actor_user_id: IDS.lucia,
  actor_name: "Lucía Pérez",
  created_at: "2026-10-15T12:00:00.000Z",
  read_at: null,
  change: null,
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
