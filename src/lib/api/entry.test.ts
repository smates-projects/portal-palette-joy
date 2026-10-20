import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";
import * as seed from "./mock/seed";
import { entryPhase } from "@/lib/leads/entry";

describe("automatic entry (mock)", () => {
  it("seed leads: the summary only exists with a booked meeting, sent on or after the booking", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const leads = await api.leads.list();
    expect(leads.every((l) => l.source === "landing")).toBe(true);
    for (const l of leads) {
      if (l.summary_sent_at) expect(l.meeting && l.summary_sent_at >= l.meeting.booked_at).toBe(true);
      else expect(l.meeting).toBeNull();
    }
    // Evaluated without a booking: no email yet.
    for (const name of ["Torres Concrete", "Andes Painting", "Pinturas Mamá Lucy", "Limpieza Total Orlando"])
      expect(leads.find((l) => l.business.name === name)).toMatchObject({ stage: "evaluated", meeting: null, summary_sent_at: null });
    const rivera = leads.find((l) => l.business.name === "Rivera Roofing & Remodel")!;
    // Held yesterday and nobody answered "¿Se hizo?": the portal already asked.
    expect(rivera).toMatchObject({
      stage: "meeting",
      meeting: { kind: "initial", starts_at: "2026-10-13T14:00:00Z", duration_minutes: 30, outcome: null, outcome_prompted_at: "2026-10-13T14:30:00Z" },
    });
    expect(rivera.summary_sent_at).not.toBeNull();
    // The booking created his account and the NDA: the lead already has its entry checklist.
    expect(rivera.intake).toMatchObject({ nda_signed: false, mou_sent: false });
    expect((await api.leads.listMeetings()).map((m) => m.business_name)).toEqual(["Rivera Roofing & Remodel"]);
    const events = (await api.leads.get(rivera.id))!.events;
    expect(events.find((e) => e.kind === "meeting_booked")).toMatchObject({ actor_user_id: null, to: "meeting" });
    // Nicolás has it in his bell, pointing at the meeting.
    expect((await api.notifications.list()).find((n) => n.kind === "meeting_outcome_pending")).toMatchObject({ lead_id: rivera.id, meeting_id: rivera.meeting!.id });
  });

  it("Simular assessment: routed by zone to SM Miami, in Evaluado with no email sent, and the consultant hears about it", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const l = await api.leads.simulateAssessment();
    expect(l).toMatchObject({ stage: "evaluated", office_id: seed.ORG_SM, consultant_user_id: seed.U_NICOLAS, meeting: null, last_contact_at: null, summary_sent_at: null });
    expect(entryPhase(l)).toBe("assessment");
    expect((await api.leads.get(l.id))!.events.some((e) => e.kind === "summary_sent")).toBe(false);
    expect((await api.leads.list()).some((x) => x.id === l.id)).toBe(true);
    const n = (await api.notifications.list()).find((x) => x.kind === "lead_assessment");
    expect(n).toMatchObject({ lead_id: l.id, business_name: l.business.name, lead_place: `${l.contact.city}, ${l.contact.state}` });
  });

  it("Simular reserva: the lead moves to Reunión by itself with a 30-minute meeting in the next 7 days", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const l = await api.leads.simulateAssessment();
    const booked = await api.leads.simulateBooking(l.id);
    expect(booked.stage).toBe("meeting");
    expect(booked.last_contact_at).toBeNull();
    expect(booked.meeting!.duration_minutes).toBe(30);
    expect(booked.meeting!.meet_url).toMatch(/^https:\/\/meet\.google\.com\//);
    const day = booked.meeting!.starts_at.slice(0, 10);
    expect(day > "2026-10-14" && day <= "2026-10-21").toBe(true);
    expect((await api.notifications.list()).some((x) => x.kind === "meeting_booked" && x.lead_id === l.id && !!x.meeting_at)).toBe(true);
    await expect(api.leads.simulateBooking(l.id)).rejects.toThrow("invalid_transition");
  });

  it("Simular reserva sends the summary with the meeting: summary_sent_at is set and the phase is summary_sent", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const l = await api.leads.simulateAssessment();
    const booked = await api.leads.simulateBooking(l.id);
    expect(booked.summary_sent_at).not.toBeNull();
    expect(booked.summary_sent_at! >= booked.meeting!.booked_at).toBe(true);
    expect(entryPhase(booked)).toBe("summary_sent");
    const kinds = (await api.leads.get(l.id))!.events.map((e) => e.kind);
    expect(kinds).toContain("meeting_booked");
    expect(kinds).toContain("summary_sent");
  });

  it("zones: SM reads them, only SM Global changes them", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const rules = await api.routing.getRules();
    expect(rules.default_office_id).toBe(seed.ORG_SM);
    await expect(api.routing.setRule({ state: "TX", city: null, office_id: seed.ORG_SM })).rejects.toThrow("global_only");
    await api.session.setViewAs(seed.U_MARYLIN);
    const z = await api.routing.setRule({ state: "tx", city: "Houston", office_id: seed.ORG_SM });
    expect(z).toMatchObject({ state: "TX", city: "Houston" });
    await expect(api.routing.setRule({ state: "TX", city: "houston", office_id: seed.ORG_SM })).rejects.toThrow("duplicate_zone");
    await api.routing.removeRule(z.id);
    expect((await api.routing.getRules()).zones.some((x) => x.id === z.id)).toBe(false);
    await api.session.setViewAs(seed.U_LUCIA);
    await expect(api.routing.getRules()).rejects.toThrow("forbidden");
  });
});

describe("ficha del negocio (mock)", () => {
  it("keeps the assessment of businesses in program; the owner gets it without the score; firms get nothing", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const s = await api.businessFile.getSnapshot(seed.BIZ_ENYERMY);
    expect(s).toMatchObject({ business_id: seed.BIZ_ENYERMY, result: { score: 68, band: "mid" } });
    expect(s!.priorities).toEqual([{ text: "Números del negocio", area: "B3" }, { text: "Agenda y sistema de turnos de las cuadrillas", area: "B4" }]);
    expect(await api.businessFile.getSnapshot(seed.BIZ_BIMBO)).toBeNull();
    await api.session.setViewAs(seed.U_MARYLIN);
    expect((await api.businessFile.getSnapshot(seed.BIZ_ENYERMY))!.result.score).toBe(68);
    await api.session.setViewAs(seed.U_ENYERMY);
    expect((await api.businessFile.getSnapshot())!.result).toMatchObject({ score: null, band: null });
    await expect(api.businessFile.listMilestones(seed.BIZ_ENYERMY)).rejects.toThrow("forbidden");
    await api.session.setViewAs(seed.U_LUCIA);
    await expect(api.businessFile.getSnapshot(seed.BIZ_ENYERMY)).rejects.toThrow("forbidden");
  });

  it("milestones of a business, newest first", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const kinds = (await api.businessFile.listMilestones(seed.BIZ_ENYERMY)).map((m) => m.kind);
    expect(kinds).toContain("assessment");
    expect(kinds).toContain("meeting");
    expect(kinds).toContain("program_started");
    expect(kinds.at(-1)).toBe("assessment");
  });

  it("a program that starts keeps its snapshot and marks the tasks of its strong areas", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_CAMILA);
    const brisa = (await api.leads.list()).find((l) => l.business.name === "Brisa Clean Services")!;
    const r = await api.leads.startProgram(brisa.id, "2026-10-14");
    expect((await api.businessFile.getSnapshot(r.business_id))!.taken_at.slice(0, 10)).toBe("2026-10-14");
    // Brisa: "Tus trabajos y la calidad" is strong → B2.
    const tasks = (await api.tasks.list()).filter((t) => t.business_id === r.business_id);
    expect(tasks.filter((t) => t.pre_validation === "pending").every((t) => t.area === "B2")).toBe(true);
    expect(tasks.some((t) => t.pre_validation === "pending")).toBe(true);
  });
});

describe("Ya lo tenía (mock)", () => {
  it("Enyermy, in its Diagnóstico, has its legal tasks not started to validate (Tu información y tus acuerdos is strong)", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const marked = (await api.tasks.list()).filter((t) => t.business_id === seed.BIZ_ENYERMY && t.pre_validation === "pending");
    expect(marked.map((t) => t.code).sort()).toEqual(["B6-02", "B6-03", "B6-04", "B6-06"]);
  });

  it("approves as Ya existía without the firm, counts for franchisability, and undoes", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const task = (await api.tasks.list()).find((t) => t.business_id === seed.BIZ_ENYERMY && t.code === "B6-03")!;
    const before = (await api.businesses.getFranchisability(seed.BIZ_ENYERMY)).franchisability_pct;
    await expect(api.tasks.resolvePreValidation(task.id, { decision: "existing", evidence_file_name: " ", note: "" })).rejects.toThrow("evidence_required");
    const done = await api.tasks.resolvePreValidation(task.id, { decision: "existing", evidence_file_name: "plan-de-ventas.pdf", note: "Lo usan desde 2024" });
    expect(done).toMatchObject({ status: "accepted", pre_validation: "existing", approval_source: "existing" });
    expect((await api.businesses.getFranchisability(seed.BIZ_ENYERMY)).franchisability_pct).toBeGreaterThan(before);
    const undone = await api.tasks.resolvePreValidation(task.id, { decision: "pending" });
    expect(undone).toMatchObject({ status: "pending", pre_validation: "pending", approval_source: null });
    expect((await api.tasks.get(task.id))!.comments.some((c) => c.body.includes("plan-de-ventas.pdf"))).toBe(false);
  });

  it("only the SM team decides", async () => {
    const api = createMockApi();
    await api.session.setViewAs(seed.U_NICOLAS);
    const task = (await api.tasks.list()).find((t) => t.business_id === seed.BIZ_ENYERMY && t.code === "B6-04")!;
    await api.session.setViewAs(seed.U_ENYERMY);
    await expect(api.tasks.resolvePreValidation(task.id, { decision: "needed" })).rejects.toThrow("sm_only");
  });
});
