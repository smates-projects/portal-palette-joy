import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import { createHttpBusinessFileRepository } from "./business-file";
import {
  IDS,
  dataResponse,
  leadFixture,
  problemResponse,
  stubFetch,
  testClient,
  userFixture,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => createHttpBusinessFileRepository(testClient());

const snapshot = {
  business_id: IDS.business,
  lead_id: IDS.request,
  taken_at: "2026-08-02T12:00:00.000Z",
  submitted_at: "2026-07-01T12:00:00.000Z",
  contact: leadFixture().contact,
  business: leadFixture().business,
  result: {
    readiness: "ready",
    band: null,
    score: null,
    eligible_program: true,
    eligibility_gaps: [],
    blocks: [{ key: "money", status: "strong" }],
    strengths: ["Equipo estable"],
    priorities: ["Procesos escritos"],
  },
  priorities: [{ text: "Procesos escritos", area: "B2" }],
  know_how_example: null,
};

const milestone = {
  id: "assessment",
  kind: "assessment",
  at: "2026-07-01T12:00:00.000Z",
  from: null,
  to: null,
  task_code: null,
  task_name: null,
};

describe("http business file", () => {
  it("getSnapshot: GET /businesses/{id}/snapshot", async () => {
    const { calls } = stubFetch(dataResponse(snapshot));
    expect(await setup().getSnapshot(IDS.business)).toEqual(snapshot);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/snapshot` });
  });

  it("getSnapshot: the owner's own business by default; null before the assessment existed", async () => {
    const { calls } = stubFetch(dataResponse(null));
    const client = testClient();
    client.setSession(userFixture({ role: "business_owner", business_id: IDS.business }) as User);
    expect(await createHttpBusinessFileRepository(client).getSnapshot()).toBeNull();
    expect(calls[0]?.path).toBe(`/businesses/${IDS.business}/snapshot`);
  });

  it("listMilestones: GET /businesses/{id}/milestones", async () => {
    const { calls } = stubFetch(dataResponse([milestone]));
    expect(await setup().listMilestones(IDS.business)).toEqual([milestone]);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/businesses/${IDS.business}/milestones`,
    });
  });

  it("listMilestones: a business out of reach (404) has none", async () => {
    stubFetch(problemResponse(404, "not_found"));
    expect(await setup().listMilestones(IDS.business)).toEqual([]);
  });
});
