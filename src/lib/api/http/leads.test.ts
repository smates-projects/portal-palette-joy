import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpLeadsRepository } from "./leads";
import {
  IDS,
  contractFixture,
  dataResponse,
  documentFixture,
  intakeSummaryFixture,
  jsonResponse,
  leadEventFixture,
  leadFixture,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const LEAD = IDS.request;
const LEAD_PATH = `/leads/${LEAD}`;
const DOC = IDS.member;
const CONTRACT = IDS.newFirm;
const UNMATCHED = IDS.zone;

const setup = () => {
  const client = testClient();
  return { client, leads: createHttpLeadsRepository(client) };
};

/** GET /leads/{id} as the API answers it: the front's detail plus the screen extras. */
const detailFixture = (overrides: Record<string, unknown> = {}) => ({
  lead: leadFixture(overrides),
  events: [leadEventFixture()],
  entry: { phase: "meeting_scheduled", steps: [] },
  unbooked_days: null,
  meetings: [],
  intake: null,
});

describe("http leads", () => {
  it("list: GET /leads with the office filter, following the cursor until the end", async () => {
    const second = leadFixture({ id: IDS.zone });
    const { calls } = stubFetch(
      jsonResponse({ data: [leadFixture()], meta: { next_cursor: "c2" } }),
      jsonResponse({ data: [second], meta: { next_cursor: null } }),
    );
    expect(await setup().leads.list({ office_id: IDS.office })).toEqual([leadFixture(), second]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /leads?office_id=${IDS.office}&limit=200`,
      `GET /leads?office_id=${IDS.office}&limit=200&cursor=c2`,
    ]);
  });

  it("get: GET /leads/{id}, only { lead, events }, and the ETag kept", async () => {
    const { calls } = stubFetch(dataResponse(detailFixture(), 200, { ETag: '"7"' }));
    const { leads, client } = setup();
    // The meeting comes back normalized by the one selector (kind and outcome explicit, no expansion meeting yet).
    const lead = leadFixture();
    expect(await leads.get(LEAD)).toEqual({
      lead: { ...lead, meeting: { ...lead.meeting, kind: "initial", outcome: null, outcome_prompted_at: null }, expansion_meeting: null },
      events: [leadEventFixture()],
    });
    expect(calls[0]).toMatchObject({ method: "GET", path: LEAD_PATH });
    expect(client.etags.get(LEAD_PATH)).toBe('"7"');
  });

  it("get: a lead out of reach (404) is null", async () => {
    stubFetch(problemResponse(404, "not_found"));
    expect(await setup().leads.get(LEAD)).toBeNull();
  });

  it("move: reads the lead for its ETag, then POST /move with If-Match; the new ETag is kept", async () => {
    const moved = leadFixture({ stage: "evaluated" });
    const { calls } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      dataResponse(moved, 200, { ETag: '"4"' }),
      dataResponse(leadFixture(), 200, { ETag: '"5"' }),
    );
    const { leads, client } = setup();
    expect(await leads.move(LEAD, "evaluated")).toEqual(moved);
    expect(calls[0]).toMatchObject({ method: "GET", path: LEAD_PATH });
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/move`,
      body: { to: "evaluated" },
    });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    // Known ETag: no second read.
    await leads.move(LEAD, "meeting");
    expect(calls[2]).toMatchObject({ method: "POST", path: `${LEAD_PATH}/move` });
    expect(calls[2]?.headers["If-Match"]).toBe('"4"');
    expect(client.etags.get(LEAD_PATH)).toBe('"5"');
  });

  it("move: a stale version is precondition_failed", async () => {
    stubFetch(problemResponse(412, "precondition_failed"));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"1"');
    await expect(leads.move(LEAD, "evaluated")).rejects.toThrow("precondition_failed");
  });

  it("discard: POST /discard with the reason and If-Match", async () => {
    const discarded = leadFixture({
      stage: "discarded",
      discarded_from: "meeting",
      discard_reason: "No califica",
    });
    const { calls } = stubFetch(dataResponse(discarded, 200, { ETag: '"9"' }));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"8"');
    expect(await leads.discard(LEAD, "No califica")).toEqual(discarded);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/discard`,
      body: { reason: "No califica" },
    });
    expect(calls[0]?.headers["If-Match"]).toBe('"8"');
  });

  it("approveDocuments: reads the lead when no ETag is known, then POST /approve-documents with If-Match", async () => {
    const accepted = leadFixture({ stage: "accepted" });
    const { calls } = stubFetch(
      dataResponse(detailFixture({ stage: "documents" }), 200, { ETag: '"12"' }),
      dataResponse(accepted, 200, { ETag: '"13"' }),
    );
    expect(await setup().leads.approveDocuments(LEAD)).toEqual(accepted);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${LEAD_PATH}`,
      `POST ${LEAD_PATH}/approve-documents`,
    ]);
    expect(calls[1]?.headers["If-Match"]).toBe('"12"');
    expect(calls[1]?.body).toBeUndefined();
  });

  it("addNote: POST /notes with an Idempotency-Key; the cached version is dropped", async () => {
    const note = leadEventFixture({ body: "Llamar el lunes" });
    const { calls } = stubFetch(dataResponse(note, 201));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"2"');
    expect(await leads.addNote(LEAD, "Llamar el lunes")).toEqual(note);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/notes`,
      body: { body: "Llamar el lunes" },
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.has(LEAD_PATH)).toBe(false);
  });

  it("sendNda: POST /send-nda with an Idempotency-Key, and the lead's new ETag is kept", async () => {
    const withNda = leadFixture({ stage: "meeting", business_id: IDS.business });
    const { calls } = stubFetch(dataResponse(withNda, 200, { ETag: '"6"' }));
    const { leads, client } = setup();
    expect(await leads.sendNda(LEAD)).toEqual(withNda);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${LEAD_PATH}/send-nda` });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.get(LEAD_PATH)).toBe('"6"');
  });

  it("sendMou: POST /send-mou with an Idempotency-Key, and the lead's new ETag is kept", async () => {
    const inDocuments = leadFixture({ stage: "documents", business_id: IDS.business });
    const { calls } = stubFetch(dataResponse(inDocuments, 200, { ETag: '"7"' }));
    const { leads, client } = setup();
    expect(await leads.sendMou(LEAD)).toEqual(inDocuments);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${LEAD_PATH}/send-mou` });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.get(LEAD_PATH)).toBe('"7"');
  });

  it("getIntake: GET /leads/{id}/intake; null before NDA and MOU", async () => {
    const intake = {
      summary: intakeSummaryFixture(),
      contracts: [contractFixture()],
      documents: [documentFixture()],
    };
    const { calls } = stubFetch(dataResponse(intake), dataResponse(null));
    const { leads } = setup();
    expect(await leads.getIntake(LEAD)).toEqual(intake);
    expect(await leads.getIntake(LEAD)).toBeNull();
    expect(calls[0]).toMatchObject({ method: "GET", path: `${LEAD_PATH}/intake` });
  });

  it("acceptDocument: POST /documents/{doc}/accept with the verified fact (left out when empty)", async () => {
    const reviewed = documentFixture({ state: "reviewed", verified_fact: "Ventas 2025: 640k" });
    const { calls } = stubFetch(dataResponse(reviewed), dataResponse(reviewed));
    const { leads } = setup();
    expect(await leads.acceptDocument(LEAD, DOC, "Ventas 2025: 640k")).toEqual(reviewed);
    await leads.acceptDocument(LEAD, DOC, "  ");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/documents/${DOC}/accept`,
      body: { verified_fact: "Ventas 2025: 640k" },
    });
    expect(calls[1]?.body).toEqual({});
  });

  it("requestDocument: POST /documents/{doc}/request with the comment", async () => {
    const rejected = documentFixture({ state: "rejected", review_comment: "Falta agosto" });
    const { calls } = stubFetch(dataResponse(rejected));
    expect(await setup().leads.requestDocument(LEAD, DOC, "Falta agosto")).toEqual(rejected);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/documents/${DOC}/request`,
      body: { comment: "Falta agosto" },
    });
  });

  it("resendContract: POST /contracts/{c}/resend", async () => {
    const { calls } = stubFetch(dataResponse(contractFixture()));
    expect(await setup().leads.resendContract(LEAD, CONTRACT)).toEqual(contractFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/contracts/${CONTRACT}/resend`,
    });
  });

  it("rejectDocuments: POST /reject-documents with the reason as comment", async () => {
    const discarded = leadFixture({ stage: "discarded", discarded_from: "documents" });
    const { calls } = stubFetch(dataResponse(discarded, 200, { ETag: '"4"' }));
    expect(await setup().leads.rejectDocuments(LEAD, "Documentos falsos")).toEqual(discarded);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/reject-documents`,
      body: { comment: "Documentos falsos" },
    });
  });

  it("getInvestors: GET /leads/{id}/investors (empty until phase 3)", async () => {
    const investors = { views: [], bishop: null, tripartite: null };
    const { calls } = stubFetch(dataResponse(investors));
    expect(await setup().leads.getInvestors(LEAD)).toEqual(investors);
    expect(calls[0]).toMatchObject({ method: "GET", path: `${LEAD_PATH}/investors` });
  });

  it("getInvestors: candidates keyed by `id` get their user_id; a presented Bishop who never opened it is not a view", async () => {
    stubFetch(
      dataResponse({
        views: [
          { bishop_user_id: IDS.member, name: "Jefferson Paula", viewed_at: null, decision: "none", decided_at: null, status: "presented", presented_at: "2026-10-20T06:41:35Z" },
          { bishop_user_id: IDS.zone, name: "Laura Ortega", viewed_at: "2026-10-20T07:00:00Z", decision: "passed", decided_at: "2026-10-20T08:00:00Z", status: "passed", presented_at: null },
        ],
        bishop: null,
        tripartite: null,
        presented: [{ bishop_user_id: IDS.member, name: "Jefferson Paula", presented_at: "2026-10-20T06:41:35Z" }],
        candidates: [
          { id: IDS.member, name: "Jefferson Paula", framework_signed: true },
          { id: IDS.newFirm, name: "Diego Rivas", framework_signed: false },
        ],
      }),
    );
    const investors = await setup().leads.getInvestors(LEAD);
    expect(investors?.views.map((v) => v.bishop_user_id)).toEqual([IDS.zone]);
    expect(investors?.candidates).toEqual([
      { user_id: IDS.member, name: "Jefferson Paula", framework_signed: true },
      { user_id: IDS.newFirm, name: "Diego Rivas", framework_signed: false },
    ]);
  });

  it("get: the API's `meeting` (latest of any kind, no id) becomes the initial and expansion meetings with ids from meetings[]", async () => {
    const expansionNoId = { ...leadFixture().meeting, starts_at: "2026-10-14T05:12:33.249Z", kind: "expansion", outcome: "held", outcome_prompted_at: null };
    const initialRow = { ...leadFixture().meeting, id: IDS.member, kind: "initial", outcome: "held", outcome_prompted_at: null };
    stubFetch(
      dataResponse({
        ...detailFixture({ meeting: expansionNoId, stage: "in_program" }),
        meetings: [{ ...expansionNoId, id: IDS.zone, source: "manual", note: "ok" }, initialRow],
      }),
    );
    const detail = await setup().leads.get(LEAD);
    expect(detail?.lead.meeting).toMatchObject({ id: IDS.member, kind: "initial", starts_at: leadFixture().meeting.starts_at });
    expect(detail?.lead.expansion_meeting).toMatchObject({ id: IDS.zone, kind: "expansion", outcome: "held" });
  });

  it("createManual: POST /leads with the manual lead and an Idempotency-Key", async () => {
    const created = leadFixture({ source: "manual", stage: "evaluated", meeting: null });
    const { calls } = stubFetch(dataResponse(created, 201, { ETag: '"1"' }));
    const input = {
      contact: leadFixture().contact,
      business: leadFixture().business,
      origin_note: "Referido de Vossler",
    } as Parameters<ReturnType<typeof createHttpLeadsRepository>["createManual"]>[0];
    expect(await setup().leads.createManual(input)).toEqual(created);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/leads", body: input });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("sendAssessment: POST /send-assessment", async () => {
    const sent = leadFixture({ source: "manual", assessment_sent_at: "2026-10-19T12:00:00.000Z" });
    const { calls } = stubFetch(dataResponse(sent, 200, { ETag: '"2"' }));
    const { leads, client } = setup();
    expect(await leads.sendAssessment(LEAD)).toEqual(sent);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${LEAD_PATH}/send-assessment` });
    expect(client.etags.get(LEAD_PATH)).toBe('"2"');
  });

  it("setMeetingOutcome: reads the lead for its ETag, then POST /meetings/{m}/outcome with If-Match and the note only for held", async () => {
    const MEETING = IDS.zone;
    const inDocuments = leadFixture({ stage: "documents" });
    const { calls } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      dataResponse(inDocuments, 200, { ETag: '"4"' }),
      dataResponse(leadFixture(), 200, { ETag: '"5"' }),
    );
    const { leads, client } = setup();
    expect(await leads.setMeetingOutcome(LEAD, MEETING, { outcome: "held", note: " Quiere franquiciar en 2027 " })).toEqual(inDocuments);
    expect(calls[0]).toMatchObject({ method: "GET", path: LEAD_PATH });
    expect(calls[1]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/meetings/${MEETING}/outcome`,
      body: { outcome: "held", note: "Quiere franquiciar en 2027" },
    });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    // No note with no_show (even if one is given), and the known ETag is used.
    await leads.setMeetingOutcome(LEAD, MEETING, { outcome: "no_show", note: "x" });
    expect(calls[2]).toMatchObject({ body: { outcome: "no_show" } });
    expect(calls[2]?.headers["If-Match"]).toBe('"4"');
    expect(client.etags.get(LEAD_PATH)).toBe('"5"');
  });

  it("setMeetingOutcome: outcome_already_set arrives as the error code", async () => {
    stubFetch(problemResponse(409, "outcome_already_set"));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"1"');
    await expect(leads.setMeetingOutcome(LEAD, IDS.zone, { outcome: "reschedule" })).rejects.toThrow("outcome_already_set");
  });

  it("presentToBishops: POST /present-to-bishops { bishop_user_ids } answers the investors; the cached ETag is dropped", async () => {
    const investors = { views: [], bishop: null, tripartite: null, presented: [{ bishop_user_id: IDS.member, name: "Jefferson Paula", presented_at: "2026-10-14T12:00:00Z" }] };
    const { calls } = stubFetch(dataResponse(investors));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"2"');
    expect(await leads.presentToBishops(LEAD, [IDS.member])).toEqual(investors);
    expect(calls[0]).toMatchObject({ method: "POST", path: `${LEAD_PATH}/present-to-bishops`, body: { bishop_user_ids: [IDS.member] } });
    expect(client.etags.has(LEAD_PATH)).toBe(false);
  });

  it("listMeetings: GET /meetings", async () => {
    const item = {
      lead_id: LEAD,
      business_name: "Castillo Instalaciones",
      owner_name: "Ramón Castillo",
      city: "Miami",
      state: "FL",
      meeting: leadFixture().meeting,
    };
    const { calls } = stubFetch(dataResponse([item]));
    expect(await setup().leads.listMeetings()).toEqual([item]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/meetings" });
  });

  it("bookMeeting: POST /meetings with duration_min and a null Meet link when empty", async () => {
    const { calls } = stubFetch(dataResponse(leadFixture(), 201, { ETag: '"3"' }));
    const { leads, client } = setup();
    await leads.bookMeeting(LEAD, {
      starts_at: "2026-10-21T14:00:00.000Z",
      duration_minutes: 45,
      meet_url: " ",
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/meetings`,
      body: { starts_at: "2026-10-21T14:00:00.000Z", duration_min: 45, meet_url: null },
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.get(LEAD_PATH)).toBe('"3"');
  });

  it("linkMeeting: POST /link-meeting with the unmatched event", async () => {
    const { calls } = stubFetch(dataResponse(leadFixture()));
    expect(await setup().leads.linkMeeting(LEAD, UNMATCHED)).toEqual(leadFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/link-meeting`,
      body: { unmatched_event_id: UNMATCHED },
    });
  });

  it("listUnmatchedCalendarEvents: GET /unmatched-calendar-events", async () => {
    const { calls } = stubFetch(dataResponse([]));
    expect(await setup().leads.listUnmatchedCalendarEvents()).toEqual([]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/unmatched-calendar-events" });
  });

  it("sendTripartite: POST /send-tripartite with an Idempotency-Key; the contract back, the lead's version dropped", async () => {
    const tripartite = contractFixture({ kind: "tripartite", name: "Contrato tripartito" });
    const { calls } = stubFetch(dataResponse(tripartite));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"5"');
    expect(await leads.sendTripartite(LEAD)).toEqual(tripartite);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/send-tripartite`,
      body: undefined,
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.has(LEAD_PATH)).toBe(false);
  });

  it("releaseOpportunity: POST /release-opportunity with the reason; the lead's new ETag is kept", async () => {
    const released = leadFixture({ stage: "accepted", bishop_user_id: null });
    const { calls } = stubFetch(dataResponse(released, 200, { ETag: '"8"' }));
    const { leads, client } = setup();
    expect(await leads.releaseOpportunity(LEAD, "Sin respuesta del inversor")).toEqual(released);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `${LEAD_PATH}/release-opportunity`,
      body: { reason: "Sin respuesta del inversor" },
    });
    expect(client.etags.get(LEAD_PATH)).toBe('"8"');
  });

  it("confirmProgramStart: reads the lead for its ETag, then POST /confirm-program-start with If-Match and day1", async () => {
    const started = leadFixture({ stage: "in_program", business_id: IDS.business });
    const { calls } = stubFetch(
      dataResponse(detailFixture({ stage: "accepted" }), 200, { ETag: '"10"' }),
      dataResponse(
        { lead: started, business_id: IDS.business, task_count: 87, day1: "2026-11-02" },
        200,
        { ETag: '"11"' },
      ),
    );
    const { leads, client } = setup();
    // The API's day1 is dropped: the front's contract is { lead, business_id, task_count }.
    expect(await leads.confirmProgramStart(LEAD, "2026-11-02")).toEqual({
      lead: started,
      business_id: IDS.business,
      task_count: 87,
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET ${LEAD_PATH}`,
      `POST ${LEAD_PATH}/confirm-program-start`,
    ]);
    expect(calls[1]?.headers["If-Match"]).toBe('"10"');
    expect(calls[1]?.body).toEqual({ day1: "2026-11-02" });
    expect(client.etags.get(LEAD_PATH)).toBe('"11"');
  });

  it("confirmProgramStart: funds not complete answer the API's code", async () => {
    stubFetch(problemResponse(409, "not_ready"));
    const { leads, client } = setup();
    client.etags.set(LEAD_PATH, '"10"');
    await expect(leads.confirmProgramStart(LEAD, "2026-11-02")).rejects.toThrow("not_ready");
  });

  it.each([
    [
      "simulateAssessment",
      (r: ReturnType<typeof createHttpLeadsRepository>) => r.simulateAssessment(),
    ],
    [
      "simulateBooking",
      (r: ReturnType<typeof createHttpLeadsRepository>) => r.simulateBooking(LEAD),
    ],
    [
      "startProgram",
      (r: ReturnType<typeof createHttpLeadsRepository>) => r.startProgram(LEAD, "2026-11-02"),
    ],
  ])("%s (gap): rejects with not_implemented without calling the API", async (_name, call) => {
    const { calls } = stubFetch();
    await expect(call(setup().leads)).rejects.toThrow("not_implemented");
    expect(calls).toHaveLength(0);
  });
});
