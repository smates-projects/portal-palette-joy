import { describe, expect, it } from "vitest";
import { areaHealth, buildOwnerInbox, gateState } from "./owner";
import type { Meeting, OwnerRequest, TaskVersion, TaskWithComputed } from "@/lib/api/types";
import { createMockApi } from "@/lib/api/mock";
import * as seed from "@/lib/api/mock/seed";

const task = (id: string, status: string, due_date: string, is_overdue = false) =>
  ({ id, code: id, status, due_date, is_overdue }) as TaskWithComputed;

describe("owner inbox", () => {
  it("includes deliverables to approve, open requests and meetings proposed by others, soonest first", () => {
    const tasks = [task("A", "submitted", "2026-10-20"), task("B", "in_progress", "2026-10-30")];
    const requests = [{ id: "r", task_id: "B", status: "open", due_date: "2026-10-15" } as OwnerRequest];
    const meetings = [
      { id: "m1", task_id: "B", status: "proposed", proposed_by_user_id: "firm", starts_at: "2026-10-16T15:00:00Z" } as Meeting,
      { id: "m2", task_id: "B", status: "proposed", proposed_by_user_id: "owner", starts_at: "2026-10-17T15:00:00Z" } as Meeting,
    ];
    expect(buildOwnerInbox(tasks, requests, meetings, "owner").map((i) => i.kind)).toEqual(["request", "meeting", "approve"]);
  });
  it("sample data: Carla (Vossler) sees Mariana's CRM demo to confirm among the first 5 items", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CARLA);
    const [tasks, requests, meetings] = await Promise.all([api.tasks.list(), api.tasks.listOpenOwnerRequests(), api.tasks.listMeetings()]);
    const inbox = buildOwnerInbox(tasks, requests, meetings, seed.U_CARLA).slice(0, 5);
    const demo = inbox.find((i) => i.kind === "meeting" && i.meeting.proposed_by_user_id === seed.U_MARIANA);
    expect(demo?.kind === "meeting" && demo.meeting.topic).toBe("Demo del CRM con tus etapas de venta");
  });
});

describe("area health", () => {
  const v = (task_id: string, submitted_at: string) => ({ task_id, submitted_at }) as TaskVersion;
  it("green with no tasks (grey only when the area does not apply)", () => expect(areaHealth([], [], "2026-10-14")).toBe("green"));
  it("red if any overdue", () => expect(areaHealth([task("A", "in_progress", "2026-10-10", true)], [], "2026-10-14")).toBe("red"));
  it("amber if due within 7 days", () => expect(areaHealth([task("A", "in_progress", "2026-10-21")], [], "2026-10-14")).toBe("amber"));
  it("amber if a deliverable waits for the owner more than 7 days", () =>
    expect(areaHealth([task("A", "submitted", "2026-11-30")], [v("A", "2026-10-06T10:00:00Z")], "2026-10-14")).toBe("amber"));
  it("green otherwise", () => expect(areaHealth([task("A", "in_progress", "2026-10-22")], [], "2026-10-14")).toBe("green"));
});

describe("gates", () => {
  it("Diagnóstico is done after day 15; Cierre starts on day 150", () => {
    expect(gateState(74, "diagnosis")).toBe("done");
    expect(gateState(74, "closing")).toBe("upcoming");
    expect(gateState(150, "closing")).toBe("current");
  });
});
