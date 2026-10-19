import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpNotificationsRepository } from "./notifications";
import {
  IDS,
  dataResponse,
  emptyResponse,
  jsonResponse,
  notificationFixture,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => createHttpNotificationsRepository(testClient());

const preferences = [
  { kind: "due_today", in_app: true, email: false },
  { kind: "mentioned", in_app: true, email: true },
];

describe("http notifications", () => {
  it("list: GET /notifications, following the cursor until the end", async () => {
    const lead = notificationFixture({
      id: IDS.zone,
      kind: "lead_assessment",
      task_id: "",
      task_code: "",
      task_name: "",
      business_id: "",
      lead_id: IDS.request,
      lead_place: "Miami, FL",
    });
    const { calls } = stubFetch(
      jsonResponse({ data: [notificationFixture()], meta: { next_cursor: "n2" } }),
      jsonResponse({ data: [lead], meta: { next_cursor: null } }),
    );
    expect(await setup().list()).toEqual([notificationFixture(), lead]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /notifications?limit=100",
      "GET /notifications?limit=100&cursor=n2",
    ]);
  });

  it("markRead: POST /notifications/{id}/read (204)", async () => {
    const { calls } = stubFetch(emptyResponse());
    await expect(setup().markRead("due:B1-01:today")).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/notifications/due%3AB1-01%3Atoday/read",
    });
  });

  it("markAllRead: POST /notifications/read-all (204)", async () => {
    const { calls } = stubFetch(emptyResponse());
    await expect(setup().markAllRead()).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/notifications/read-all",
      body: undefined,
    });
  });

  it("getPreferences: GET /notifications/preferences", async () => {
    const { calls } = stubFetch(dataResponse(preferences));
    expect(await setup().getPreferences()).toEqual(preferences);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/notifications/preferences" });
  });

  it("setPreference: PATCH /notifications/preferences with { kind, channel, enabled }", async () => {
    const updated = [{ kind: "due_today", in_app: true, email: true }, preferences[1]];
    const { calls } = stubFetch(dataResponse(updated));
    expect(await setup().setPreference("due_today", "email", true)).toEqual(updated);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/notifications/preferences",
      body: { kind: "due_today", channel: "email", enabled: true },
    });
  });
});
