import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogItemInput } from "../types";
import { createHttpCatalogRepository } from "./catalog";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CODE = "B1-01";

const setup = () => createHttpCatalogRepository(testClient());

/** CatalogAdminItemSchema. */
const itemFixture = (overrides: Record<string, unknown> = {}) => ({
  code: CODE,
  area: "legal",
  area_code: "B1",
  name: "Contrato de franquicia",
  owner: "Abogados",
  support: "SM",
  applies: "Todos",
  priority: "Alta",
  acceptance: "Contrato firmado y revisado",
  start_day: 10,
  due_day: 40,
  archived: false,
  updated_at: "2026-10-10T12:00:00.000Z",
  ...overrides,
});

const input: CatalogItemInput = {
  area_code: "B1",
  name: "Contrato de franquicia",
  owner: "Abogados",
  support: "SM",
  applies: "Todos",
  priority: "Alta",
  acceptance: "Contrato firmado y revisado",
  start_day: 10,
  due_day: 40,
};

describe("http catalog", () => {
  it("list: GET /catalog; include_archived=true only when asked", async () => {
    const { calls } = stubFetch(dataResponse([itemFixture()]), dataResponse([]));
    const catalog = setup();
    expect(await catalog.list()).toEqual([itemFixture()]);
    await catalog.list({ include_archived: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /catalog",
      "GET /catalog?include_archived=true",
    ]);
  });

  it("add: POST /catalog with the entry", async () => {
    const { calls } = stubFetch(dataResponse(itemFixture({ code: "B1-12" }), 201));
    expect(await setup().add(input)).toEqual(itemFixture({ code: "B1-12" }));
    expect(calls[0]).toMatchObject({ method: "POST", path: "/catalog", body: input });
  });

  it("update: PATCH /catalog/{code} with the changed fields and the note", async () => {
    const { calls } = stubFetch(dataResponse(itemFixture({ due_day: 45 })));
    expect(await setup().update(CODE, { due_day: 45 }, "Más tiempo")).toEqual(
      itemFixture({ due_day: 45 }),
    );
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/catalog/${CODE}`,
      body: { due_day: 45, note: "Más tiempo" },
    });
  });

  it("update: changing the area answers the API's code", async () => {
    stubFetch(problemResponse(422, "area_locked"));
    await expect(setup().update(CODE, { area_code: "B2" })).rejects.toThrow("area_locked");
  });

  it("archive: POST /catalog/{code}/archive with the reason", async () => {
    const { calls } = stubFetch(dataResponse(itemFixture({ archived: true })));
    expect(await setup().archive(CODE, "Ya no aplica")).toMatchObject({ archived: true });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/catalog/${CODE}/archive`,
      body: { reason: "Ya no aplica" },
    });
  });

  it("restore: POST /catalog/{code}/restore", async () => {
    const { calls } = stubFetch(dataResponse(itemFixture()));
    expect(await setup().restore(CODE)).toEqual(itemFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/catalog/${CODE}/restore`,
      body: undefined,
    });
  });

  it("listHistory: GET /catalog/history, all or one entry", async () => {
    const change = {
      id: IDS.event,
      code: CODE,
      kind: "edited",
      actor_user_id: IDS.marilyn,
      created_at: "2026-10-18T12:00:00.000Z",
      changes: [{ field: "due_day", from: 40, to: 45 }],
      note: "Más tiempo",
    };
    const { calls } = stubFetch(dataResponse([change]), dataResponse([change]));
    const catalog = setup();
    expect(await catalog.listHistory()).toEqual([change]);
    await catalog.listHistory(CODE);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /catalog/history",
      `GET /catalog/history?code=${CODE}`,
    ]);
  });
});
