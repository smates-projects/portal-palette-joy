import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import * as seedNetwork from "./mock/seed-network";

// Tuesday Oct 20, 2026 at 11:00 New York: Nicolás and Carla are both free (their busy time ends at 10:00 and 11:00).
const FREE = "2026-10-20T15:00:00.000Z";
const WINDOW = { from: "2026-10-20T00:00:00.000Z", to: "2026-10-21T00:00:00.000Z" };

async function as(userId: string) {
  const api = createMockApi();
  await api.session.setViewAs(userId);
  return api;
}

const vosslerTecnoTask = async (api: ReturnType<typeof createMockApi>) =>
  (await api.tasks.list()).find((t) => t.business_id === seed.BIZ_VOSSLER && t.organization_id === seed.ORG_TECNO)!;

describe("calendar v2 (mock)", () => {
  it("seed: Carla, Lucía, Nicolás and Jefferson connected; Mariana not; Camila must reconnect", async () => {
    const api = createMockApi();
    for (const id of [seed.U_CARLA, seed.U_LUCIA, seed.U_NICOLAS, seedNetwork.U_JEFFERSON]) {
      await api.session.setViewAs(id);
      expect((await api.calendar.getConnection()).status, id).toBe("connected");
    }
    await api.session.setViewAs(seed.U_MARIANA);
    expect(await api.calendar.getConnection()).toMatchObject({ connected: false, status: "not_connected" });
    await api.session.setViewAs(seed.U_CAMILA);
    expect((await api.calendar.getConnection()).status).toBe("reconnect_required");
  });

  it("two connected people: a confirmed meeting in Google with its Meet link, and the guest is told", async () => {
    const api = await as(seed.U_NICOLAS);
    const m = await api.calendar.schedule({
      kind: "business", business_id: seed.BIZ_VOSSLER, participant_user_ids: [seed.U_CARLA], starts_at: FREE, duration_minutes: 30, topic: "Avance",
    });
    expect(m).toMatchObject({ status: "confirmed", google_synced: true, organizer: { user_id: seed.U_NICOLAS }, ends_at: "2026-10-20T15:30:00.000Z" });
    expect(m.meet_url).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(m.participants.map((p) => p.user_id).sort()).toEqual([seed.U_CARLA, seed.U_NICOLAS].sort());

    await api.session.setViewAs(seed.U_CARLA);
    const bell = await api.notifications.list();
    expect(bell.some((n) => n.kind === "meeting_scheduled" && n.meeting_id === m.id)).toBe(true);
    expect((await api.calendar.listMyMeetings(WINDOW.from, WINDOW.to)).map((x) => x.id)).toContain(m.id);
  });

  it("nobody connected: a proposal, nothing in Google, the guest still has to answer", async () => {
    const api = await as(seed.U_MARIANA);
    const task = await vosslerTecnoTask(api);
    const m = await api.calendar.schedule({
      kind: "task", task_id: task.id, participant_user_ids: [seed.U_JULIAN], starts_at: FREE, duration_minutes: 45, topic: "Demo",
    });
    expect(m).toMatchObject({ status: "proposed", google_synced: false, meet_url: null, task_id: task.id, business_id: seed.BIZ_VOSSLER });
    expect(m.participants.find((p) => p.user_id === seed.U_JULIAN)?.response).toBe("needsAction");

    await api.session.setViewAs(seed.U_JULIAN);
    const kinds = (await api.notifications.list()).map((n) => n.kind);
    expect(kinds).toContain("meeting_scheduled");
    expect(kinds).toContain("calendar_connect_suggested");
  });

  it("a connected organizer with a guest who is not, plus emails: confirmed in Google, the emails kept; without Google, emails are refused", async () => {
    const api = await as(seed.U_NICOLAS);
    const m = await api.calendar.schedule({
      kind: "business", business_id: seed.BIZ_VOSSLER, participant_user_ids: [seed.U_MARIANA], external_emails: [" Contadora@Vossler.com "],
      starts_at: FREE, duration_minutes: 30, topic: "Cierre de mes",
    });
    expect(m).toMatchObject({ status: "confirmed", google_synced: true, external_emails: ["contadora@vossler.com"] });
    await expect(api.calendar.schedule({
      kind: "business", business_id: seed.BIZ_VOSSLER, participant_user_ids: [], external_emails: ["no-es-correo"], starts_at: FREE, duration_minutes: 30, topic: "x",
    })).rejects.toThrow("validation_failed");

    const mariana = await as(seed.U_MARIANA);
    const task = await vosslerTecnoTask(mariana);
    await expect(mariana.calendar.schedule({
      kind: "task", task_id: task.id, participant_user_ids: [seed.U_JULIAN], external_emails: ["afuera@example.com"], starts_at: FREE, duration_minutes: 30, topic: "Demo",
    })).rejects.toThrow("calendar_not_connected");
  });

  it("availability: common free slots, existing portal meetings left out, and who could not be read", async () => {
    const api = await as(seed.U_NICOLAS);
    const before = await api.calendar.availability({ participant_user_ids: [seed.U_CARLA, seed.U_MARIANA], ...WINDOW, duration_minutes: 30 });
    expect(before.unavailable_participants).toEqual([{ user_id: seed.U_MARIANA, reason: "calendar_not_connected" }]);
    const starts = before.slots.map((s) => s.starts_at);
    expect(starts).toContain(FREE);
    // Nicolás's team meeting (9:00-10:00) and Carla's site visits (9:00-11:00) are busy.
    expect(starts).not.toContain("2026-10-20T13:00:00.000Z");
    expect(starts).not.toContain("2026-10-20T14:30:00.000Z");

    await api.calendar.schedule({ kind: "business", business_id: seed.BIZ_VOSSLER, participant_user_ids: [seed.U_CARLA], starts_at: FREE, duration_minutes: 30, topic: "Avance" });
    const after = await api.calendar.availability({ participant_user_ids: [seed.U_CARLA], ...WINDOW, duration_minutes: 30 });
    expect(after.slots.map((s) => s.starts_at)).not.toContain(FREE);
  });

  it("a taken slot answers slot_unavailable; a past one meeting_in_past; outside the hours too", async () => {
    const api = await as(seed.U_NICOLAS);
    const input = { kind: "business" as const, business_id: seed.BIZ_VOSSLER, participant_user_ids: [seed.U_CARLA], duration_minutes: 30, topic: "Avance" };
    await expect(api.calendar.schedule({ ...input, starts_at: "2026-10-20T13:30:00.000Z" })).rejects.toThrow("slot_unavailable");
    await expect(api.calendar.schedule({ ...input, starts_at: "2026-10-20T23:00:00.000Z" })).rejects.toThrow("slot_unavailable");
    await expect(api.calendar.schedule({ ...input, starts_at: "2026-10-01T15:00:00.000Z" })).rejects.toThrow("meeting_in_past");
    await api.calendar.schedule({ ...input, starts_at: FREE });
    await expect(api.calendar.schedule({ ...input, starts_at: FREE })).rejects.toThrow("slot_unavailable");
  });

  it("a Bishop schedules with the consultant of the business he funds, nobody else", async () => {
    const api = await as(seedNetwork.U_JEFFERSON);
    const portfolio = await api.bishop.getPortfolio();
    expect(portfolio.investments[0]?.consultant).toEqual({ user_id: seed.U_NICOLAS, name: "Nicolás García" });
    const base = { kind: "business" as const, business_id: seed.BIZ_BIMBO, starts_at: FREE, duration_minutes: 30, topic: "Trimestre" };
    await expect(api.calendar.schedule({ ...base, participant_user_ids: [seed.U_CARLA] })).rejects.toThrow("participant_not_visible");
    expect((await api.calendar.schedule({ ...base, participant_user_ids: [seed.U_NICOLAS] })).status).toBe("confirmed");
  });

  it("too many people answers too_many_participants (over the API's 10, organizer included)", async () => {
    const api = await as(seed.U_NICOLAS);
    const people = (await api.users.list()).filter((u) => u.id !== seed.U_NICOLAS).slice(0, 10).map((u) => u.id);
    await expect(api.calendar.availability({ participant_user_ids: people, ...WINDOW, duration_minutes: 30 })).rejects.toThrow("too_many_participants");
  });

  it("Mover and Cancelar: the organizer moves (version up, guests told); a guest cannot cancel", async () => {
    const api = await as(seed.U_NICOLAS);
    const m = await api.calendar.schedule({ kind: "business", business_id: seed.BIZ_VOSSLER, participant_user_ids: [seed.U_CARLA], starts_at: FREE, duration_minutes: 30, topic: "Avance" });
    const moved = await api.calendar.reschedule(m.id, { starts_at: "2026-10-20T16:00:00.000Z" });
    expect(moved).toMatchObject({ starts_at: "2026-10-20T16:00:00.000Z", ends_at: "2026-10-20T16:30:00.000Z", version: m.version + 1 });

    await api.session.setViewAs(seed.U_CARLA);
    expect((await api.notifications.list()).some((n) => n.kind === "meeting_moved" && n.meeting_id === m.id)).toBe(true);
    await expect(api.calendar.cancel(m.id, null)).rejects.toThrow("forbidden");

    await api.session.setViewAs(seed.U_NICOLAS);
    await api.calendar.cancel(m.id, "Se cruzó con otra cosa");
    expect((await api.calendar.getMeeting(m.id))?.status).toBe("cancelled");
  });

  it("connect and disconnect keep the user's calendar_connected in step", async () => {
    const api = await as(seed.U_MARIANA);
    expect((await api.calendar.connect())).toMatchObject({ connected: true, status: "connected" });
    expect((await api.session.getCurrentUser()).calendar_connected).toBe(true);
    expect((await api.calendar.disconnect()).connected).toBe(false);
    expect((await api.session.getCurrentUser()).calendar_connected).toBe(false);
  });

  it("the rules keep meeting_hours and refuse an end before the start", async () => {
    const api = await as(seed.U_MARYLIN);
    const saved = await api.rules.update({ meeting_hours: { start: "08:00", end: "17:00", timezone: "America/Chicago" } });
    expect(saved.meeting_hours).toEqual({ start: "08:00", end: "17:00", timezone: "America/Chicago" });
    await expect(api.rules.update({ meeting_hours: { start: "17:00", end: "08:00", timezone: "America/Chicago" } })).rejects.toThrow("invalid_meeting_hours");
  });
});
