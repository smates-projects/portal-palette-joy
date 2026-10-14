import type { ApiClient } from "../repositories";
import { canTransition, withComputed } from "../computed";
import type { Task, User } from "../types";
import * as seed from "./seed";

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

/** In-memory backend; filters by current user to simulate API authorization. */
export function createMockApi(): ApiClient {
  const db = {
    tasks: structuredClone(seed.tasks) as Task[],
    users: seed.users,
    orgs: seed.organizations,
    businesses: seed.businesses,
  };
  let currentUserId = seed.U_LUCIA;

  const me = (): User => db.users.find((u) => u.id === currentUserId)!;

  const visibleTasks = (): Task[] => {
    const u = me();
    if (u.role === "sm_team") return db.tasks;
    if (u.role === "business_owner") return db.tasks.filter((t) => t.business_id === u.business_id);
    return db.tasks.filter((t) => t.organization_id === u.organization_id);
  };

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
    users: { list: () => delay(db.users) },
    tasks: {
      list: () => delay(visibleTasks().map((t) => withComputed(t, db.tasks))),
      get: async (id) => {
        const t = visibleTasks().find((x) => x.id === id);
        if (!t) return delay(null);
        return delay({
          task: withComputed(t, db.tasks),
          versions: seed.versions.filter((v) => v.task_id === id),
          comments: seed.comments.filter((c) => c.task_id === id),
          owner_requests: seed.ownerRequests.filter((r) => r.task_id === id),
          meetings: seed.meetings.filter((m) => m.task_id === id),
        });
      },
      updateStatus: async (id, status) => {
        const t = visibleTasks().find((x) => x.id === id);
        if (!t) throw new Error("not_found");
        if (!canTransition(me().role, t.status, status)) throw new Error("invalid_transition");
        t.status = status;
        t.updated_at = new Date().toISOString();
        return delay(withComputed(t, db.tasks));
      },
    },
  };
}
