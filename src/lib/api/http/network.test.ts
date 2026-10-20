import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpNetworkRepository } from "./network";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const network = () => createHttpNetworkRepository(testClient());

/** OfficeSummarySchema (trimmed to what the adapter passes through). */
const officeFixture = (overrides: Record<string, unknown> = {}) => ({
  office: {
    id: IDS.office,
    name: "SM Orlando",
    city: "Orlando",
    office_status: "operating",
    ...overrides,
  },
  manager: null,
  stats: { businesses: 4, leads: 9 },
});

describe("http network: reads", () => {
  it("getSummary: GET /network/summary", async () => {
    const summary = { offices: 3, businesses: 12 };
    const { calls } = stubFetch(dataResponse(summary));
    expect(await network().getSummary()).toEqual(summary);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/network/summary" });
  });

  it("listOffices: GET /network/offices", async () => {
    const { calls } = stubFetch(dataResponse([officeFixture()]));
    expect(await network().listOffices()).toEqual([officeFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/network/offices" });
  });

  it("getOffice: GET /network/offices/{id}; 404 is null", async () => {
    const detail = { office: officeFixture(), businesses: [] };
    const { calls } = stubFetch(dataResponse(detail), problemResponse(404, "not_found"));
    const repo = network();
    expect(await repo.getOffice(IDS.office)).toEqual(detail);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/network/offices/${IDS.office}` });
    expect(await repo.getOffice(IDS.newFirm)).toBeNull();
  });

  it("getStructure: GET /network/structure", async () => {
    const tree = { root: { id: IDS.global, children: [] } };
    const { calls } = stubFetch(dataResponse(tree));
    expect(await network().getStructure()).toEqual(tree);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/network/structure" });
  });

  it("listBottlenecks: GET /network/bottlenecks", async () => {
    const bottlenecks = [{ area: "B1", overdue: 4 }];
    const { calls } = stubFetch(dataResponse(bottlenecks));
    expect(await network().listBottlenecks()).toEqual(bottlenecks);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/network/bottlenecks" });
  });

  it("getFunnel: GET /network/funnel", async () => {
    const funnel = { overall: [], offices: [] };
    const { calls } = stubFetch(dataResponse(funnel));
    expect(await network().getFunnel()).toEqual(funnel);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/network/funnel" });
  });

  it("a read outside SM Global comes back as the API's forbidden", async () => {
    stubFetch(problemResponse(403, "forbidden"));
    await expect(network().getSummary()).rejects.toThrow("forbidden");
  });
});

describe("http network: offices", () => {
  const input = {
    city: "Tampa",
    manager_name: "Paula Ríos",
    manager_email: "paula@strategicmates.com",
    planned_opening_date: "2026-12-01",
  };

  it("createOffice: POST /offices with the office and an Idempotency-Key", async () => {
    const created = officeFixture({ city: "Tampa", office_status: "opening" });
    const { calls } = stubFetch(dataResponse(created, 201));
    expect(await network().createOffice(input)).toEqual(created);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/offices", body: input });
    expect(calls[0]?.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("createOffice: the retry of a network failure reuses the same Idempotency-Key", async () => {
    const { calls } = stubFetch(
      new TypeError("Failed to fetch"),
      dataResponse(officeFixture(), 201),
    );
    await network().createOffice(input);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers["Idempotency-Key"]).toBe(calls[0]?.headers["Idempotency-Key"]);
  });

  it("pauseOffice: POST /offices/{id}/pause with the reason", async () => {
    const paused = officeFixture({ office_status: "paused" });
    const { calls } = stubFetch(dataResponse(paused));
    expect(await network().pauseOffice(IDS.office, "Cambio de gerente")).toEqual(paused);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/offices/${IDS.office}/pause`,
      body: { reason: "Cambio de gerente" },
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("activateOffice: POST /offices/{id}/activate; an incomplete checklist is the API's code", async () => {
    const { calls } = stubFetch(
      dataResponse(officeFixture()),
      problemResponse(409, "checklist_incomplete"),
    );
    const repo = network();
    expect(await repo.activateOffice(IDS.office)).toEqual(officeFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/offices/${IDS.office}/activate`,
      body: undefined,
    });
    await expect(repo.activateOffice(IDS.office)).rejects.toThrow("checklist_incomplete");
  });
});
