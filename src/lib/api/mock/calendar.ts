// Calendar v2 in memory: connections, fake busy time per seeded person, availability computed with the same rules
// as the API (30-minute grid inside meeting_hours, portal meetings excluded) and the portal meetings themselves.
// Demo seed: Carla, Lucía, Nicolás, Jefferson and Marilyn have the calendar connected; Mariana does not; Camila's
// access expired (reconnect required).
import { nowIso } from "@/lib/clock";
import type { CalendarConsent, CalendarRepository } from "../repositories";
import type {
  AppNotification, Business, CalendarConnection, ExternalCalendarEvent, Lead, NotificationKind, PlatformRules, PortalMeeting,
  PortalMeetingParticipant, Task, UnavailableParticipant, User,
} from "../types";
import { computeFreeSlots, dayInZone, isSlotFree, zonedTimeToInstant, type BusyBlock } from "@/lib/calendar/slots";
import { MAX_MEETING_PARTICIPANTS, addExternalEmail, isCalendarConnected, meetingHoursOf, planMeeting } from "@/lib/calendar/scheduling";
import * as seed from "./seed";
import * as seedNetwork from "./seed-network";

interface CalendarDb {
  users: User[];
  businesses: Business[];
  tasks: Task[];
  leads: Lead[];
  rules: PlatformRules;
  investments: { bishop_user_id: string; business_id: string }[];
}

export interface CalendarContext {
  db: CalendarDb;
  me: () => User;
  newId: () => string;
  delay: <T>(value: T, ms?: number) => Promise<T>;
  /** People the current user may see (the accounts scope). */
  visibleUsers: () => User[];
  /** Simulated Google events already shown in the calendar (Lucía's). */
  externalEvents: ExternalCalendarEvent[];
}

/** Scopes the mock grants on connect: free/busy plus writing events. */
const MOCK_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";
const NOT_CONNECTED: CalendarConnection = { connected: false, email: null, scope: null, status: "not_connected" };

/** Recurring busy time in New York wall clock. weekdays: 0 Sunday ... 6 Saturday. */
interface BusyPattern {
  weekdays: number[];
  start: string;
  end: string;
}
const BUSY_PATTERNS: Record<string, BusyPattern[]> = {
  // Team meeting every morning and client visits on Tuesdays and Thursdays.
  [seed.U_NICOLAS]: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "10:00" }, { weekdays: [2, 4], start: "14:00", end: "15:30" }],
  // On site in the mornings, supplier calls Monday, Wednesday and Friday.
  [seed.U_CARLA]: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "11:00" }, { weekdays: [1, 3, 5], start: "15:00", end: "16:00" }],
  // Lunch every weekday (her other events come from the simulated Google Calendar).
  [seed.U_LUCIA]: [{ weekdays: [1, 2, 3, 4, 5], start: "12:30", end: "13:30" }],
  [seedNetwork.U_JEFFERSON]: [{ weekdays: [1, 3], start: "11:00", end: "12:30" }, { weekdays: [5], start: "13:00", end: "17:00" }],
};
const BUSY_ZONE = "America/New_York";

/** Who starts connected (and with which Google account). */
const CONNECTED_SEED: Record<string, string> = {
  [seed.U_CARLA]: "carla.mendez@gmail.com",
  [seed.U_NICOLAS]: "nicolas@strategicmates.com",
  [seedNetwork.U_JEFFERSON]: "jefferson@paulainvestments.com",
  // SM Global holds the first meetings with the owners: her Calendario has something to show in the demo.
  [seed.U_MARYLIN]: "marilyn@strategicmates.com",
};
const RECONNECT_SEED: Record<string, string> = { [seed.U_CAMILA]: "camila@strategicmates.com" };

const MINUTE = 60_000;
const plusMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * MINUTE).toISOString();

/** "abc-defg-hij" from an id, deterministic (no randomness during SSR). */
const meetCode = (id: string) => {
  const letters = id.replace(/[^0-9a-f]/g, "").slice(-10).split("").map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
  return `https://meet.google.com/${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7, 10)}`;
};

interface StoredNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  actor_user_id: string | null;
  meeting_id: string | null;
  created_at: string;
  read: boolean;
}

export function createCalendar(ctx: CalendarContext) {
  const { db, me, newId, delay } = ctx;
  const meetings: PortalMeeting[] = [];
  const reconnect = new Set<string>();
  const notes: StoredNotification[] = [];

  // ---------- Connections ----------
  const userOf = (id: string) => db.users.find((u) => u.id === id);
  const nameOf = (id: string) => userOf(id)?.full_name ?? "";
  const connectionOf = (u: User | undefined): CalendarConnection => {
    if (!u?.google_calendar_email) return NOT_CONNECTED;
    if (reconnect.has(u.id)) return { connected: false, email: u.google_calendar_email, scope: null, status: "reconnect_required" };
    return { connected: true, email: u.google_calendar_email, scope: MOCK_SCOPE, status: "connected" };
  };
  /** Keeps User.calendar_connected in step with the connection (the users list shows it). */
  const syncUser = (u: User) => {
    u.calendar_connected = connectionOf(u).connected;
  };
  const setConnected = (u: User, email: string | null) => {
    u.google_calendar_email = email;
    reconnect.delete(u.id);
    syncUser(u);
  };

  // ---------- Notifications ----------
  const notify = (userId: string, kind: NotificationKind, meetingId: string | null) => {
    if (userId === me().id && kind !== "calendar_reconnect_required") return;
    notes.push({ id: newId(), user_id: userId, kind, actor_user_id: me().id, meeting_id: meetingId, created_at: nowIso(), read: false });
  };
  /** A guest without the calendar hears once that connecting it makes meetings land by themselves. */
  const suggestConnect = (userId: string) => {
    if (notes.some((n) => n.user_id === userId && n.kind === "calendar_connect_suggested" && !n.read)) return;
    notify(userId, "calendar_connect_suggested", null);
  };

  // ---------- Scope ----------
  /** Visible people, plus the consultant of each business the user funds (a Bishop sees nobody else). */
  const allowedPeople = (): Set<string> => {
    const u = me();
    const ids = new Set(ctx.visibleUsers().map((x) => x.id));
    if (u.role === "bishop")
      for (const inv of db.investments.filter((i) => i.bishop_user_id === u.id)) {
        const consultant = db.businesses.find((b) => b.id === inv.business_id)?.consultant_id;
        if (consultant) ids.add(consultant);
      }
    return ids;
  };
  const businessOfMeeting = (m: Pick<PortalMeeting, "business_id" | "task_id" | "lead_id">) =>
    m.business_id ?? db.tasks.find((t) => t.id === m.task_id)?.business_id ?? db.leads.find((l) => l.id === m.lead_id)?.business_id ?? null;
  const officeOfMeeting = (m: PortalMeeting) => {
    const lead = db.leads.find((l) => l.id === m.lead_id);
    if (lead) return lead.office_id;
    const bizId = businessOfMeeting(m);
    return db.businesses.find((b) => b.id === bizId)?.office_id ?? null;
  };
  const takesPart = (m: PortalMeeting, userId: string) => m.organizer.user_id === userId || m.participants.some((p) => p.user_id === userId);
  const canRead = (m: PortalMeeting) => {
    const u = me();
    return takesPart(m, u.id) || u.role === "sm_global" || (u.role === "sm_team" && officeOfMeeting(m) === u.organization_id);
  };
  const canManage = (m: PortalMeeting) => {
    const u = me();
    return m.organizer.user_id === u.id || u.role === "sm_global" || (u.role === "sm_team" && officeOfMeeting(m) === u.organization_id);
  };
  const findMeeting = (id: string) => {
    const m = meetings.find((x) => x.id === id);
    if (!m || !canRead(m)) throw new Error("not_found");
    return m;
  };

  // ---------- Busy time ----------
  /** Recurring blocks of one person in the window, plus the simulated Google events. */
  const calendarBusy = (userId: string, from: number, to: number): BusyBlock[] => {
    const blocks: BusyBlock[] = [];
    const patterns = BUSY_PATTERNS[userId] ?? [];
    for (let t = from - 86_400_000; t <= to + 86_400_000; t += 86_400_000) {
      const day = dayInZone(t, BUSY_ZONE);
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      for (const p of patterns.filter((x) => x.weekdays.includes(weekday)))
        blocks.push({ start: zonedTimeToInstant(day, p.start, BUSY_ZONE), end: zonedTimeToInstant(day, p.end, BUSY_ZONE) });
    }
    for (const e of ctx.externalEvents.filter((x) => x.user_id === userId)) {
      const start = Date.parse(e.starts_at);
      blocks.push({ start, end: start + e.duration_minutes * MINUTE });
    }
    return blocks;
  };
  /** Portal meetings (not cancelled) of anyone in the list, connected or not; `except` is the one being moved. */
  const portalBusy = (userIds: string[], except?: string): BusyBlock[] =>
    meetings
      .filter((m) => m.status !== "cancelled" && m.id !== except && userIds.some((id) => takesPart(m, id)))
      .map((m) => ({ start: Date.parse(m.starts_at), end: Date.parse(m.ends_at) }));
  /** Busy time of every connected person of the list, and who could not be read. */
  const busyOf = (userIds: string[], from: number, to: number, except?: string) => {
    const unavailable: UnavailableParticipant[] = [];
    const busy: BusyBlock[] = portalBusy(userIds, except);
    for (const id of userIds) {
      const c = connectionOf(userOf(id));
      if (c.connected) busy.push(...calendarBusy(id, from, to));
      else unavailable.push({ user_id: id, reason: c.status === "reconnect_required" ? "calendar_reconnect_required" : "calendar_not_connected" });
    }
    return { busy, unavailable };
  };

  /** Organizer first, each person once. */
  const peopleOf = (ids: string[]) => [...new Set([me().id, ...ids])];
  const checkPeople = (ids: string[]) => {
    if (ids.length > MAX_MEETING_PARTICIPANTS) throw new Error("too_many_participants");
    const allowed = allowedPeople();
    if (ids.some((id) => id !== me().id && (!allowed.has(id) || !userOf(id)))) throw new Error("participant_not_visible");
  };
  const checkTime = (startsAt: string, duration: number, ids: string[], except?: string) => {
    const start = Date.parse(startsAt);
    if (Number.isNaN(start)) throw new Error("invalid_date");
    if (start < Date.parse(nowIso())) throw new Error("meeting_in_past");
    const { busy } = busyOf(ids, start, start + duration * MINUTE, except);
    if (!isSlotFree(startsAt, duration, meetingHoursOf(db.rules), busy)) throw new Error("slot_unavailable");
  };
  const checkContext = (kind: PortalMeeting["kind"], ids: { task_id?: string | null | undefined; business_id?: string | null | undefined; lead_id?: string | null | undefined }) => {
    const exists =
      kind === "task" ? !!ids.task_id && db.tasks.some((t) => t.id === ids.task_id)
        : kind === "business" ? !!ids.business_id && db.businesses.some((b) => b.id === ids.business_id)
          : !!ids.lead_id && db.leads.some((l) => l.id === ids.lead_id);
    if (!exists) throw new Error("not_found");
  };

  const build = (input: {
    id: string; kind: PortalMeeting["kind"]; task_id: string | null; business_id: string | null; lead_id: string | null; topic: string;
    starts_at: string; duration: number; organizerId: string; participantIds: string[]; externalEmails?: string[];
  }): PortalMeeting => {
    const everyone = [...new Set([input.organizerId, ...input.participantIds])];
    const organizerConnected = connectionOf(userOf(input.organizerId)).connected;
    const plan = planMeeting(
      { user_id: input.organizerId, connected: organizerConnected },
      everyone.map((id) => ({ user_id: id, connected: connectionOf(userOf(id)).connected })),
    );
    const participants: PortalMeetingParticipant[] = everyone.map((id) => ({
      user_id: id,
      name: nameOf(id),
      // The organizer accepts; whoever has to confirm a proposal has no answer yet; the rest got Google's invitation.
      response: id === input.organizerId ? "accepted" : plan.pending_user_ids.includes(id) ? "needsAction" : plan.status === "proposed" ? "accepted" : "needsAction",
    }));
    return {
      id: input.id, kind: input.kind, task_id: input.task_id, business_id: input.business_id, lead_id: input.lead_id, topic: input.topic,
      starts_at: new Date(input.starts_at).toISOString(), ends_at: plusMinutes(input.starts_at, input.duration),
      meet_url: plan.google_synced ? meetCode(input.id) : null,
      organizer: { user_id: input.organizerId, name: nameOf(input.organizerId) },
      participants, external_emails: input.externalEmails ?? [], status: plan.status, google_synced: plan.google_synced, version: 1,
    };
  };

  // ---------- Seed ----------
  const seedCalendar = () => {
    for (const [id, email] of Object.entries(CONNECTED_SEED)) {
      const u = userOf(id);
      if (u && !u.google_calendar_email) u.google_calendar_email = email;
    }
    for (const [id, email] of Object.entries(RECONNECT_SEED)) {
      const u = userOf(id);
      if (!u) continue;
      u.google_calendar_email = email;
      reconnect.add(id);
    }
    for (const u of db.users) syncUser(u);

    const vosslerTecno = db.tasks.find((t) => t.business_id === seed.BIZ_VOSSLER && t.organization_id === seed.ORG_TECNO);
    const samples = [
      // Nicolás with Carla about the program: both connected, confirmed in Google.
      { kind: "business" as const, business_id: seed.BIZ_VOSSLER, topic: "Revisión de avance del programa", starts_at: "2026-10-16T15:00:00Z", duration: 30, organizerId: seed.U_NICOLAS, participantIds: [seed.U_CARLA] },
      // Lucía with Carla on the franchise contract task: confirmed.
      { kind: "task" as const, task_id: seed.TASK_B603_VOSSLER, topic: "Repasar el contrato de franquicia", starts_at: "2026-10-15T15:30:00Z", duration: 45, organizerId: seed.U_LUCIA, participantIds: [seed.U_CARLA] },
      // Mariana has no calendar connected: a proposal Carla has to confirm.
      ...(vosslerTecno ? [{ kind: "task" as const, task_id: vosslerTecno.id, topic: "Demo del CRM para el equipo de obra", starts_at: "2026-10-19T17:00:00Z", duration: 45, organizerId: seed.U_MARIANA, participantIds: [seed.U_CARLA] }] : []),
      // Jefferson (Bishop) with the consultant of the business he funds.
      { kind: "business" as const, business_id: seed.BIZ_BIMBO, topic: "Resultados del trimestre de las franquicias", starts_at: "2026-10-21T20:00:00Z", duration: 30, organizerId: seedNetwork.U_JEFFERSON, participantIds: [seed.U_NICOLAS] },
      // Marilyn (SM Global) this week: with Nicolás, confirmed in Google; with Camila, whose access expired, a proposal.
      { kind: "business" as const, business_id: seed.BIZ_VOSSLER, topic: "Seguimiento del programa de Vossler", starts_at: "2026-10-16T18:00:00Z", duration: 30, organizerId: seed.U_MARYLIN, participantIds: [seed.U_NICOLAS] },
      { kind: "business" as const, business_id: seed.BIZ_PRIME, topic: "Revisión de Prime 10 con su consultora", starts_at: "2026-10-15T19:00:00Z", duration: 30, organizerId: seed.U_MARYLIN, participantIds: [seed.U_CAMILA] },
    ];
    for (const s of samples) {
      const task = "task_id" in s ? db.tasks.find((t) => t.id === s.task_id) : undefined;
      meetings.push(build({
        id: newId(), kind: s.kind, task_id: "task_id" in s ? s.task_id : null, business_id: "business_id" in s ? s.business_id : task?.business_id ?? null,
        lead_id: null, topic: s.topic, starts_at: s.starts_at, duration: s.duration, organizerId: s.organizerId, participantIds: s.participantIds,
      }));
    }
    const first = meetings[0];
    if (first) notes.push({ id: newId(), user_id: seed.U_CARLA, kind: "meeting_scheduled", actor_user_id: seed.U_NICOLAS, meeting_id: first.id, created_at: "2026-10-13T18:00:00Z", read: false });
    notes.push({ id: newId(), user_id: seed.U_CAMILA, kind: "calendar_reconnect_required", actor_user_id: null, meeting_id: null, created_at: "2026-10-13T12:00:00Z", read: false });
    notes.push({ id: newId(), user_id: seed.U_MARIANA, kind: "calendar_connect_suggested", actor_user_id: null, meeting_id: null, created_at: "2026-10-12T12:00:00Z", read: false });
  };

  // ---------- Repository ----------
  const calendar: CalendarRepository = {
    getConnection: async () => delay(connectionOf(me())),
    connect: async (): Promise<CalendarConsent | CalendarConnection> => {
      const u = me();
      setConnected(u, u.google_calendar_email ?? u.email);
      return delay(connectionOf(u));
    },
    disconnect: async () => {
      setConnected(me(), null);
      return delay(NOT_CONNECTED);
    },
    getUserStatus: async (userId) => {
      const u = me();
      if (u.role !== "sm_team" && u.role !== "sm_global") throw new Error("sm_only");
      const target = userOf(userId);
      if (!target || !allowedPeople().has(userId)) throw new Error("not_found");
      return delay(connectionOf(target));
    },
    availability: async (input) => {
      const ids = peopleOf(input.participant_user_ids);
      checkPeople(ids);
      const from = Date.parse(input.from);
      const to = Date.parse(input.to);
      const { busy, unavailable } = busyOf(ids, from, to);
      const hours = meetingHoursOf(db.rules);
      // As the API: only the rule's weekdays (Monday to Friday when the rule does not say), in the hours' time zone.
      const weekdays = hours.weekdays ?? [1, 2, 3, 4, 5];
      const weekdayOf = (iso: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: hours.timezone }).format(new Date(iso)));
      const slots = computeFreeSlots({ from: input.from, to: input.to, durationMinutes: input.duration_minutes, hours, busy, now: Date.parse(nowIso()) })
        .filter((s) => weekdays.includes(weekdayOf(s.starts_at)));
      return delay({ slots, unavailable_participants: unavailable });
    },
    schedule: async (input) => {
      if (!input.topic.trim()) throw new Error("topic_required");
      const ids = peopleOf(input.participant_user_ids);
      // As the API: emails validated, lowercased, each once, never the organizer's; counted with the people.
      let externalEmails: string[] = [];
      for (const raw of input.external_emails ?? []) {
        const added = addExternalEmail(externalEmails, raw, me().email);
        if (added.error === "invalid_email") throw new Error("validation_failed");
        externalEmails = added.list;
      }
      if (ids.length + externalEmails.length > MAX_MEETING_PARTICIPANTS) throw new Error("too_many_participants");
      checkPeople(ids);
      checkContext(input.kind, input);
      if (ids.length === 1 && externalEmails.length === 0 && input.kind !== "lead") throw new Error("person_required");
      // Only Google invites people without an account: the organizer's calendar is needed.
      if ((externalEmails.length > 0 || input.kind === "lead") && !connectionOf(me()).connected) throw new Error("calendar_not_connected");
      checkTime(input.starts_at, input.duration_minutes, ids);
      const task = input.kind === "task" ? db.tasks.find((t) => t.id === input.task_id) : undefined;
      const lead = input.kind === "lead" ? db.leads.find((l) => l.id === input.lead_id) : undefined;
      const m = build({
        id: newId(), kind: input.kind, task_id: input.kind === "task" ? input.task_id ?? null : null,
        business_id: input.kind === "business" ? input.business_id ?? null : task?.business_id ?? lead?.business_id ?? null,
        lead_id: input.kind === "lead" ? input.lead_id ?? null : null, topic: input.topic.trim(), starts_at: input.starts_at,
        duration: input.duration_minutes, organizerId: me().id, participantIds: ids, externalEmails,
      });
      meetings.push(m);
      for (const p of m.participants) {
        notify(p.user_id, "meeting_scheduled", m.id);
        if (p.user_id !== me().id && !connectionOf(userOf(p.user_id)).connected) suggestConnect(p.user_id);
      }
      return delay(m);
    },
    reschedule: async (id, input) => {
      const m = findMeeting(id);
      if (!canManage(m)) throw new Error("forbidden");
      if (m.status === "cancelled") throw new Error("invalid_state");
      const duration = input.duration_minutes ?? Math.round((Date.parse(m.ends_at) - Date.parse(m.starts_at)) / MINUTE);
      checkTime(input.starts_at, duration, m.participants.map((p) => p.user_id), m.id);
      m.starts_at = new Date(input.starts_at).toISOString();
      m.ends_at = plusMinutes(m.starts_at, duration);
      if (input.topic?.trim()) m.topic = input.topic.trim();
      m.version += 1;
      for (const p of m.participants) notify(p.user_id, "meeting_moved", m.id);
      return delay(m);
    },
    cancel: async (id) => {
      const m = findMeeting(id);
      if (!canManage(m)) throw new Error("forbidden");
      if (m.status === "cancelled") return delay(undefined);
      m.status = "cancelled";
      m.version += 1;
      for (const p of m.participants) notify(p.user_id, "meeting_cancelled", m.id);
      return delay(undefined);
    },
    listMyMeetings: async (from, to) => {
      const u = me();
      return delay(
        meetings
          .filter((m) => takesPart(m, u.id) && m.starts_at >= new Date(from).toISOString() && m.starts_at < new Date(to).toISOString())
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      );
    },
    getMeeting: async (id) => {
      const m = meetings.find((x) => x.id === id);
      return delay(m && canRead(m) ? m : null);
    },
  };

  // ---------- Bell ----------
  /** The calendar notifications of one person, shaped like the rest of the bell (no task: empty task fields). */
  const notificationsFor = (userId: string): AppNotification[] =>
    notes.filter((n) => n.user_id === userId).map((n) => {
      const m = meetings.find((x) => x.id === n.meeting_id);
      const task = m?.task_id ? db.tasks.find((t) => t.id === m.task_id) : undefined;
      const bizId = m ? businessOfMeeting(m) : null;
      const lead = m?.lead_id ? db.leads.find((l) => l.id === m.lead_id) : undefined;
      return {
        id: n.id, user_id: n.user_id, kind: n.kind,
        task_id: task?.id ?? "", task_code: task?.code ?? "", task_name: task?.name ?? "",
        business_id: bizId ?? "", business_name: db.businesses.find((b) => b.id === bizId)?.name ?? lead?.business.name ?? "",
        actor_user_id: n.actor_user_id, actor_name: n.actor_user_id ? nameOf(n.actor_user_id) : null,
        created_at: n.created_at, read_at: n.read ? n.created_at : null, change: null,
        meeting_id: n.meeting_id, meeting_at: m?.starts_at ?? null,
      };
    });
  const markRead = (userId: string, id: string) => {
    const n = notes.find((x) => x.id === id && x.user_id === userId);
    if (n) n.read = true;
    return !!n;
  };
  const markAllRead = (userId: string) => notes.filter((n) => n.user_id === userId).forEach((n) => (n.read = true));

  return { calendar, seed: seedCalendar, notificationsFor, markRead, markAllRead, setConnected };
}
