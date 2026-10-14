import { TODAY } from "@/config/app";
import type { AreaCode, Meeting, OwnerRequest, TaskVersion, TaskWithComputed } from "@/lib/api/types";
import { DEFAULT_AREA_AMBER_DAYS } from "@/lib/api/franchisability";
import { daysBetween } from "./table";

export const AREAS: AreaCode[] = ["B1", "B2", "B3", "B4", "B5", "B6"];
export type Health = "red" | "amber" | "green" | "grey";

export type InboxItem =
  | { kind: "approve"; key: string; date: string; task: TaskWithComputed }
  | { kind: "request"; key: string; date: string; task: TaskWithComputed; request: OwnerRequest }
  | { kind: "meeting"; key: string; date: string; task: TaskWithComputed; meeting: Meeting };

/**
 * "Te toca a ti": deliverables to approve, open requests from firms, meetings proposed by others.
 * Soonest first (task due date, request due date, meeting date).
 */
export function buildOwnerInbox(
  tasks: TaskWithComputed[],
  requests: OwnerRequest[],
  meetings: Meeting[],
  ownerId: string,
): InboxItem[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const items: InboxItem[] = [
    ...tasks.filter((t) => t.status === "submitted").map((task) => ({ kind: "approve" as const, key: `a-${task.id}`, date: task.due_date, task })),
    ...requests.flatMap((request) => {
      const task = byId.get(request.task_id);
      return task && request.status === "open" ? [{ kind: "request" as const, key: `r-${request.id}`, date: request.due_date, task, request }] : [];
    }),
    ...meetings.flatMap((meeting) => {
      const task = byId.get(meeting.task_id);
      return task && meeting.status === "proposed" && meeting.proposed_by_user_id !== ownerId
        ? [{ kind: "meeting" as const, key: `m-${meeting.id}`, date: meeting.starts_at.slice(0, 10), task, meeting }]
        : [];
    }),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/**
 * Area health (same rule everywhere): red if any task is overdue; amber if something is due within 7 days
 * or a deliverable has waited for the owner more than 7 days; green otherwise; grey if the area has no tasks.
 */
export function areaHealth(tasks: TaskWithComputed[], versions: TaskVersion[], today = TODAY, amberDays = DEFAULT_AREA_AMBER_DAYS): Health {
  // No tasks yet = nothing overdue: green. Grey only when the area does not apply (not tracked yet).
  if (tasks.length === 0) return "green";
  if (tasks.some((t) => t.is_overdue)) return "red";
  const dueSoon = tasks.some((t) => t.status !== "accepted" && daysBetween(today, t.due_date) <= amberDays);
  const waitingLong = tasks.some((t) => {
    if (t.status !== "submitted") return false;
    const last = versions.filter((v) => v.task_id === t.id).map((v) => v.submitted_at).sort().at(-1);
    return !!last && daysBetween(last.slice(0, 10), today) > amberDays;
  });
  return dueSoon || waitingLong ? "amber" : "green";
}

export interface AreaProgress {
  area: AreaCode;
  total: number;
  accepted: number;
  pct: number;
  health: Health;
}

export function buildAreaProgress(tasks: TaskWithComputed[], versions: TaskVersion[], today = TODAY, amberDays = DEFAULT_AREA_AMBER_DAYS): AreaProgress[] {
  return AREAS.map((area) => {
    const mine = tasks.filter((t) => t.area === area);
    const accepted = mine.filter((t) => t.status === "accepted").length;
    return { area, total: mine.length, accepted, pct: mine.length ? Math.round((accepted / mine.length) * 100) : 0, health: areaHealth(mine, versions, today, amberDays) };
  });
}

/** Opening gate days 1-15, closing gate days 150-180. */
export function gateState(programDay: number, gate: "diagnosis" | "closing"): "done" | "current" | "upcoming" {
  const [from, to] = gate === "diagnosis" ? [1, 15] : [150, 180];
  return programDay > to ? "done" : programDay >= from ? "current" : "upcoming";
}
