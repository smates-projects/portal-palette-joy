import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpUsersRepository } from "./users";
import { IDS, dataResponse, stubFetch, testClient, userFixture } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => {
  const client = testClient();
  return { client, users: createHttpUsersRepository(client) };
};

const accountEvent = (kind: string) => ({
  id: IDS.event,
  user_id: IDS.carla,
  kind,
  actor_user_id: IDS.andrea,
  created_at: "2026-10-01T12:00:00.000Z",
  body: null,
});

describe("http users", () => {
  it("list: GET /users, and include_inactive=true only when asked", async () => {
    const { calls } = stubFetch(dataResponse([userFixture()]), dataResponse([]));
    const { users } = setup();
    expect(await users.list()).toEqual([userFixture()]);
    await users.list({ include_inactive: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /users",
      "GET /users?include_inactive=true",
    ]);
  });

  it("invite: POST /users/invite with the invitation body and an Idempotency-Key", async () => {
    const invited = userFixture({ id: IDS.lucia, status: "invited" });
    const { calls } = stubFetch(dataResponse(invited, 201));
    const input = {
      full_name: "Lucía Pérez",
      email: "lucia@estudioperez.com",
      role: "partner_firm" as const,
      organization_id: IDS.firm,
      business_id: null,
      title: null,
      is_admin: true,
    };
    expect(await setup().users.invite(input)).toEqual(invited);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/users/invite", body: input });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("simulateAcceptance (gap): POST /users/{id}/resend-invitation", async () => {
    const { calls } = stubFetch(dataResponse(userFixture({ status: "invited" })));
    expect((await setup().users.simulateAcceptance(IDS.lucia)).status).toBe("invited");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/users/${IDS.lucia}/resend-invitation`,
    });
  });

  it("deactivate: POST /users/{id}/deactivate with the reason", async () => {
    const { calls } = stubFetch(
      dataResponse(userFixture({ status: "inactive", deactivation_reason: "Dejó la firma" })),
    );
    const user = await setup().users.deactivate(IDS.lucia, "Dejó la firma");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/users/${IDS.lucia}/deactivate`,
      body: { reason: "Dejó la firma" },
    });
    expect(user.status).toBe("inactive");
  });

  it("reactivate: POST /users/{id}/reactivate", async () => {
    const { calls } = stubFetch(dataResponse(userFixture()));
    expect((await setup().users.reactivate(IDS.lucia)).status).toBe("active");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/users/${IDS.lucia}/reactivate`,
      body: undefined,
    });
  });

  it("setAdmin: PATCH /users/{id}/admin with is_admin", async () => {
    const { calls } = stubFetch(dataResponse(userFixture({ is_admin: false })));
    expect((await setup().users.setAdmin(IDS.andrea, false)).is_admin).toBe(false);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/users/${IDS.andrea}/admin`,
      body: { is_admin: false },
    });
  });

  it("listAccountEvents: one person or everyone, without the API-only kinds", async () => {
    const { calls } = stubFetch(
      dataResponse([
        accountEvent("invited"),
        accountEvent("impersonation_started"),
        accountEvent("accepted"),
      ]),
      dataResponse([accountEvent("password_changed"), accountEvent("deactivated")]),
    );
    const { users } = setup();
    expect((await users.listAccountEvents(IDS.carla)).map((e) => e.kind)).toEqual([
      "invited",
      "accepted",
    ]);
    expect((await users.listAccountEvents()).map((e) => e.kind)).toEqual(["deactivated"]);
    expect(calls.map((c) => c.path)).toEqual([`/users/${IDS.carla}/events`, "/account-events"]);
  });

  it("setGoogleCalendar (gap): rejects with not_implemented without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(setup().users.setGoogleCalendar("carla@gmail.com")).rejects.toThrow(
      "not_implemented",
    );
    expect(calls).toHaveLength(0);
  });

  it("listCalendarEvents (gap): empty, as not connected", async () => {
    const { calls } = stubFetch();
    expect(await setup().users.listCalendarEvents()).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("setBookingUrl: PATCH /me/booking-url and the session user follows", async () => {
    const updated = userFixture({ booking_url: "https://calendar.app.google/abc" });
    const { calls } = stubFetch(dataResponse(updated));
    const { users, client } = setup();
    expect(await users.setBookingUrl("https://calendar.app.google/abc")).toEqual(updated);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/me/booking-url",
      body: { booking_url: "https://calendar.app.google/abc" },
    });
    expect(client.session().user?.booking_url).toBe("https://calendar.app.google/abc");
  });
});
