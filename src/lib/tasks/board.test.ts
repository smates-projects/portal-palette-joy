import { describe, expect, it } from "vitest";
import type { TaskWithComputed } from "@/lib/api/types";
import { resolveBoardMove } from "./board";

const mk = (status: string, is_blocked = false) => ({ status, is_blocked }) as TaskWithComputed;
const firm = "partner_firm" as const;

describe("board drag rules for the partner firm", () => {
  it("pending to in progress starts the task", () => expect(resolveBoardMove(mk("pending"), "in_progress", firm)).toEqual({ ok: true, action: "start" }));
  it("blocked tasks cannot start", () => expect(resolveBoardMove(mk("pending", true), "in_progress", firm)).toEqual({ ok: false, reason: "blocked" }));
  it("in progress to delivered opens the delivery", () => expect(resolveBoardMove(mk("in_progress"), "submitted", firm)).toEqual({ ok: true, action: "submit" }));
  it("changes requested to delivered is a new version", () => expect(resolveBoardMove(mk("changes_requested"), "submitted", firm)).toEqual({ ok: true, action: "submit" }));
  it("only the owner approves", () => expect(resolveBoardMove(mk("submitted"), "accepted", firm)).toEqual({ ok: false, reason: "owner_only" }));
  it("only the owner requests changes", () => expect(resolveBoardMove(mk("submitted"), "changes_requested", firm)).toEqual({ ok: false, reason: "owner_only" }));
  it("pending cannot jump to delivered", () => expect(resolveBoardMove(mk("pending"), "submitted", firm)).toEqual({ ok: false, reason: "start_first" }));
  it("delivered cannot be pulled back", () => expect(resolveBoardMove(mk("submitted"), "in_progress", firm)).toEqual({ ok: false, reason: "already_submitted" }));
  it("in progress can go back to not started (undo a mistake)", () => expect(resolveBoardMove(mk("in_progress"), "pending", firm)).toEqual({ ok: true, action: "unstart" }));
  it("changes requested cannot go back to not started", () => expect(resolveBoardMove(mk("changes_requested"), "pending", firm)).toEqual({ ok: false, reason: "no_going_back" }));
  it("approved never moves", () => expect(resolveBoardMove(mk("accepted"), "in_progress", firm)).toEqual({ ok: false, reason: "already_accepted" }));
});
