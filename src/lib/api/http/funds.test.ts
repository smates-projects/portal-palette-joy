import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpFundsRepository } from "./funds";
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
const PAYMENT = IDS.member;
const FILE_ID = IDS.zone;
const UPLOAD_URL = "https://storage.test/quarantine/receipt?X-Amz-Signature=sig";
const UPLOAD_HEADERS = { "Content-Type": "application/pdf" };

const setup = () => createHttpFundsRepository(testClient());

/** FundPaymentSchema as the API answers it: the receipt carries the stored file's id. */
const apiPayment = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT,
  business_id: BIZ,
  amount: 50000,
  paid_on: "2026-10-13",
  method: "wire",
  reference: "W-99",
  receipt: { file_name: "comprobante.pdf", size_kb: 120, file_id: FILE_ID },
  status: "reported",
  reported_by: "bishop",
  created_at: "2026-10-13T15:00:00.000Z",
  confirmed_at: null,
  ...overrides,
});

/** BishopFundsSchema. */
const apiFunds = (payments: unknown[] = [apiPayment()]) => ({
  business_id: BIZ,
  lead_id: IDS.request,
  business_name: "Vossler",
  bishop_user_id: IDS.lucia,
  bishop_name: "Lucía Pérez",
  total: 150000,
  received: 0,
  to_confirm: 50000,
  status: "pending",
  completed_on: null,
  payments,
  program_started: false,
});

/** The same funds as the front's type: the stored receipt's id and link beside the receipt, not inside it. */
const frontFunds = () => ({
  ...apiFunds([]),
  payments: [{ ...apiPayment(), receipt: { file_name: "comprobante.pdf", size_kb: 120 }, receipt_file_id: FILE_ID, receipt_url: null }],
});

const presigned = () =>
  dataResponse(
    {
      file_id: FILE_ID,
      upload_url: UPLOAD_URL,
      headers: UPLOAD_HEADERS,
      expires_at: "2026-10-19T12:05:00.000Z",
    },
    201,
  );

describe("http funds", () => {
  it("get: GET /businesses/{id}/funds, receipts without the API's file_id", async () => {
    const { calls } = stubFetch(dataResponse(apiFunds()));
    const funds = await setup().get(BIZ);
    expect(funds).toEqual(frontFunds());
    expect(funds?.payments[0]?.receipt).not.toHaveProperty("file_id");
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${BIZ}/funds` });
  });

  it("get: null before the tripartite contract is signed", async () => {
    stubFetch(dataResponse(null));
    expect(await setup().get(BIZ)).toBeNull();
  });

  it("listMine: GET /me/funds", async () => {
    const { calls } = stubFetch(dataResponse([apiFunds()]));
    expect(await setup().listMine()).toEqual([frontFunds()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/funds" });
  });

  it("recordPayment: POST /funds/payments with paid_on, whole USD and an Idempotency-Key; no receipt is null", async () => {
    const confirmed = apiPayment({ status: "confirmed", reported_by: "sm", receipt: null });
    const { calls } = stubFetch(dataResponse(apiFunds([confirmed]), 201));
    const funds = await setup().recordPayment(BIZ, {
      amount: 50000,
      paid_on: "2026-10-13",
      method: "wire",
      reference: "W-99",
      receipt: null,
    });
    expect(funds.payments[0]).toMatchObject({ status: "confirmed", receipt: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/businesses/${BIZ}/funds/payments`,
      body: {
        amount: 50000,
        paid_on: "2026-10-13",
        method: "wire",
        reference: "W-99",
        receipt_file_id: null,
      },
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("reportPayment: presign (fund_payment) → PUT → complete → payment with receipt_file_id, in this order", async () => {
    const { calls, fetchMock } = stubFetch(
      presigned(),
      emptyResponse(200),
      dataResponse({ id: FILE_ID, status: "pending" }, 202),
      dataResponse({ id: FILE_ID, status: "ready" }),
      dataResponse(apiFunds(), 201),
    );
    const file = new File(["%PDF-1.7 transferencia"], "comprobante.pdf", {
      type: "application/pdf",
    });

    expect(
      await setup().reportPayment(BIZ, {
        amount: 50000,
        paid_on: "2026-10-13",
        method: "wire",
        reference: "W-99",
        receipt: file,
      }),
    ).toEqual(frontFunds());

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `GET /files/${FILE_ID}`,
      `POST /businesses/${BIZ}/funds/payments`,
    ]);
    expect(calls[0]?.body).toEqual({
      context: "fund_payment",
      original_name: "comprobante.pdf",
      mime: "application/pdf",
      size_bytes: file.size,
      business_id: BIZ,
    });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(file);
    expect(calls[4]?.body).toMatchObject({ receipt_file_id: FILE_ID });
    expect(calls[4]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("reportPayment: a { file_name, size_kb } placeholder is invalid_file, without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(
      setup().reportPayment(BIZ, {
        amount: 50000,
        paid_on: "2026-10-13",
        method: "wire",
        reference: null,
        receipt: { file_name: "comprobante.pdf", size_kb: 120 },
      }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("recordPayment: over the program amount answers the API's code", async () => {
    stubFetch(problemResponse(422, "invalid_over_total"));
    await expect(
      setup().recordPayment(BIZ, {
        amount: 999999,
        paid_on: "2026-10-13",
        method: "wire",
        reference: null,
        receipt: null,
      }),
    ).rejects.toThrow("invalid_over_total");
  });

  it("confirmPayment: POST /fund-payments/{id}/confirm", async () => {
    const confirmed = apiPayment({ status: "confirmed", confirmed_at: "2026-10-14T12:00:00.000Z" });
    const { calls } = stubFetch(dataResponse(apiFunds([confirmed])));
    const funds = await setup().confirmPayment(BIZ, PAYMENT);
    expect(funds.payments[0]?.status).toBe("confirmed");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/fund-payments/${PAYMENT}/confirm`,
      body: undefined,
    });
  });

  it("removePayment: DELETE /fund-payments/{id}", async () => {
    const { calls } = stubFetch(dataResponse(apiFunds([])));
    expect((await setup().removePayment(BIZ, PAYMENT)).payments).toEqual([]);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `/fund-payments/${PAYMENT}` });
  });
});
