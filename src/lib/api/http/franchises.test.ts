import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpFranchisesRepository } from "./franchises";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FRANCHISE = IDS.member;

const franchises = () => createHttpFranchisesRepository(testClient());

/** FranchiseReportSchema (trimmed). */
const reportFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.event,
  franchise_id: FRANCHISE,
  month: "2026-09",
  gross_sales: 42000,
  status: "submitted",
  ...overrides,
});

describe("http franchises", () => {
  it("list: GET /franchises, franchisor_business_id only when given", async () => {
    const unit = { franchise: { id: FRANCHISE }, health: "green" };
    const { calls } = stubFetch(dataResponse([unit]), dataResponse([]));
    const repo = franchises();
    expect(await repo.list()).toEqual([unit]);
    await repo.list(IDS.business);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /franchises",
      `GET /franchises?franchisor_business_id=${IDS.business}`,
    ]);
  });

  it("get: GET /franchises/{id}; 404 is null", async () => {
    const detail = { franchise: { id: FRANCHISE }, reports: [], checklist: [], tickets: [] };
    const { calls } = stubFetch(dataResponse(detail), problemResponse(404, "not_found"));
    const repo = franchises();
    expect(await repo.get(FRANCHISE)).toEqual(detail);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/franchises/${FRANCHISE}` });
    expect(await repo.get(IDS.newFirm)).toBeNull();
  });

  it("getFranchisorSummary: GET /franchisor/summary, business_id only when given", async () => {
    const summary = { units: 4, royalties: 1200 };
    const { calls } = stubFetch(dataResponse(summary), dataResponse(summary));
    const repo = franchises();
    expect(await repo.getFranchisorSummary()).toEqual(summary);
    await repo.getFranchisorSummary(IDS.business);
    expect(calls.map((c) => c.path)).toEqual([
      "/franchisor/summary",
      `/franchisor/summary?business_id=${IDS.business}`,
    ]);
  });

  it("listReports: one unit (GET /franchises/{id}/reports) or every unit (GET /franchise-reports)", async () => {
    const { calls } = stubFetch(dataResponse([reportFixture()]), dataResponse([reportFixture()]));
    const repo = franchises();
    expect(await repo.listReports(FRANCHISE)).toEqual([reportFixture()]);
    expect(await repo.listReports()).toEqual([reportFixture()]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /franchises/${FRANCHISE}/reports`,
      "GET /franchise-reports",
    ]);
  });

  it("submitReport: POST /franchises/{id}/reports { month, gross_sales }", async () => {
    const { calls } = stubFetch(dataResponse(reportFixture(), 201));
    expect(
      await franchises().submitReport(FRANCHISE, { month: "2026-09", gross_sales: 42000 }),
    ).toEqual(reportFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/franchises/${FRANCHISE}/reports`,
      body: { month: "2026-09", gross_sales: 42000 },
    });
  });

  it("submitReport: a month that is not due comes back as the API's code", async () => {
    stubFetch(problemResponse(409, "report_not_due"));
    await expect(
      franchises().submitReport(FRANCHISE, { month: "2027-01", gross_sales: 1 }),
    ).rejects.toThrow("report_not_due");
  });

  it("listTickets: GET /tickets", async () => {
    const ticket = { id: IDS.request, franchise_id: FRANCHISE, subject: "Pedido", state: "open" };
    const { calls } = stubFetch(dataResponse([ticket]));
    expect(await franchises().listTickets()).toEqual([ticket]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/tickets" });
  });
});
