import { TODAY } from "@/config/app";
import { nowIso } from "@/config/app";
import type { ApiClient } from "../repositories";
import { canTransition, withComputed } from "../computed";
import type { Meeting, OwnerRequest, Task, TaskComment, TaskEvent, TaskVersion, User } from "../types";
import * as seed from "./seed";

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;

/** In-memory backend; filters by current user to simulate API authorization. */
export function createMockApi(): ApiClient {
  const db = {
    tasks: structuredClone(seed.tasks) as Task[],
    versions: structuredClone(seed.versions) as TaskVersion[],
    comments: structuredClone(seed.comments) as TaskComment[],
    events: structuredClone(seed.events) as TaskEvent[],
    ownerRequests: structuredClone(seed.ownerRequests) as OwnerRequest[],
    meetings: structuredClone(seed.meetings) as Meeting[],
    users: seed.users,
    orgs: seed.organizations,
    businesses: seed.businesses,
  };
  // Approval date comes from the latest "approved" event.
  for (const t of db.tasks) {
    if (t.status !== "accepted") continue;
    const ev = db.events.filter((e) => e.task_id === t.id && e.kind === "approved").map((e) => e.created_at).sort().at(-1);
    t.accepted_at = ev ?? t.updated_at;
  }
  let currentUserId = seed.U_LUCIA;

  const me = (): User => db.users.find((u) => u.id === currentUserId)!;

  const visibleTasks = (): Task[] => {
    const u = me();
    if (u.role === "sm_team") return db.tasks;
    if (u.role === "business_owner") return db.tasks.filter((t) => t.business_id === u.business_id);
    return db.tasks.filter((t) => t.organization_id === u.organization_id);
  };
  const findTask = (id: string) => {
    const t = visibleTasks().find((x) => x.id === id);
    if (!t) throw new Error("not_found");
    return t;
  };
  const transition = (t: Task, to: Task["status"]) => {
    if (!canTransition(me().role, t.status, to)) throw new Error("invalid_transition");
    if (to !== "pending" && withComputed(t, db.tasks).is_blocked) throw new Error("blocked");
    t.status = to;
    t.accepted_at = to === "accepted" ? nowIso() : null;
    t.updated_at = nowIso();
  };
  const pushEvent = (task_id: string, kind: TaskEvent["kind"], version: number | null = null) =>
    db.events.push({ id: newId(), task_id, kind, actor_user_id: currentUserId, version, comment_id: null, created_at: nowIso() });

  return {
    session: {
      getCurrentUser: () => delay(me()),
      getViewAsOptions: () =>
        delay([
          ...[seed.U_LUCIA, seed.U_TOMAS].map((id) => {
            const user = db.users.find((u) => u.id === id)!;
            return { user, organization: db.orgs.find((o) => o.id === user.organization_id) ?? null, enabled: true };
          }),
          { user: db.users.find((u) => u.id === seed.U_CARLA)!, organization: null, enabled: false },
          { user: db.users.find((u) => u.id === seed.U_MARYLIN)!, organization: db.orgs[0] ?? null, enabled: false },
        ]),
      setViewAs: async (userId) => {
        const target = db.users.find((u) => u.id === userId);
        if (!target || target.role !== "partner_firm") throw new Error("not_available");
        currentUserId = userId;
        return delay(target);
      },
    },
    organizations: {
      list: () => {
        const u = me();
        return delay(u.role === "sm_team" ? db.orgs : db.orgs.filter((o) => o.id === u.organization_id));
      },
      get: (id) => delay(db.orgs.find((o) => o.id === id) ?? null),
    },
    businesses: {
      list: () => {
        const ids = new Set(visibleTasks().map((t) => t.business_id));
        return delay(db.businesses.filter((b) => ids.has(b.id)));
      },
    },
    users: {
      list: () => delay(db.users),
      setGoogleCalendar: async (email) => {
        const u = me();
        u.google_calendar_email = email;
        return delay({ ...u });
      },
      listCalendarEvents: () => {
        const u = me();
        return delay(u.google_calendar_email ? seed.calendarEvents.filter((e) => e.user_id === u.id) : []);
      },
    },
    tasks: {
      list: () => delay(visibleTasks().map((t) => withComputed(t, db.tasks))),
      listVersions: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(db.versions.filter((v) => ids.has(v.task_id)));
      },
      listMeetings: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(db.meetings.filter((m) => ids.has(m.task_id) && m.status !== "cancelled"));
      },
      listUpcomingMeetings: () => {
        const ids = new Set(visibleTasks().map((t) => t.id));
        return delay(
          db.meetings
            .filter((m) => ids.has(m.task_id) && m.status !== "cancelled" && m.starts_at.slice(0, 10) >= TODAY)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        );
      },
      get: async (id) => {
        const t = visibleTasks().find((x) => x.id === id);
        if (!t) return delay(null);
        return delay({
          task: withComputed(t, db.tasks),
          versions: db.versions.filter((v) => v.task_id === id),
          comments: db.comments.filter((c) => c.task_id === id),
          owner_requests: db.ownerRequests.filter((r) => r.task_id === id),
          meetings: db.meetings.filter((m) => m.task_id === id),
          events: db.events.filter((e) => e.task_id === id),
        });
      },
      updateStatus: async (id, status) => {
        const t = findTask(id);
        transition(t, status);
        return delay(withComputed(t, db.tasks));
      },
      start: async (id) => {
        const t = findTask(id);
        transition(t, "in_progress");
        pushEvent(id, "started");
        return delay(withComputed(t, db.tasks));
      },
      submitVersion: async (id, input) => {
        const t = findTask(id);
        if (input.file_names.length === 0) throw new Error("file_required");
        transition(t, "submitted");
        t.current_version += 1;
        const v: TaskVersion = {
          id: newId(), task_id: id, version: t.current_version, submitted_by_user_id: currentUserId, submitted_at: nowIso(),
          note: input.note, files: input.file_names.map((name) => ({ id: newId(), name, size_kb: 480 })),
          status: "submitted", review_comment_id: null,
        };
        db.versions.push(v);
        pushEvent(id, "submitted", v.version);
        return delay(v);
      },
      addComment: async (id, input) => {
        findTask(id);
        const c: TaskComment = { id: newId(), task_id: id, author_user_id: currentUserId, body: input.body, created_at: nowIso(), kind: "comment", file_id: input.file_id };
        db.comments.push(c);
        return delay(c);
      },
      addOwnerRequest: async (id, input) => {
        findTask(id);
        const r: OwnerRequest = { id: newId(), task_id: id, requested_by_user_id: currentUserId, question: input.question, due_date: input.due_date, answer: null, status: "open", created_at: nowIso(), resolved_at: null };
        db.ownerRequests.push(r);
        return delay(r);
      },
      setOwnerRequestResolved: async (requestId, resolved) => {
        const r = db.ownerRequests.find((x) => x.id === requestId);
        if (!r) throw new Error("not_found");
        findTask(r.task_id);
        r.status = resolved ? "resolved" : "open";
        r.resolved_at = resolved ? nowIso() : null;
        return delay(r);
      },
      proposeMeeting: async (id, input) => {
        findTask(id);
        const m: Meeting = { id: newId(), task_id: id, proposed_by_user_id: currentUserId, topic: input.topic, starts_at: input.starts_at, duration_minutes: input.duration_minutes, status: "proposed" };
        db.meetings.push(m);
        return delay(m);
      },
    },
  };
}
