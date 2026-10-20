import { todayIso } from "@/lib/clock";
import type { AppNotification, Business, Task, TaskWithComputed } from "./types";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Due-date notifications computed from todayIso() (never stored): due today, due tomorrow, overdue.
 * Approved tasks never generate them. Ids are stable per task and day so read state survives refetches.
 */
export function dueNotifications(
  userId: string,
  tasks: TaskWithComputed[],
  businesses: Business[],
  today: string = todayIso(),
): Omit<AppNotification, "read_at">[] {
  const tomorrow = addDays(today, 1);
  return tasks.flatMap((t) => {
    if (t.status === "accepted") return [];
    const kind = t.is_overdue ? "overdue" : t.due_date === today ? "due_today" : t.due_date === tomorrow ? "due_tomorrow" : null;
    if (!kind) return [];
    const created = kind === "overdue" ? addDays(t.due_date, 1) : today;
    return [
      {
        id: `due:${kind}:${t.id}:${today}`,
        user_id: userId,
        kind,
        ...taskRef(t, businesses),
        actor_user_id: null,
        actor_name: null,
        created_at: `${created}T11:00:00Z`,
      },
    ];
  });
}

export const taskRef = (t: Pick<Task, "id" | "code" | "name" | "business_id">, businesses: Business[]) => ({
  task_id: t.id,
  task_code: t.code,
  task_name: t.name,
  business_id: t.business_id,
  business_name: businesses.find((b) => b.id === t.business_id)?.name ?? "",
});
