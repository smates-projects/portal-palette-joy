import { afterEach, describe, expect, it, vi } from "vitest";
import { HTTP_REPOSITORY_KEYS, resolveRepositoryModes } from "./index";
import { createHttpRoutingRepository } from "./routing";
import { IDS, dataResponse, emptyResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => createHttpRoutingRepository(testClient());

const zone = { id: IDS.zone, state: "FL", city: "Orlando", office_id: IDS.office };
const rules = { zones: [zone], default_office_id: IDS.office };

describe("http routing", () => {
  it("getRules: GET /routing", async () => {
    const { calls } = stubFetch(dataResponse(rules));
    expect(await setup().getRules()).toEqual(rules);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/routing" });
  });

  it("setRule: POST /routing/rules, with the id only when updating", async () => {
    const { calls } = stubFetch(dataResponse(zone, 201), dataResponse(zone, 201));
    const repo = setup();
    expect(await repo.setRule({ state: "FL", city: "Orlando", office_id: IDS.office })).toEqual(
      zone,
    );
    await repo.setRule({ id: IDS.zone, state: "FL", city: null, office_id: IDS.office });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/routing/rules",
      body: { state: "FL", city: "Orlando", office_id: IDS.office },
    });
    expect(calls[1]?.body).toEqual({
      id: IDS.zone,
      state: "FL",
      city: null,
      office_id: IDS.office,
    });
  });

  it("removeRule: DELETE /routing/rules/{id} (204)", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    await expect(setup().removeRule(IDS.zone)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `/routing/rules/${IDS.zone}` });
  });

  it("setDefaultOffice: PATCH /routing/default-office", async () => {
    const { calls } = stubFetch(dataResponse(rules));
    expect(await setup().setDefaultOffice(IDS.office)).toEqual(rules);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/routing/default-office",
      body: { office_id: IDS.office },
    });
  });
});

describe("repository selection (VITE_API_MODE and VITE_API_MODE_<REPO>)", () => {
  it("no variables: every repository on the mock (Lovable)", () => {
    const modes = resolveRepositoryModes({});
    expect(HTTP_REPOSITORY_KEYS.every((key) => modes[key] === "mock")).toBe(true);
  });

  it("a per-repository override wins over the default, both ways", () => {
    expect(resolveRepositoryModes({ VITE_API_MODE_SESSION: "http" })).toMatchObject({
      session: "http",
      users: "mock",
      businessProfile: "mock",
    });
    expect(
      resolveRepositoryModes({ VITE_API_MODE: "http", VITE_API_MODE_BUSINESS_PROFILE: "mock" }),
    ).toMatchObject({
      session: "http",
      routing: "http",
      businessProfile: "mock",
    });
  });

  it("phase 3 repositories have their own override", () => {
    expect(
      resolveRepositoryModes({
        VITE_API_MODE_BISHOP: "http",
        VITE_API_MODE_FUNDS: "http",
        VITE_API_MODE_DISTRIBUTION: "http",
        VITE_API_MODE_RULES: "http",
        VITE_API_MODE_CATALOG: "http",
      }),
    ).toMatchObject({
      bishop: "http",
      funds: "http",
      distribution: "http",
      rules: "http",
      catalog: "http",
      leads: "mock",
    });
  });

  it("unknown values fall back to the mock", () => {
    expect(
      resolveRepositoryModes({ VITE_API_MODE: "laravel", VITE_API_MODE_USERS: " HTTP " }),
    ).toMatchObject({ session: "mock", users: "http" });
  });
});
