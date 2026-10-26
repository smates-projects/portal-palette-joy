import { describe, expect, it } from "vitest";
import { notificationTarget, type NotificationLike } from "./target";

const n = (fields: Partial<NotificationLike> & { kind: string }): NotificationLike => ({ task_id: "", business_id: "", ...fields });

describe("notificationTarget", () => {
  it("a Bishop opens every document to sign in Acuerdos, whatever the API sends with it", () => {
    for (const kind of ["contract_sent", "binding_ready", "contract_due_soon", "contract_signed"])
      expect(notificationTarget(n({ kind, lead_id: "lead-1", business_id: "biz-1" }), "bishop")).toEqual({ to: "/acuerdos" });
    // The framework agreement has no lead and no business: still Acuerdos, never his home.
    expect(notificationTarget(n({ kind: "contract_sent" }), "bishop")).toEqual({ to: "/acuerdos" });
  });

  it("a Bishop opens an opportunity in Oportunidades, never the Embudo", () => {
    expect(notificationTarget(n({ kind: "opportunity_presented", lead_id: "lead-1", opportunity_id: "lead-1" }), "bishop")).toEqual({
      to: "/oportunidades/$opportunityId",
      params: { opportunityId: "lead-1" },
    });
    expect(notificationTarget(n({ kind: "opportunity_available" }), "bishop")).toEqual({ to: "/oportunidades" });
  });

  it("the owner signs and uploads from Tu ingreso, on the step the notice is about", () => {
    expect(notificationTarget(n({ kind: "mou_ready", lead_id: "lead-1" }), "business_owner")).toEqual({ to: "/", search: { step: "mou" } });
    expect(notificationTarget(n({ kind: "binding_ready", lead_id: "lead-1" }), "business_owner")).toEqual({ to: "/", search: { step: "binding" } });
    expect(notificationTarget(n({ kind: "documents_unlocked", lead_id: "lead-1" }), "business_owner")).toEqual({ to: "/", search: { step: "documents" } });
    expect(notificationTarget(n({ kind: "document_requested" }), "business_owner")).toEqual({ to: "/", search: { step: "documents" } });
    expect(notificationTarget(n({ kind: "contract_sent", business_id: "biz-1" }), "business_owner")).toEqual({ to: "/", search: {} });
    // A program task still opens the task.
    expect(notificationTarget(n({ kind: "due_today", task_id: "task-1" }), "business_owner")).toEqual({ to: "/tareas", search: { task: "task-1" } });
  });

  it("Strategic Mates opens anything about a lead in the Embudo, where it signs for Strategic Mates", () => {
    for (const role of ["sm_team", "sm_global"] as const) {
      expect(notificationTarget(n({ kind: "contract_sent", lead_id: "lead-1" }), role)).toEqual({ to: "/embudo", search: { lead: "lead-1" } });
      expect(notificationTarget(n({ kind: "mou_ready", lead_id: "lead-1" }), role)).toEqual({ to: "/embudo", search: { lead: "lead-1" } });
      expect(notificationTarget(n({ kind: "lead_assessment", lead_id: "lead-1" }), role)).toEqual({ to: "/embudo", search: { lead: "lead-1" } });
    }
    expect(notificationTarget(n({ kind: "meeting_outcome_pending", lead_id: "lead-1" }), "sm_team")).toEqual({
      to: "/embudo",
      search: { lead: "lead-1", focus: "meeting" },
    });
  });

  it("SM Global countersigns a Bishop's framework agreement (a contract without a lead) in Bishops", () => {
    expect(notificationTarget(n({ kind: "contract_sent" }), "sm_global")).toEqual({ to: "/bishops" });
    expect(notificationTarget(n({ kind: "contract_signed" }), "sm_global")).toEqual({ to: "/bishops" });
  });

  it("tasks open the task; meetings the calendar; the calendar notices the profile", () => {
    expect(notificationTarget(n({ kind: "overdue", task_id: "task-1" }), "partner_firm")).toEqual({ to: "/tareas", search: { task: "task-1" } });
    expect(notificationTarget(n({ kind: "meeting_moved", meeting_id: "m-1" }), "sm_team")).toEqual({ to: "/tareas", search: { view: "calendar", meeting: "m-1" } });
    expect(notificationTarget(n({ kind: "calendar_disconnected" }), "bishop")).toEqual({ to: "/perfil" });
    expect(notificationTarget(n({ kind: "brand_logo_rejected", business_id: "biz-1" }), "sm_team")).toEqual({ to: "/negocios", search: { biz: "biz-1" } });
    expect(notificationTarget(n({ kind: "program_started", business_id: "biz-1" }), "partner_firm")).toEqual({ to: "/", search: {} });
  });
});
