import { describe, expect, it } from "vitest";
import { dueNotifications } from "./notifications";
import type { Business, TaskWithComputed } from "./types";

const biz = [{ id: "b", name: "Vossler" } as Business];
const task = (id: string, due_date: string, status = "in_progress", is_overdue = false) =>
  ({ id, code: id, name: id, business_id: "b", due_date, status, is_overdue }) as TaskWithComputed;

describe("due-date notifications from todayIso()", () => {
  const kinds = (ts: TaskWithComputed[]) => dueNotifications("u", ts, biz, "2026-10-14").map((n) => n.kind);
  it("due today", () => expect(kinds([task("a", "2026-10-14")])).toEqual(["due_today"]));
  it("due tomorrow", () => expect(kinds([task("a", "2026-10-15")])).toEqual(["due_tomorrow"]));
  it("overdue", () => expect(kinds([task("a", "2026-10-10", "in_progress", true)])).toEqual(["overdue"]));
  it("nothing for later dates", () => expect(kinds([task("a", "2026-10-16")])).toEqual([]));
  it("approved tasks never notify", () => expect(kinds([task("a", "2026-10-14", "accepted")])).toEqual([]));
});
