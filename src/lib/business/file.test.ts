import { describe, expect, it } from "vitest";
import type { AreaCode, Lead, TaskWithComputed } from "@/lib/api/types";
import { buildMilestones, buildSnapshot, missingWork, ownerSnapshot, priorityArea } from "./file";

const t = (code: string, patch: Partial<TaskWithComputed> = {}): TaskWithComputed =>
  ({
    id: code, code, name: `Tarea ${code}`, area: code.slice(0, 2) as AreaCode, status: "pending", is_blocked: false, is_overdue: false, due_date: "2026-11-01",
    acceptance_criteria: "", step: "survey", business_id: "b", organization_id: "o", assignee_user_id: "u", supervisor_user_id: "s",
    depends_on_task_ids: [], start_date: "2026-10-01", current_version: 0, updated_at: "", ...patch,
  }) as TaskWithComputed;

describe("ficha del negocio", () => {
  it("maps each assessment priority to the area that works on it", () => {
    expect(priorityArea("Ordenar contratos y licencias")).toBe("B6");
    expect(priorityArea("Marca registrada")).toBe("B6");
    expect(priorityArea("Marca y presencia local")).toBe("B5");
    expect(priorityArea("Números del negocio")).toBe("B3");
    expect(priorityArea("Agenda y sistema de citas")).toBe("B4");
    expect(priorityArea("Documentar el método de obra")).toBe("B2");
    expect(priorityArea("Sumar tiempo operando")).toBe("B1");
  });
  it("what is missing: required not approved, overdue, blocked, and priorities whose area has unapproved tasks", () => {
    const tasks = [
      t("B6-01", { status: "accepted" }),
      t("B3-01"),
      t("B2-01", { is_overdue: true, due_date: "2026-10-01" }),
      t("B2-02", { is_blocked: true }),
      t("B5-01", { status: "accepted" }),
      t("B4-01", { status: "cancelled", is_overdue: true }),
    ];
    const m = missingWork(tasks, ["B6-01", "B3-01"], [
      { text: "Números", area: "B3" },
      { text: "Marca", area: "B5" },
      { text: "Herramientas", area: "B4" },
    ]);
    expect(m.required.map((x) => x.code)).toEqual(["B3-01"]);
    expect(m.overdue.map((x) => x.code)).toEqual(["B2-01"]);
    expect(m.blocked.map((x) => x.code)).toEqual(["B2-02"]);
    // B5 is all approved and B4 only has a cancelled task: closed.
    expect(m.open_priorities).toEqual([{ text: "Números", area: "B3", open: 1 }]);
  });
  it("the owner gets the snapshot without score or band", () => {
    const s = ownerSnapshot({
      business_id: "b", lead_id: "l", taken_at: "", submitted_at: "", know_how_example: null, priorities: [],
      contact: { name: "", email: "", phone: "", city: "", state: "", hispanic_owner: true },
      business: { name: "", industry: "salon", activity: "", revenue_range: "lt_250k", margin_range: "lt_10", team_range: "1_5", years_range: "2_5", has_active_clients: true },
      result: { band: "high", score: 80, eligible_program: true, eligibility_gaps: [], blocks: [], strengths: ["x"], priorities: ["y"] },
    });
    expect(s.result).toMatchObject({ score: null, band: null, strengths: ["x"], priorities: ["y"] });
  });
  it("a business added by hand without an assessment keeps no snapshot", () => {
    const manual = {
      id: "l", submitted_at: "2026-10-01T12:00:00Z", know_how_example: null, result: null,
      contact: { name: "", email: "", phone: "", city: "", state: "", hispanic_owner: false },
      business: { name: "", industry: "salon", activity: "", revenue_range: "lt_250k", margin_range: "lt_10", team_range: "1_5", years_range: "2_5", has_active_clients: true },
    } as unknown as Lead;
    expect(buildSnapshot(manual, "b", "2026-10-09T12:00:00Z")).toBeNull();
  });
  it("milestones come newest first", () => {
    const list = buildMilestones({
      snapshot: { submitted_at: "2026-09-21T13:00:00Z" },
      meeting_at: "2026-09-25T14:00:00Z",
      contract_signed_at: "2026-10-05T12:00:00Z",
      program_started_at: "2026-10-09T12:00:00Z",
      consultant_changes: [{ id: "c1", at: "2026-10-10T10:00:00Z", from: "Nicolás", to: "Camila" }],
      firm_changes: [],
      required_approved: [{ id: "r1", at: "2026-10-12T10:00:00Z", task_code: "B6-01", task_name: "Acta" }],
    });
    expect(list.map((m) => m.kind)).toEqual(["required_approved", "consultant_changed", "program_started", "contract_signed", "meeting", "assessment"]);
  });
});
