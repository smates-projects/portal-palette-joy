import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpBusinessesRepository } from "./businesses";
import {
  IDS,
  businessFixture,
  dataResponse,
  jsonResponse,
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

  it("getFranchisability: GET /businesses/{id}/franchisability", async () => {
    const franchisability = {
      business_id: IDS.business,
      franchisability_pct: 64,
      franchisability_goal: 80,
      required_task_codes: ["B1-01", "B6-01"],
      missing_required: ["B6-01"],
      is_ready: false,
    };
    const { calls } = stubFetch(dataResponse(franchisability));
    expect(await setup().businesses.getFranchisability(IDS.business)).toEqual(franchisability);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/businesses/${IDS.business}/franchisability`,
    });
  });

  it("listEvents: GET /businesses/{id}/events, every page, consultant changes by a person only", async () => {
    const base = {
      business_id: IDS.business,
      actor_user_id: IDS.andrea,
      created_at: "2026-10-01T12:00:00.000Z",
      from_status: null,
      to_status: null,
      from_user_id: null,
      to_user_id: null,
    };
    const { calls } = stubFetch(
      jsonResponse({
        data: [
          {
            ...base,
            id: IDS.event,
            kind: "consultant_changed",
            from_user_id: IDS.andrea,
            to_user_id: NICOLAS,
          },
          {
            ...base,
            id: IDS.zone,
            kind: "status_changed",
            from_status: "onboarding",
            to_status: "in_program",
          },
          {
            ...base,
            id: IDS.member,
            kind: "task_event",
            task_id: IDS.request,
            task_code: "B1-01",
            task_event_kind: "submitted",
          },
        ],
        meta: { next_cursor: "c2" },
      }),
      jsonResponse({
        data: [
          {
            ...base,
            id: IDS.request,
            kind: "activity",
            activity_kind: "brand.set_by_sm",
            subject_type: "brand",
            subject_id: IDS.business,
            payload: {},
          },
          // A system assignment: the front's BusinessEvent needs a person as actor.
          {
            ...base,
            id: IDS.newFirm,
            kind: "consultant_changed",
            actor_user_id: null,
            to_user_id: NICOLAS,
          },
        ],
        meta: { next_cursor: null },
      }),
    );
    expect(await setup().businesses.listEvents(IDS.business)).toEqual([
      {
        id: IDS.event,
        business_id: IDS.business,
        kind: "consultant_changed",
        actor_user_id: IDS.andrea,
        from_user_id: IDS.andrea,
        to_user_id: NICOLAS,
        created_at: "2026-10-01T12:00:00.000Z",
      },
    ]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /businesses/${IDS.business}/events?limit=200`,
      `GET /businesses/${IDS.business}/events?limit=200&cursor=c2`,
    ]);
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
