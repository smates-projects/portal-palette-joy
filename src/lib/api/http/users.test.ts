import { afterEach, describe, expect, it, vi } from "vitest";
import { isCalendarConsent } from "../repositories";
import type { User } from "../types";
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

  it("setGoogleCalendar connect: POST /me/calendar/connect answers Google's consent URL", async () => {
    const consent = { consent_url: "https://accounts.google.com/o/oauth2/v2/auth?state=abc" };
    const { calls } = stubFetch(dataResponse(consent));
    const answer = await setup().users.setGoogleCalendar("carla@gmail.com");
    expect(answer).toEqual(consent);
    expect(isCalendarConsent(answer)).toBe(true);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/me/calendar/connect",
      body: undefined,
    });
  });

  it("setGoogleCalendar disconnect: DELETE /me/calendar, the session user follows", async () => {
    const { calls } = stubFetch(dataResponse(userFixture({ google_calendar_email: null })));
    const { users, client } = setup();
    client.setSession(userFixture({ google_calendar_email: "andrea@gmail.com" }) as User);
    const answer = await users.setGoogleCalendar(null);
    expect(isCalendarConsent(answer)).toBe(false);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/me/calendar" });
    expect(client.session().user?.google_calendar_email).toBeNull();
  });

  it("listCalendarEvents: GET /me/calendar-events", async () => {
    const event = {
      id: IDS.event,
      user_id: IDS.andrea,
      title: "Dentista",
      starts_at: "2026-10-20T15:00:00.000Z",
      duration_minutes: 60,
    };
    const { calls } = stubFetch(dataResponse([event]));
    expect(await setup().users.listCalendarEvents()).toEqual([event]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/calendar-events" });
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
