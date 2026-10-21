import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpDistributionRepository } from "./distribution";
import {
  IDS,
  dataResponse,
  emptyResponse,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const BIZ = IDS.business;
const FIRM = IDS.firm;
const PAYMENT = IDS.member;
const FILE_ID = IDS.zone;
const DIST_PATH = `/businesses/${BIZ}/distribution`;
const UPLOAD_URL = "https://storage.test/quarantine/payout?X-Amz-Signature=sig";

const setup = () => {
  const client = testClient();
  return { client, distribution: createHttpDistributionRepository(client) };
};

/** DistributionPaymentSchema, paid with a stored receipt. */
const apiPayment = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT,
  amount: 20000,
  due_on: "2026-10-30",
  milestone: null,
  status: "paid",
  paid_on: "2026-10-14",
  method: "transfer",
  reference: "T-1",
  receipt: { file_name: "pago.pdf", size_kb: 96, file_id: FILE_ID },
  overdue: false,
  ...overrides,
});

/** DistributionSchema: SM's own share (no plan) and one firm line. */
const apiDistribution = (payments: unknown[] = [apiPayment()]) => ({
  business_id: BIZ,
  business_name: "Vossler",
  received: 150000,
  assigned: 20000,
  unassigned: 130000,
  paid: 20000,
  overdue_count: 0,
  lines: [
    {
      id: `${BIZ}:sm`,
      business_id: BIZ,
      organization_id: null,
      firm_name: null,
      areas: [],
      kind: null,
      amount: 0,
      paid: 0,
      payments: [],
    },
    {
      id: `${BIZ}:${FIRM}`,
      business_id: BIZ,
      organization_id: FIRM,
      firm_name: "Estudio Pérez",
      areas: ["B1"],
      kind: "one_time",
      amount: 20000,
      paid: 20000,
      payments,
    },
  ],
});

/** The same distribution as the front's type: receipts without file_id. */
const frontDistribution = () => {
  const api = apiDistribution();
  const firmLine = api.lines[1]!;
  return {
    ...api,
    lines: [
      api.lines[0],
      {
        ...firmLine,
        payments: [{ ...apiPayment(), receipt: { file_name: "pago.pdf", size_kb: 96 } }],
      },
    ],
  };
};

describe("http distribution", () => {
  it("get: GET /businesses/{id}/distribution, the ETag kept, line ids business:org|sm, receipts without file_id", async () => {
    const { calls } = stubFetch(dataResponse(apiDistribution(), 200, { ETag: '"4"' }));
    const { distribution, client } = setup();
    const result = await distribution.get(BIZ);
    expect(result).toEqual(frontDistribution());
    expect(result?.lines.map((line) => line.id)).toEqual([`${BIZ}:sm`, `${BIZ}:${FIRM}`]);
    expect(calls[0]).toMatchObject({ method: "GET", path: DIST_PATH });
    expect(client.etags.get(DIST_PATH)).toBe('"4"');
  });

  it("get: null while the business has no funds", async () => {
    stubFetch(dataResponse(null));
    expect(await setup().distribution.get(BIZ)).toBeNull();
  });

  it("saveLine: reads the distribution for its ETag, then PUT /lines with If-Match; the new ETag is kept", async () => {
    const { calls } = stubFetch(
      dataResponse(apiDistribution(), 200, { ETag: '"4"' }),
      dataResponse(apiDistribution(), 200, { ETag: '"5"' }),
    );
    const { distribution, client } = setup();
    await distribution.saveLine(BIZ, {
      organization_id: FIRM,
      kind: "installments",
      payments: [
        { amount: 10000, due_on: "2026-11-01", milestone: null },
        { amount: 10000, due_on: "2026-12-01", milestone: null },
      ],
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${DIST_PATH}`,
      `PUT ${DIST_PATH}/lines`,
    ]);
    expect(calls[1]?.headers["If-Match"]).toBe('"4"');
    expect(calls[1]?.body).toEqual({
      organization_id: FIRM,
      kind: "installments",
      payments: [
        { amount: 10000, due_on: "2026-11-01", milestone: null },
        { amount: 10000, due_on: "2026-12-01", milestone: null },
      ],
    });
    expect(client.etags.get(DIST_PATH)).toBe('"5"');
  });

  it("saveLine: a stale version is precondition_failed", async () => {
    stubFetch(problemResponse(412, "precondition_failed"));
    const { distribution, client } = setup();
    client.etags.set(DIST_PATH, '"1"');
    await expect(
      distribution.saveLine(BIZ, { organization_id: null, kind: "milestones", payments: [] }),
    ).rejects.toThrow("precondition_failed");
  });

  it("clearLine: DELETE /lines/{org} with If-Match", async () => {
    const { calls } = stubFetch(dataResponse(apiDistribution(), 200, { ETag: '"6"' }));
    const { distribution, client } = setup();
    client.etags.set(DIST_PATH, '"5"');
    await distribution.clearLine(BIZ, FIRM);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `${DIST_PATH}/lines/${FIRM}` });
    expect(calls[0]?.headers["If-Match"]).toBe('"5"');
    expect(client.etags.get(DIST_PATH)).toBe('"6"');
  });

  it("clearLine: Strategic Mates' own share is the `sm` sentinel", async () => {
    const { calls } = stubFetch(dataResponse(apiDistribution()));
    const { distribution, client } = setup();
    client.etags.set(DIST_PATH, '"5"');
    await distribution.clearLine(BIZ, null);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `${DIST_PATH}/lines/sm` });
  });

  it("markPaid: presign (distribution_payment) → PUT → complete → POST /paid with an Idempotency-Key, in this order", async () => {
    const { calls, fetchMock } = stubFetch(
      dataResponse(
        {
          file_id: FILE_ID,
          upload_url: UPLOAD_URL,
          headers: {},
          expires_at: "2026-10-19T12:05:00.000Z",
        },
        201,
      ),
      emptyResponse(200),
      dataResponse({ id: FILE_ID, status: "pending" }, 202),
      dataResponse({ id: FILE_ID, status: "ready" }),
      dataResponse(apiDistribution(), 200, { ETag: '"7"' }),
    );
    const { distribution, client } = setup();
    const file = new File(["%PDF-1.7 pago"], "pago.pdf", { type: "application/pdf" });

    expect(
      await distribution.markPaid(BIZ, PAYMENT, {
        paid_on: "2026-10-14",
        method: "transfer",
        reference: "T-1",
        receipt: file,
      }),
    ).toEqual(frontDistribution());

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `GET /files/${FILE_ID}`,
      `POST /distribution-payments/${PAYMENT}/paid`,
    ]);
    expect(calls[0]?.body).toMatchObject({ context: "distribution_payment", business_id: BIZ });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(file);
    expect(calls[4]?.body).toEqual({
      paid_on: "2026-10-14",
      method: "transfer",
      reference: "T-1",
      receipt_file_id: FILE_ID,
    });
    expect(calls[4]?.headers["Idempotency-Key"]).toBeTruthy();
    // The answer is the whole distribution: its new ETag goes under the distribution.
    expect(client.etags.get(DIST_PATH)).toBe('"7"');
  });

  it("markPaid: without a receipt it goes straight to POST /paid; a placeholder is invalid_file", async () => {
    const { calls } = stubFetch(dataResponse(apiDistribution()));
    const { distribution } = setup();
    await distribution.markPaid(BIZ, PAYMENT, {
      paid_on: "2026-10-14",
      method: "wire",
      reference: null,
      receipt: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ receipt_file_id: null });
    await expect(
      distribution.markPaid(BIZ, PAYMENT, {
        paid_on: "2026-10-14",
        method: "wire",
        reference: null,
        receipt: { file_name: "pago.pdf", size_kb: 96 },
      }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(1);
  });

  it("markPending: POST /distribution-payments/{id}/pending", async () => {
    const pending = apiPayment({
      status: "pending",
      paid_on: null,
      method: null,
      reference: null,
      receipt: null,
    });
    const { calls } = stubFetch(dataResponse(apiDistribution([pending]), 200, { ETag: '"8"' }));
    const { distribution, client } = setup();
    const result = await distribution.markPending(BIZ, PAYMENT);
    expect(result.lines[1]?.payments[0]).toMatchObject({ status: "pending", receipt: null });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/distribution-payments/${PAYMENT}/pending`,
      body: undefined,
    });
    expect(client.etags.get(DIST_PATH)).toBe('"8"');
  });
});
