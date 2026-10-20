import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpManualRepository } from "./manual";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SECTION = IDS.member;

const manual = () => createHttpManualRepository(testClient());

/** ManualOverviewSchema (trimmed). */
const overview = { business_id: IDS.business, sections: [], versions: [], events: [] };

describe("http manual", () => {
  it("get without a business: GET /manual (the caller's own)", async () => {
    const { calls } = stubFetch(dataResponse(overview));
    expect(await manual().get()).toEqual(overview);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/manual" });
  });

  it("get with a business: GET /businesses/{id}/manual", async () => {
    const { calls } = stubFetch(dataResponse(overview));
    expect(await manual().get(IDS.business)).toEqual(overview);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/manual` });
  });

  it("publish: POST /businesses/{id}/manual/publish { note, section_ids }", async () => {
    const version = { id: IDS.event, business_id: IDS.business, number: 2, note: "Ajustes" };
    const { calls } = stubFetch(dataResponse(version, 201));
    const input = { note: "Ajustes", section_ids: [SECTION] };
    expect(await manual().publish(IDS.business, input)).toEqual(version);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/businesses/${IDS.business}/manual/publish`,
      body: input,
    });
  });

  it("approveSection: POST /manual-sections/{id}/approve", async () => {
    const section = { id: SECTION, status: "approved" };
    const { calls } = stubFetch(dataResponse(section));
    expect(await manual().approveSection(SECTION)).toEqual(section);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/manual-sections/${SECTION}/approve`,
      body: undefined,
    });
  });

  it("approveSection: a section with tasks still open comes back as the API's code", async () => {
    stubFetch(problemResponse(409, "section_not_ready"));
    await expect(manual().approveSection(SECTION)).rejects.toThrow("section_not_ready");
  });
});
