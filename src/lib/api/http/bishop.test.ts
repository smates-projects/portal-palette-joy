import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { createHttpBishopRepository } from "./bishop";
import {
  IDS,
  contractFixture,
  dataResponse,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OPP = IDS.request;
const OPP_PATH = `/opportunities/${OPP}`;

const setup = () => createHttpBishopRepository(testClient());

/** BishopOpportunitySchema: an available opportunity, names hidden until this Bishop accepts. */
const opportunityFixture = (overrides: Record<string, unknown> = {}) => ({
  id: OPP,
  lead_id: OPP,
  phase: "available",
  industry: "installations_repairs",
  city: "Miami",
  state: "FL",
  business_name: null,
  owner_name: null,
  investment: 150000,
  share_year1_pct: 50,
  share_stable_pct: 25,
  score: 78,
  band: "ready",
  review: null,
  decision: "none",
  decided_at: null,
  ...overrides,
});

/** OpportunityDetailSchema. */
const detailFixture = () => ({
  ...opportunityFixture(),
  declared: {
    industry: "installations_repairs",
    activity_other: null,
    activity: "Instalaciones eléctricas",
    revenue_range: "500k_750k",
    margin_range: "margin_21_40",
    team_range: "team_6_10",
    years_range: "years_6_10",
    has_active_clients: true,
  },
  result: { score: 78, band: "ready", blocks: [] },
  know_how_example: "Protocolo de instalación en 3 pasos",
  verified: [{ name: "Estados de cuenta bancarios", fact: "Ventas 2025: 640k" }],
  checklist: {
    nda_signed: true,
    mou_signed: true,
    required_total: 8,
    uploaded: 8,
    accepted: 8,
    approved: true,
  },
  projection: [{ year: 1, franchises: 2, revenue: 400000, result: 80000, bishop: 40000, sm: 0 }],
  files: [],
  tripartite: null,
});

/** BishopInvestmentSchema, with the API's own extras (funds_status, program_day). */
const investmentFixture = () => ({
  id: IDS.zone,
  bishop_user_id: IDS.lucia,
  business_id: IDS.business,
  business_name: "Vossler",
  invested: 150000,
  invested_at: "2026-08-02",
  recovered: 15000,
  recovered_pct: 10,
  current_share_pct: 50,
  estimated_payback_month: "2028-03",
  franchises: 2,
  recovery: [{ month: "2026-09", projected: 10000, actual: 15000 }],
  funds_status: "received",
  program_day: 74,
});

describe("http bishop", () => {
  it("listOpportunities: GET /opportunities, only the front's fields", async () => {
    const { calls } = stubFetch(dataResponse([opportunityFixture()]));
    const list = await setup().listOpportunities();
    expect(list).toEqual([opportunityFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/opportunities" });
  });

  it("listOpportunities: never passes on (or makes up) an owner's contact", async () => {
    stubFetch(
      dataResponse([
        opportunityFixture({ owner_email: "ramon@castillo.com", owner_phone: "+1 305" }),
      ]),
    );
    const [opportunity] = await setup().listOpportunities();
    expect(opportunity).toEqual(opportunityFixture());
    expect(opportunity).not.toHaveProperty("owner_email");
    expect(opportunity).not.toHaveProperty("owner_phone");
    expect(opportunity?.business_name).toBeNull();
    expect(opportunity?.owner_name).toBeNull();
  });

  it("getOpportunity: GET /opportunities/{id}", async () => {
    const { calls } = stubFetch(dataResponse(detailFixture()));
    expect(await setup().getOpportunity(OPP)).toEqual(detailFixture());
    expect(calls[0]).toMatchObject({ method: "GET", path: OPP_PATH });
  });

  it("getOpportunity: out of reach (404) is null", async () => {
    stubFetch(problemResponse(404, "not_found"));
    expect(await setup().getOpportunity(OPP)).toBeNull();
  });

  it("acceptOpportunity: POST /opportunities/{id}/accept without a body", async () => {
    const accepted = opportunityFixture({
      phase: "accepted_by_you",
      business_name: "Castillo Instalaciones",
      owner_name: "Ramón Castillo",
    });
    const { calls } = stubFetch(dataResponse(accepted));
    expect(await setup().acceptOpportunity(OPP)).toEqual(accepted);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${OPP_PATH}/accept`, body: undefined });
  });

  it.each(["taken", "framework_required", "not_available"])(
    "acceptOpportunity: 409 %s is an ApiError with that code",
    async (code) => {
      stubFetch(problemResponse(409, code));
      const error = await setup()
        .acceptOpportunity(OPP)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code, message: code, status: 409 });
    },
  );

  it("pass: POST /opportunities/{id}/pass", async () => {
    const passed = opportunityFixture({
      decision: "passed",
      decided_at: "2026-10-19T12:00:00.000Z",
    });
    const { calls } = stubFetch(dataResponse(passed));
    expect(await setup().pass(OPP)).toEqual(passed);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${OPP_PATH}/pass` });
  });

  it("clearDecision: POST /opportunities/{id}/clear", async () => {
    const { calls } = stubFetch(dataResponse(opportunityFixture()));
    expect(await setup().clearDecision(OPP)).toEqual(opportunityFixture());
    expect(calls[0]).toMatchObject({ method: "POST", path: `${OPP_PATH}/clear` });
  });

  it("listAgreements: GET /agreements", async () => {
    const framework = contractFixture({
      kind: "framework",
      name: "Acuerdo marco",
      business_id: null,
    });
    const agreement = {
      id: IDS.newFirm,
      kind: "framework",
      contract: framework,
      bishop_user_id: IDS.lucia,
      business_id: null,
      name: "Acuerdo marco",
      counterparties: "Strategic Mates",
      state: "sent",
      signed_at: null,
      has_file: true,
      file_name: null,
    };
    const { calls } = stubFetch(dataResponse([agreement]));
    expect(await setup().listAgreements()).toEqual([agreement]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/agreements" });
  });

  it("getPortfolio: GET /bishop/portfolio, without the API's funds_status and program_day", async () => {
    const totals = { invested: 150000, recovered: 15000, recovered_pct: 10 };
    const { calls } = stubFetch(dataResponse({ investments: [investmentFixture()], totals }));
    const portfolio = await setup().getPortfolio();
    const { funds_status: _status, program_day: _day, ...frontInvestment } = investmentFixture();
    expect(portfolio).toEqual({ investments: [frontInvestment], totals });
    expect(portfolio.investments[0]).not.toHaveProperty("funds_status");
    expect(portfolio.investments[0]).not.toHaveProperty("program_day");
    expect(calls[0]).toMatchObject({ method: "GET", path: "/bishop/portfolio" });
  });
});
