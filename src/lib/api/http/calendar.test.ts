import { afterEach, describe, expect, it, vi } from "vitest";
import { isCalendarConsent } from "../repositories";
import type { PortalMeeting } from "../types";
import { createHttpCalendarRepository } from "./calendar";
import { IDS, dataResponse, emptyResponse, problemResponse, stubFetch, testClient, userFixture } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const MEETING = IDS.zone;

const setup = () => {
  const client = testClient();
  return { client, calendar: createHttpCalendarRepository(client) };
};

/** PortalMeetingSchema: Andrea with Carla about Vossler, confirmed in Google, version 3. */
const meetingFixture = (overrides: Partial<PortalMeeting> = {}): PortalMeeting => ({
  id: MEETING,
  kind: "business",
  task_id: null,
  business_id: IDS.business,
  lead_id: null,
  topic: "Avance del programa",
  starts_at: "2026-10-20T15:00:00.000Z",
  ends_at: "2026-10-20T15:30:00.000Z",
  meet_url: "https://meet.google.com/abc-defg-hij",
  organizer: { user_id: IDS.andrea, name: "Andrea Salazar" },
  participants: [
    { user_id: IDS.andrea, name: "Andrea Salazar", response: "accepted" },
    { user_id: IDS.carla, name: "Carla Méndez", response: "needsAction" },
  ],
  status: "confirmed",
  google_synced: true,
  version: 3,
  ...overrides,
});

const connection = { connected: true, email: "andrea@gmail.com", scope: "calendar.events", status: "connected" };

describe("http calendar", () => {
  it("getConnection: GET /me/calendar", async () => {
    const { calls } = stubFetch(dataResponse(connection));
    expect(await setup().calendar.getConnection()).toEqual(connection);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/calendar" });
  });

  it("connect: POST /me/calendar/connect answers Google's consent URL", async () => {
    const consent = { consent_url: "https://accounts.google.com/o/oauth2/v2/auth?state=abc" };
    const { calls } = stubFetch(dataResponse(consent));
    const answer = await setup().calendar.connect();
    expect(isCalendarConsent(answer)).toBe(true);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/me/calendar/connect", body: undefined });
  });

  it("disconnect: DELETE /me/calendar, the session user follows", async () => {
    const { calls } = stubFetch(dataResponse(userFixture({ google_calendar_email: null, calendar_connected: false })));
    const { calendar, client } = setup();
    expect(await calendar.disconnect()).toMatchObject({ connected: false, status: "not_connected" });
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/me/calendar" });
    expect(client.session().user?.calendar_connected).toBe(false);
  });

  it("getUserStatus: GET /users/{id}/calendar-status", async () => {
    const { calls } = stubFetch(dataResponse({ ...connection, email: "carla@gmail.com" }));
    expect((await setup().calendar.getUserStatus(IDS.carla)).email).toBe("carla@gmail.com");
    expect(calls[0]).toMatchObject({ method: "GET", path: `/users/${IDS.carla}/calendar-status` });
  });

  it("availability: POST /calendar/availability with the people, the window and the length", async () => {
    const answer = { slots: [{ starts_at: "2026-10-20T15:00:00.000Z", ends_at: "2026-10-20T15:30:00.000Z" }], unavailable_participants: [{ user_id: IDS.lucia, reason: "calendar_not_connected" }] };
    const { calls } = stubFetch(dataResponse(answer));
    const input = { participant_user_ids: [IDS.andrea, IDS.carla], from: "2026-10-14T12:00:00.000Z", to: "2026-10-28T12:00:00.000Z", duration_minutes: 30 };
    expect(await setup().calendar.availability(input)).toEqual(answer);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/calendar/availability", body: input });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("schedule: POST /meetings with only the kind's id, an Idempotency-Key, and the version kept", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture(), 201));
    const { calendar, client } = setup();
    const m = await calendar.schedule({
      kind: "business", business_id: IDS.business, task_id: null, participant_user_ids: [IDS.carla], starts_at: "2026-10-20T15:00:00.000Z",
      duration_minutes: 30, topic: "Avance del programa", note: null,
    });
    expect(m.id).toBe(MEETING);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/meetings",
      body: { kind: "business", business_id: IDS.business, participant_user_ids: [IDS.carla], starts_at: "2026-10-20T15:00:00.000Z", duration_minutes: 30, topic: "Avance del programa" },
    });
    expect(calls[0]?.body).not.toHaveProperty("task_id");
    expect(calls[0]?.body).not.toHaveProperty("note");
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.get(`/meetings/${MEETING}`)).toBe('"3"');
  });

  it("schedule retries a network failure once with the same Idempotency-Key", async () => {
    const { calls } = stubFetch(new TypeError("Failed to fetch"), dataResponse(meetingFixture(), 201));
    await setup().calendar.schedule({ kind: "lead", lead_id: IDS.request, participant_user_ids: [IDS.carla], starts_at: "2026-10-20T15:00:00.000Z", duration_minutes: 30, topic: "Entrada" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers["Idempotency-Key"]).toBe(calls[1]?.headers["Idempotency-Key"]);
    expect(calls[1]?.body).toMatchObject({ kind: "lead", lead_id: IDS.request });
  });

  it("schedule surfaces slot_unavailable as the error code", async () => {
    stubFetch(problemResponse(409, "slot_unavailable"));
    await expect(setup().calendar.schedule({ kind: "task", task_id: IDS.member, participant_user_ids: [IDS.carla], starts_at: "2026-10-20T15:00:00.000Z", duration_minutes: 30, topic: "x" }))
      .rejects.toThrow("slot_unavailable");
  });

  it("reschedule: PATCH /meetings/{id} with If-Match from the cached version (no extra read)", async () => {
    const { calls } = stubFetch(dataResponse([meetingFixture()]), dataResponse(meetingFixture({ version: 4, starts_at: "2026-10-21T15:00:00.000Z" })));
    const { calendar, client } = setup();
    await calendar.listMyMeetings("2026-10-12T00:00:00.000Z", "2026-11-09T00:00:00.000Z");
    const moved = await calendar.reschedule(MEETING, { starts_at: "2026-10-21T15:00:00.000Z" });
    expect(moved.version).toBe(4);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/meetings?from=2026-10-12T00%3A00%3A00.000Z&to=2026-11-09T00%3A00%3A00.000Z" });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: `/meetings/${MEETING}`, body: { starts_at: "2026-10-21T15:00:00.000Z" } });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    expect(client.etags.get(`/meetings/${MEETING}`)).toBe('"4"');
  });

  it("reschedule reads the meeting first when its version is unknown", async () => {
    const { calls } = stubFetch(
      dataResponse(meetingFixture(), 200, { ETag: '"3"' }),
      dataResponse(meetingFixture({ version: 4 })),
    );
    await setup().calendar.reschedule(MEETING, { starts_at: "2026-10-21T15:00:00.000Z", duration_minutes: 45 });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /meetings/${MEETING}`, `PATCH /meetings/${MEETING}`]);
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    expect(calls[1]?.body).toEqual({ starts_at: "2026-10-21T15:00:00.000Z", duration_minutes: 45 });
  });

  it("cancel: DELETE /meetings/{id} with If-Match and the reason; the version is dropped", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture()), emptyResponse());
    const { calendar, client } = setup();
    await calendar.getMeeting(MEETING);
    await calendar.cancel(MEETING, "  Se cruzó con otra cosa ");
    expect(calls[1]).toMatchObject({ method: "DELETE", path: `/meetings/${MEETING}`, body: { reason: "Se cruzó con otra cosa" } });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    expect(client.etags.has(`/meetings/${MEETING}`)).toBe(false);
  });

  it("cancel without a reason sends no body", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture()), emptyResponse());
    const { calendar } = setup();
    await calendar.getMeeting(MEETING);
    await calendar.cancel(MEETING, null);
    expect(calls[1]).toMatchObject({ method: "DELETE", body: undefined });
  });

  it("a stale version answers precondition_failed", async () => {
    stubFetch(dataResponse(meetingFixture()), problemResponse(412, "version_mismatch"));
    const { calendar } = setup();
    await calendar.getMeeting(MEETING);
    await expect(calendar.reschedule(MEETING, { starts_at: "2026-10-21T15:00:00.000Z" })).rejects.toThrow("precondition_failed");
  });

  it("getMeeting: GET /meetings/{id}; 404 is null", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture()), problemResponse(404, "not_found"));
    const { calendar } = setup();
    expect((await calendar.getMeeting(MEETING))?.topic).toBe("Avance del programa");
    expect(await calendar.getMeeting(IDS.event)).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /meetings/${MEETING}`, `GET /meetings/${IDS.event}`]);
  });
});
