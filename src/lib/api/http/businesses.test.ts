import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpBusinessesRepository } from "./businesses";
import {
  IDS,
  businessFixture,
  dataResponse,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => {
  const client = testClient();
  return { client, businesses: createHttpBusinessesRepository(client) };
};

const NICOLAS = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("http businesses", () => {
  it("list: GET /businesses", async () => {
    const { calls } = stubFetch(dataResponse([businessFixture()]));
    expect(await setup().businesses.list()).toEqual([businessFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/businesses" });
  });

  it("getFranchisability (gap): rejects with not_implemented without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(setup().businesses.getFranchisability(IDS.business)).rejects.toThrow(
      "not_implemented",
    );
    expect(calls).toHaveLength(0);
  });

  it("listEvents: GET /businesses/{id}/events, consultant changes only, in the front's shape", async () => {
    const base = {
      business_id: IDS.business,
      actor_user_id: IDS.andrea,
      created_at: "2026-10-01T12:00:00.000Z",
    };
    const { calls } = stubFetch(
      dataResponse([
        {
          ...base,
          id: IDS.event,
          kind: "consultant_changed",
          from_user_id: IDS.andrea,
          to_user_id: NICOLAS,
          from_status: null,
          to_status: null,
        },
        {
          ...base,
          id: IDS.zone,
          kind: "status_changed",
          from_user_id: null,
          to_user_id: null,
          from_status: "onboarding",
          to_status: "in_program",
        },
      ]),
    );
    expect(await setup().businesses.listEvents(IDS.business)).toEqual([
      {
        ...base,
        id: IDS.event,
        kind: "consultant_changed",
        from_user_id: IDS.andrea,
        to_user_id: NICOLAS,
      },
    ]);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/events` });
  });

  it("setConsultant: reads the business for its ETag, then PATCH /consultant with If-Match", async () => {
    const updated = businessFixture({ consultant_id: NICOLAS });
    const { calls } = stubFetch(
      dataResponse(businessFixture(), 200, { ETag: '"3"' }),
      dataResponse(updated, 200, { ETag: '"4"' }),
      dataResponse(businessFixture(), 200, { ETag: '"5"' }),
    );
    const { businesses, client } = setup();
    expect(await businesses.setConsultant(IDS.business, NICOLAS)).toEqual(updated);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}` });
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      path: `/businesses/${IDS.business}/consultant`,
      body: { user_id: NICOLAS },
    });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    // Known ETag: no second read.
    await businesses.setConsultant(IDS.business, IDS.andrea);
    expect(calls[2]).toMatchObject({ method: "PATCH" });
    expect(calls[2]?.headers["If-Match"]).toBe('"4"');
    expect(client.etags.get(`/businesses/${IDS.business}`)).toBe('"5"');
  });

  it("setConsultant: a stale version is precondition_failed", async () => {
    stubFetch(problemResponse(412, "precondition_failed"));
    const { businesses, client } = setup();
    client.etags.set(`/businesses/${IDS.business}`, '"1"');
    await expect(businesses.setConsultant(IDS.business, NICOLAS)).rejects.toThrow(
      "precondition_failed",
    );
  });
});
