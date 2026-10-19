import { afterEach, describe, expect, it, vi } from "vitest";
import { authErrorCode } from "@/lib/auth/form";
import {
  ApiError,
  createHttpClient,
  listAllByCursor,
  listAllByPage,
  newUuid,
  resourceKey,
} from "./client";
import { onSessionExpired } from "./session-events";
import {
  TEST_BASE_URL,
  dataResponse,
  emptyResponse,
  jsonResponse,
  problemResponse,
  stubFetch,
  testClient,
  userFixture,
} from "./testing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("http client: requests and envelopes", () => {
  it("unwraps { data }, sends cookies, JSON, Accept-Language and a fresh X-Request-Id per call", async () => {
    const { calls } = stubFetch(dataResponse([userFixture()]), dataResponse([]));
    const client = testClient();
    const users = await client.get<unknown[]>("/users", {
      query: { include_inactive: "true", role: undefined },
    });
    await client.get("/users");
    expect(users).toEqual([userFixture()]);
    expect(calls[0]?.url).toBe(`${TEST_BASE_URL}/users?include_inactive=true`);
    expect(calls[0]?.headers["Accept-Language"]).toBe("es");
    expect(calls[0]?.headers["X-Request-Id"]).toMatch(UUID);
    expect(calls[1]?.headers["X-Request-Id"]).not.toBe(calls[0]?.headers["X-Request-Id"]);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
  });

  it("sends the body as JSON with its content type", async () => {
    const { calls } = stubFetch(dataResponse({ ok: true }, 201));
    await testClient().post("/firms", { name: "Delta" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.body).toEqual({ name: "Delta" });
  });

  it("204 and an empty 202 resolve to undefined", async () => {
    stubFetch(emptyResponse(204), emptyResponse(202));
    const client = testClient();
    await expect(client.delete("/routing/rules/x")).resolves.toBeUndefined();
    await expect(client.post("/auth/magic-link", { email: "a@b.co" })).resolves.toBeUndefined();
  });

  it("defaults the base URL to the local API", () => {
    expect(createHttpClient().baseUrl).toBe("http://localhost:3100/api/v1");
  });

  it("generates RFC 4122 v4 ids on demand", () => {
    expect(newUuid()).toMatch(UUID);
    expect(resourceKey("businesses/1/?x=1")).toBe("/businesses/1");
  });
});

describe("http client: errors", () => {
  it("problem details become an ApiError whose message is the code (the screens' contract)", async () => {
    stubFetch(
      problemResponse(422, "validation_failed", {
        errors: [{ path: "first_person.email", message: "Invalid email", code: "invalid_format" }],
      }),
    );
    const error = await testClient()
      .post("/firms", {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.message).toBe("validation_failed");
    expect(apiError.code).toBe("validation_failed");
    expect(apiError.status).toBe(422);
    expect(apiError.detail).toBe("Problem validation_failed.");
    expect(apiError.requestId).toBe("req-123");
    expect(apiError.errors).toEqual([
      { path: "first_person.email", message: "Invalid email", code: "invalid_format" },
    ]);
  });

  it("the auth codes reach authErrorCode unchanged", async () => {
    stubFetch(problemResponse(401, "invalid_credentials"));
    const error = await testClient()
      .post("/auth/login", { email: "x", password: "y" })
      .catch((e: unknown) => e);
    expect(authErrorCode(error)).toBe("invalid_credentials");
  });

  it("a problem without a code falls back to the status text", async () => {
    stubFetch(new Response("oops", { status: 503, statusText: "Service Unavailable" }));
    await expect(testClient().get("/users")).rejects.toMatchObject({
      code: "service_unavailable",
      status: 503,
    });
  });

  it("a network failure is network_error with status 0", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    await expect(testClient().get("/users")).rejects.toMatchObject({
      code: "network_error",
      status: 0,
      message: "network_error",
    });
  });
});

describe("http client: 401 signals an expired session", () => {
  it("401 outside /auth/* emits the signal once and forgets the session user; /auth/* never emits", async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    stubFetch(problemResponse(401, "unauthenticated"), problemResponse(401, "invalid_credentials"));
    const client = testClient();
    client.setSession(userFixture() as never);
    await expect(client.get("/users")).rejects.toThrow("unauthenticated");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(client.session().user).toBeNull();
    await expect(client.post("/auth/login", { email: "a", password: "b" })).rejects.toThrow(
      "invalid_credentials",
    );
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("http client: ETag and If-Match", () => {
  it("stores the ETag of a GET and sends it as If-Match on a mutation of the same resource", async () => {
    const { calls } = stubFetch(
      dataResponse({ id: "b1" }, 200, { ETag: '"3"' }),
      dataResponse({ id: "b1" }, 200, { ETag: '"4"' }),
      dataResponse({ id: "b1" }, 200),
    );
    const client = testClient();
    await client.get("/businesses/b1");
    expect(client.etags.get("/businesses/b1")).toBe('"3"');
    await client.patch(
      "/businesses/b1/consultant",
      { user_id: "u" },
      { resource: "/businesses/b1" },
    );
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    // The mutation's answer carries the new version, kept for the next write.
    expect(client.etags.get("/businesses/b1")).toBe('"4"');
    await client.patch("/businesses/b1", { name: "x" });
    expect(calls[2]?.headers["If-Match"]).toBe('"4"');
  });

  it("GETs never send If-Match and unknown resources go without it", async () => {
    const { calls } = stubFetch(dataResponse({}), dataResponse({}));
    const client = testClient();
    client.etags.set("/businesses/b1", '"1"');
    await client.get("/businesses/b1");
    await client.patch("/firms/f1", {});
    expect(calls[0]?.headers["If-Match"]).toBeUndefined();
    expect(calls[1]?.headers["If-Match"]).toBeUndefined();
  });

  it("412 is precondition_failed whatever the problem says", async () => {
    stubFetch(problemResponse(412, "stale_version"));
    const client = testClient();
    client.etags.set("/businesses/b1", '"1"');
    await expect(
      client.patch("/businesses/b1/consultant", {}, { resource: "/businesses/b1" }),
    ).rejects.toMatchObject({
      code: "precondition_failed",
      status: 412,
      message: "precondition_failed",
    });
  });

  it("a new session forgets every ETag", () => {
    const client = testClient();
    client.etags.set("/businesses/b1", '"1"');
    client.setSession(null);
    expect(client.etags.size).toBe(0);
  });
});

describe("http client: Idempotency-Key", () => {
  it("an idempotent POST retries a network failure once with the same key", async () => {
    const { calls } = stubFetch(new TypeError("Failed to fetch"), dataResponse({ id: "u1" }, 201));
    const result = await testClient().post(
      "/users/invite",
      { email: "a@b.co" },
      { idempotent: true },
    );
    expect(result).toEqual({ id: "u1" });
    expect(calls).toHaveLength(2);
    const key = calls[0]?.headers["Idempotency-Key"];
    expect(key).toMatch(UUID);
    expect(calls[1]?.headers["Idempotency-Key"]).toBe(key);
    // The request id is per HTTP call, the idempotency key per logical attempt.
    expect(calls[1]?.headers["X-Request-Id"]).not.toBe(calls[0]?.headers["X-Request-Id"]);
  });

  it("only one retry: a second network failure is network_error", async () => {
    const { calls } = stubFetch(new TypeError("down"), new TypeError("down"));
    await expect(
      testClient().post("/users/invite", {}, { idempotent: true }),
    ).rejects.toMatchObject({ code: "network_error" });
    expect(calls).toHaveLength(2);
  });

  it("each logical POST gets its own key; non idempotent POSTs send none and never retry", async () => {
    const { calls } = stubFetch(dataResponse({}), dataResponse({}), new TypeError("down"));
    const client = testClient();
    await client.post("/firms", {}, { idempotent: true });
    await client.post("/firms", {}, { idempotent: true });
    expect(calls[0]?.headers["Idempotency-Key"]).not.toBe(calls[1]?.headers["Idempotency-Key"]);
    await expect(client.post("/users/u1/deactivate", { reason: "x" })).rejects.toMatchObject({
      code: "network_error",
    });
    expect(calls[2]?.headers["Idempotency-Key"]).toBeUndefined();
    expect(calls).toHaveLength(3);
  });
});

describe("http client: pagination helpers return the flat arrays the repositories promise", () => {
  it("a plain { data } list is one page", async () => {
    const { calls } = stubFetch(dataResponse([1, 2]));
    expect(await listAllByCursor<number>(testClient(), "/firm-events")).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it("cursor: follows meta.next_cursor and links.next until the end", async () => {
    const { calls } = stubFetch(
      jsonResponse({ data: [1, 2], meta: { next_cursor: "c2" } }),
      jsonResponse({ data: [3], links: { next: "/api/v1/notifications?cursor=c3" } }),
      jsonResponse({ data: [4], meta: { next_cursor: null }, links: { next: null } }),
    );
    expect(await listAllByCursor<number>(testClient(), "/notifications", { kind: "x" })).toEqual([
      1, 2, 3, 4,
    ]);
    expect(calls.map((c) => c.path)).toEqual([
      "/notifications?kind=x",
      "/notifications?kind=x&cursor=c2",
      "/notifications?kind=x&cursor=c3",
    ]);
  });

  it("offset: pages until meta.last_page", async () => {
    const { calls } = stubFetch(
      jsonResponse({
        data: ["a", "b"],
        meta: { current_page: 1, last_page: 2, per_page: 2, total: 3 },
      }),
      jsonResponse({ data: ["c"], meta: { current_page: 2, last_page: 2, per_page: 2, total: 3 } }),
    );
    expect(await listAllByPage<string>(testClient(), "/users")).toEqual(["a", "b", "c"]);
    expect(calls.map((c) => c.path)).toEqual(["/users", "/users?page=2"]);
  });
});
