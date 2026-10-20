import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import { createHttpFinancialsRepository } from "./financials";
import { IDS, dataResponse, stubFetch, testClient, userFixture } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OWNER = userFixture({
  id: IDS.carla,
  role: "business_owner",
  organization_id: null,
  business_id: IDS.business,
  is_admin: false,
});

const as = (user: Record<string, unknown>) => {
  const client = testClient();
  client.setSession(user as unknown as User);
  return createHttpFinancialsRepository(client);
};

/** FinancialSeriesSchema (trimmed). */
const series = { business_id: IDS.business, months: ["2026-08", "2026-09"], revenue: [10, 12] };

describe("http financials", () => {
  it("get with a business: GET /businesses/{id}/financials", async () => {
    const { calls } = stubFetch(dataResponse(series));
    expect(await as(userFixture()).get(IDS.business)).toEqual(series);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/businesses/${IDS.business}/financials`,
    });
  });

  it("get without a business: the owner's own business; null while it has no series", async () => {
    const { calls } = stubFetch(dataResponse(null));
    expect(await as(OWNER).get()).toBeNull();
    expect(calls[0]?.path).toBe(`/businesses/${IDS.business}/financials`);
  });

  it("get without a business for a person without one: null, without calling", async () => {
    const { calls } = stubFetch();
    expect(await as(userFixture({ business_id: null })).get()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
