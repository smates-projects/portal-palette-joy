import { afterEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "./client";
import { createHttpTasksRepository, taskListQuery, toFrontTask, type TaskApi } from "./tasks";
import {
  IDS,
  dataResponse,
  emptyResponse,
  jsonResponse,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TASK = IDS.member;
const OTHER = IDS.newFirm;
const REQUEST = IDS.request;
const MEETING = IDS.zone;
const UPLOAD_URL = "https://storage.test/quarantine/abc?X-Amz-Signature=sig";
const FILE_1 = "f1111111-1111-4111-8111-111111111111";
const FILE_2 = "f2222222-2222-4222-8222-222222222222";
const FILE_3 = "f3333333-3333-4333-8333-333333333333";
const FILE_4 = "f4444444-4444-4444-8444-444444444444";

/** TaskApiSchema: B1-01 in progress, version 3. */
const taskApi = (overrides: Partial<TaskApi> = {}): TaskApi => ({
  id: TASK,
  code: "B1-01",
  name: "Contrato de franquicia",
  acceptance_criteria: "Contrato firmado",
  area: "B1",
  step: "design",
  status: "in_progress",
  business_id: IDS.business,
  organization_id: IDS.firm,
  assignee_user_id: IDS.lucia,
  supervisor_user_id: IDS.andrea,
  depends_on_task_ids: [],
  start_date: "2026-10-01",
  due_date: "2026-10-30",
  current_version: 0,
  updated_at: "2026-10-15T12:00:00.000Z",
  accepted_at: null,
  pre_validation: null,
  approval_source: null,
  is_blocked: false,
  is_overdue: false,
  last_submitted_at: null,
  version: 3,
  blocked_by_codes: [],
  collaborator_user_ids: [],
  business_name: "Vossler",
  ...overrides,
});

const versionFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.event,
  task_id: TASK,
  version: 1,
  submitted_by_user_id: IDS.lucia,
  submitted_at: "2026-10-19T12:00:00.000Z",
  note: "Primera versión",
  files: [{ id: FILE_1, name: "contrato.pdf", size_kb: 12 }],
  status: "submitted",
  review_comment_id: null,
  brand: null,
  ...overrides,
});

const commentFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.event,
  task_id: TASK,
  author_user_id: IDS.lucia,
  body: "Revisa la cláusula 4",
  created_at: "2026-10-19T12:00:00.000Z",
  kind: "comment",
  file_id: null,
  ...overrides,
});

const ownerRequestFixture = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST,
  task_id: TASK,
  requested_by_user_id: IDS.lucia,
  question: "¿Tienes el registro de marca?",
  due_date: "2026-10-25",
  answer: null,
  status: "open",
  created_at: "2026-10-19T12:00:00.000Z",
  resolved_at: null,
  ...overrides,
});

const meetingFixture = (overrides: Record<string, unknown> = {}) => ({
  id: MEETING,
  task_id: TASK,
  proposed_by_user_id: IDS.lucia,
  topic: "Revisar contrato",
  starts_at: "2026-10-22T15:00:00.000Z",
  duration_minutes: 30,
  status: "proposed",
  ...overrides,
});

const detailFixture = (task: TaskApi = taskApi()) => ({
  task,
  versions: [versionFixture()],
  comments: [commentFixture()],
  owner_requests: [ownerRequestFixture()],
  meetings: [meetingFixture()],
  events: [],
});

const presigned = (fileId: string) =>
  dataResponse(
    {
      file_id: fileId,
      upload_url: `${UPLOAD_URL}&id=${fileId}`,
      headers: { "x-amz-meta-file": fileId },
      expires_at: "2026-10-19T12:05:00.000Z",
    },
    201,
  );
/** The three replies of one upload: presign, PUT to storage, complete. */
const uploadReplies = (fileId: string) => [
  presigned(fileId),
  emptyResponse(200),
  dataResponse({ id: fileId, status: "pending" }, 202),
];

const setup = () => {
  const client = testClient();
  return { client, tasks: createHttpTasksRepository(client) };
};

const pdf = (name: string) => new File([`%PDF-1.7 ${name}`], name, { type: "application/pdf" });

/** 1x1 transparent PNG, as readImageAsDataUrl gives a picked logo. */
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const route = (c: { method: string; path: string }) => `${c.method} ${c.path}`;

describe("http tasks: reads", () => {
  it("list: GET /tasks with limit=500, follows next_cursor, maps to the front's task and keeps each version", async () => {
    const { calls } = stubFetch(
      jsonResponse({
        data: [taskApi()],
        meta: { total: 2, next_cursor: "c2", page: null, counts: {} },
      }),
      jsonResponse({
        data: [taskApi({ id: OTHER, version: 7 })],
        meta: { total: 2, next_cursor: null, page: null, counts: {} },
      }),
    );
    const { tasks, client } = setup();
    const list = await tasks.list();
    expect(list).toEqual([toFrontTask(taskApi()), toFrontTask(taskApi({ id: OTHER, version: 7 }))]);
    expect(list[0]).not.toHaveProperty("version");
    expect(list[0]).not.toHaveProperty("business_name");
    expect(calls.map(route)).toEqual(["GET /tasks?limit=500", "GET /tasks?limit=500&cursor=c2"]);
    expect(client.etags.get(`/tasks/${OTHER}`)).toBe('"7"');
  });

  it("list: the front's filters become the API's query", async () => {
    const { calls } = stubFetch(dataResponse([]));
    await setup().tasks.list({
      include_cancelled: true,
      business_id: IDS.business,
      area: ["B1", "B5"],
      status: ["submitted", "changes_requested"],
      assignee_user_id: IDS.lucia,
      due_from: "2026-10-01",
      due_to: "2026-10-31",
      q: " contrato ",
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/tasks");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      business_id: IDS.business,
      area: "B1,B5",
      status: "submitted,changes_requested",
      assignee: IDS.lucia,
      due_from: "2026-10-01",
      due_to: "2026-10-31",
      q: "contrato",
      include_cancelled: "true",
      limit: "500",
    });
  });

  it("taskListQuery: a one-letter search is no search; include_cancelled false is left out", () => {
    expect(taskListQuery({ q: "a", include_cancelled: false })).toEqual({
      business_id: undefined,
      area: undefined,
      status: undefined,
      assignee: undefined,
      due_from: undefined,
      due_to: undefined,
      q: undefined,
      include_cancelled: undefined,
      limit: 500,
    });
  });

  it("get: GET /tasks/{id} split into the TaskDetail parts, ETag kept; 404 is null", async () => {
    const { calls } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      problemResponse(404, "not_found"),
    );
    const { tasks, client } = setup();
    expect(await tasks.get(TASK)).toEqual({
      task: toFrontTask(taskApi()),
      versions: [versionFixture()],
      comments: [commentFixture()],
      owner_requests: [ownerRequestFixture()],
      meetings: [meetingFixture()],
      events: [],
    });
    expect(calls[0]).toMatchObject({ method: "GET", path: `/tasks/${TASK}` });
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"3"');
    expect(await tasks.get(OTHER)).toBeNull();
  });

  it("listUpcomingMeetings: GET /task-meetings/upcoming", async () => {
    const { calls } = stubFetch(dataResponse([meetingFixture()]));
    expect(await setup().tasks.listUpcomingMeetings()).toEqual([meetingFixture()]);
    expect(route(calls[0]!)).toBe("GET /task-meetings/upcoming");
  });

  it("listMeetings: GET /task-meetings", async () => {
    const { calls } = stubFetch(dataResponse([meetingFixture({ status: "confirmed" })]));
    expect(await setup().tasks.listMeetings()).toEqual([meetingFixture({ status: "confirmed" })]);
    expect(route(calls[0]!)).toBe("GET /task-meetings");
  });

  it("listVersions: GET /versions", async () => {
    const { calls } = stubFetch(dataResponse([versionFixture()]));
    expect(await setup().tasks.listVersions()).toEqual([versionFixture()]);
    expect(route(calls[0]!)).toBe("GET /versions");
  });

  it("listOpenOwnerRequests: GET /owner-requests?status=open", async () => {
    const { calls } = stubFetch(dataResponse([ownerRequestFixture()]));
    expect(await setup().tasks.listOpenOwnerRequests()).toEqual([ownerRequestFixture()]);
    expect(route(calls[0]!)).toBe("GET /owner-requests?status=open");
  });
});

describe("http tasks: SM changes", () => {
  it("update: PATCH /tasks { items } with the cached version, reading the unknown task first", async () => {
    const changed = [
      taskApi({ due_date: "2026-11-15", version: 4 }),
      taskApi({ id: OTHER, due_date: "2026-11-15", version: 9 }),
    ];
    const { calls } = stubFetch(
      dataResponse(detailFixture(taskApi({ id: OTHER, version: 8 })), 200, { ETag: '"8"' }),
      dataResponse(changed),
    );
    const { tasks, client } = setup();
    client.etags.set(`/tasks/${TASK}`, '"3"');
    expect(await tasks.update([TASK, OTHER], { due_date: "2026-11-15" })).toEqual(
      changed.map(toFrontTask),
    );
    expect(calls.map(route)).toEqual([`GET /tasks/${OTHER}`, "PATCH /tasks"]);
    expect(calls[1]?.body).toEqual({
      items: [
        { id: TASK, version: 3, due_date: "2026-11-15" },
        { id: OTHER, version: 8, due_date: "2026-11-15" },
      ],
    });
    expect(calls[1]?.headers["If-Match"]).toBeUndefined();
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"4"');
    expect(client.etags.get(`/tasks/${OTHER}`)).toBe('"9"');
  });

  it("cancel: POST /tasks/cancel { ids, reason }", async () => {
    const cancelled = taskApi({ status: "cancelled", version: 4 });
    const { calls } = stubFetch(dataResponse([cancelled]));
    expect(await setup().tasks.cancel([TASK], "Ya no aplica")).toEqual([toFrontTask(cancelled)]);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/tasks/cancel",
      body: { ids: [TASK], reason: "Ya no aplica" },
    });
  });

  it("resolvePreValidation existing: uploads the evidence (pre_validation), then POST /pre-validation", async () => {
    const accepted = taskApi({
      status: "accepted",
      pre_validation: "existing",
      approval_source: "existing",
      version: 4,
    });
    const { calls } = stubFetch(
      ...uploadReplies(FILE_1),
      dataResponse(accepted, 200, { ETag: '"4"' }),
    );
    const { tasks, client } = setup();
    const evidence = pdf("plan-de-ventas.pdf");
    expect(
      await tasks.resolvePreValidation(TASK, {
        decision: "existing",
        evidence_file_name: evidence.name,
        note: "Lo usan desde 2024",
        evidence_file: evidence,
      }),
    ).toEqual(toFrontTask(accepted));
    expect(calls.map(route)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}&id=${FILE_1}`,
      `POST /files/${FILE_1}/complete`,
      `POST /tasks/${TASK}/pre-validation`,
    ]);
    expect(calls[0]?.body).toMatchObject({
      context: "pre_validation",
      original_name: "plan-de-ventas.pdf",
    });
    expect(calls[3]?.body).toEqual({
      decision: "existing",
      evidence_file_id: FILE_1,
      note: "Lo usan desde 2024",
    });
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"4"');
  });

  it("resolvePreValidation needed / pending: just the decision", async () => {
    const { calls } = stubFetch(
      dataResponse(taskApi({ pre_validation: "needed" })),
      dataResponse(taskApi({ pre_validation: "pending" })),
    );
    const { tasks } = setup();
    await tasks.resolvePreValidation(TASK, { decision: "needed" });
    await tasks.resolvePreValidation(TASK, { decision: "pending" });
    expect(calls.map((c) => c.body)).toEqual([{ decision: "needed" }, { decision: "pending" }]);
  });

  it("resolvePreValidation existing with a name only: invalid_file, without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(
      setup().tasks.resolvePreValidation(TASK, {
        decision: "existing",
        evidence_file_name: "plan.pdf",
        note: "",
      }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });
});

describe("http tasks: the deliverable loop", () => {
  it("start: POST /tasks/{id}/start, the new ETag lands on the task", async () => {
    const { calls } = stubFetch(dataResponse(taskApi({ version: 4 }), 200, { ETag: '"4"' }));
    const { tasks, client } = setup();
    expect(await tasks.start(TASK)).toEqual(toFrontTask(taskApi({ version: 4 })));
    expect(calls[0]).toMatchObject({ method: "POST", path: `/tasks/${TASK}/start` });
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"4"');
  });

  it("updateStatus: in_progress is start; any status without an endpoint is not_implemented without calling", async () => {
    const { calls } = stubFetch(dataResponse(taskApi()));
    const { tasks } = setup();
    await tasks.updateStatus(TASK, "in_progress");
    expect(route(calls[0]!)).toBe(`POST /tasks/${TASK}/start`);
    await expect(tasks.updateStatus(TASK, "accepted")).rejects.toThrow("not_implemented");
    expect(calls).toHaveLength(1);
  });

  it("updateStatus pending: POST /tasks/{id}/unstart with If-Match, the new ETag lands on the task", async () => {
    const pending = taskApi({ status: "pending", version: 5 });
    const { calls } = stubFetch(dataResponse(pending, 200, { ETag: '"5"' }));
    const { tasks, client } = setup();
    client.etags.set(`/tasks/${TASK}`, '"4"');
    expect(await tasks.updateStatus(TASK, "pending")).toEqual(toFrontTask(pending));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/tasks/${TASK}/unstart`,
      body: undefined,
    });
    expect(calls[0]?.headers["If-Match"]).toBe('"4"');
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"5"');
  });

  it("updateStatus pending: reads the task first when its version is unknown", async () => {
    const { calls } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      dataResponse(taskApi({ status: "pending", version: 4 })),
    );
    await setup().tasks.updateStatus(TASK, "pending");
    expect(calls.map(route)).toEqual([`GET /tasks/${TASK}`, `POST /tasks/${TASK}/unstart`]);
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
  });

  it("a blocked task: the 409 arrives as ApiError blocked with the API's detail", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          type: "urn:sm:problem:blocked",
          title: "Conflict",
          status: 409,
          code: "blocked",
          detail: "Blocked by B6-01.",
        }),
        { status: 409, headers: { "Content-Type": "application/problem+json" } },
      ),
    );
    const error = await setup()
      .tasks.start(TASK)
      .catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({
      code: "blocked",
      status: 409,
      detail: "Blocked by B6-01.",
      message: "blocked",
    });
  });

  it("submitVersion: reads the ETag, uploads every file in order, then POST /versions with If-Match", async () => {
    const created = versionFixture({
      files: [
        { id: FILE_1, name: "contrato.pdf", size_kb: 1 },
        { id: FILE_2, name: "anexo.pdf", size_kb: 1 },
      ],
    });
    const { calls, fetchMock } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      ...uploadReplies(FILE_1),
      ...uploadReplies(FILE_2),
      dataResponse(created, 201, { ETag: '"4"' }),
    );
    const { tasks, client } = setup();
    const first = pdf("contrato.pdf");
    const second = pdf("anexo.pdf");

    expect(
      await tasks.submitVersion(TASK, {
        note: "Primera versión",
        file_names: [first.name, second.name],
        files: [first, second],
      }),
    ).toEqual(created);

    expect(calls.map(route)).toEqual([
      `GET /tasks/${TASK}`,
      "POST /files/presign",
      `PUT ${UPLOAD_URL}&id=${FILE_1}`,
      `POST /files/${FILE_1}/complete`,
      "POST /files/presign",
      `PUT ${UPLOAD_URL}&id=${FILE_2}`,
      `POST /files/${FILE_2}/complete`,
      `POST /tasks/${TASK}/versions`,
    ]);
    expect(calls[1]?.body).toEqual({
      context: "task_version",
      original_name: "contrato.pdf",
      mime: "application/pdf",
      size_bytes: first.size,
      business_id: IDS.business,
    });
    expect(calls[4]?.body).toMatchObject({ context: "task_version", original_name: "anexo.pdf" });
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(first);
    expect(fetchMock.mock.calls[5]?.[1]?.body).toBe(second);
    expect(calls[7]?.body).toEqual({
      note: "Primera versión",
      file_ids: [FILE_1, FILE_2],
      brand_proposal: null,
    });
    expect(calls[7]?.headers["If-Match"]).toBe('"3"');
    expect(calls[7]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"4"');
  });

  it("submitVersion B5-13: the files, then the manual (task_version) and the logo (brand), as brand_proposal", async () => {
    const { calls, fetchMock } = stubFetch(
      ...uploadReplies(FILE_1),
      ...uploadReplies(FILE_2),
      ...uploadReplies(FILE_3),
      dataResponse(versionFixture(), 201),
    );
    const { tasks, client } = setup();
    client.etags.set(`/tasks/${TASK}`, '"5"');
    const diagnosis = pdf("B5-13.pdf");
    const manual = pdf("manual-marca.pdf");

    await tasks.submitVersion(TASK, {
      note: "Manual de marca",
      file_names: [diagnosis.name, manual.name, "logo.png"],
      files: [diagnosis],
      brand: {
        primary_color: "#153f58",
        accent_color: "#a77e00",
        font_family: "Inter",
        logo_file_name: "logo.png",
        logo_url: PNG_DATA_URL,
        manual_file_name: manual.name,
        manual_file: manual,
      },
    });

    expect(calls.filter((c) => c.path === "/files/presign").map((c) => c.body)).toEqual([
      expect.objectContaining({ context: "task_version", original_name: "B5-13.pdf" }),
      expect.objectContaining({ context: "task_version", original_name: "manual-marca.pdf" }),
      expect.objectContaining({ context: "brand", original_name: "logo.png", mime: "image/png" }),
    ]);
    expect((fetchMock.mock.calls[7]?.[1]?.body as Blob).type).toBe("image/png");
    expect(calls[9]).toMatchObject({ method: "POST", path: `/tasks/${TASK}/versions` });
    expect(calls[9]?.headers["If-Match"]).toBe('"5"');
    expect(calls[9]?.body).toEqual({
      note: "Manual de marca",
      file_ids: [FILE_1, FILE_2, FILE_3],
      brand_proposal: {
        primary_color: "#153f58",
        accent_color: "#a77e00",
        font_family: "Inter",
        logo_file_id: FILE_3,
        manual_file_id: FILE_2,
      },
    });
  });

  it("submitVersion: names without their Files are invalid_file, without calling the API", async () => {
    const { calls } = stubFetch();
    const { tasks } = setup();
    await expect(tasks.submitVersion(TASK, { note: "", file_names: ["a.pdf"] })).rejects.toThrow(
      "invalid_file",
    );
    await expect(
      tasks.submitVersion(TASK, {
        note: "",
        file_names: ["manual.pdf"],
        brand: {
          primary_color: "#153f58",
          accent_color: "#a77e00",
          font_family: null,
          logo_file_name: null,
          logo_url: null,
          manual_file_name: "manual.pdf",
        },
      }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("approve: POST /approve with If-Match", async () => {
    const accepted = taskApi({ status: "accepted", version: 6 });
    const { calls } = stubFetch(dataResponse(accepted, 200, { ETag: '"6"' }));
    const { tasks, client } = setup();
    client.etags.set(`/tasks/${TASK}`, '"5"');
    expect(await tasks.approve(TASK)).toEqual(toFrontTask(accepted));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/tasks/${TASK}/approve`,
      body: undefined,
    });
    expect(calls[0]?.headers["If-Match"]).toBe('"5"');
    expect(client.etags.get(`/tasks/${TASK}`)).toBe('"6"');
  });

  it("requestChanges: reads the ETag when unknown, then POST /request-changes { note } with If-Match", async () => {
    const changes = taskApi({ status: "changes_requested", version: 4 });
    const { calls } = stubFetch(
      dataResponse(detailFixture(), 200, { ETag: '"3"' }),
      dataResponse(changes),
    );
    expect(await setup().tasks.requestChanges(TASK, "Falta la firma")).toEqual(
      toFrontTask(changes),
    );
    expect(calls.map(route)).toEqual([`GET /tasks/${TASK}`, `POST /tasks/${TASK}/request-changes`]);
    expect(calls[1]?.body).toEqual({ note: "Falta la firma" });
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
  });

  it("approve: a stale version is precondition_failed", async () => {
    stubFetch(problemResponse(412, "precondition_failed"));
    const { tasks, client } = setup();
    client.etags.set(`/tasks/${TASK}`, '"1"');
    await expect(tasks.approve(TASK)).rejects.toThrow("precondition_failed");
  });
});

describe("http tasks: comments, owner requests and meetings", () => {
  it("addComment: POST /comments { body, file_id } about a file of the task", async () => {
    const { calls } = stubFetch(dataResponse(commentFixture({ file_id: FILE_1 }), 201));
    expect(
      await setup().tasks.addComment(TASK, { body: "Revisa la cláusula 4", file_id: FILE_1 }),
    ).toEqual(commentFixture({ file_id: FILE_1 }));
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/tasks/${TASK}/comments`,
      body: { body: "Revisa la cláusula 4", file_id: FILE_1 },
    });
  });

  it("addComment with a File: uploads it (task_comment) and sends its id", async () => {
    const { calls } = stubFetch(
      ...uploadReplies(FILE_4),
      dataResponse(commentFixture({ file_id: FILE_4 }), 201),
    );
    await setup().tasks.addComment(TASK, {
      body: "Te dejo el borrador",
      file_id: null,
      file: pdf("borrador.pdf"),
    });
    expect(calls[0]?.body).toMatchObject({
      context: "task_comment",
      original_name: "borrador.pdf",
    });
    expect(calls[3]?.body).toEqual({ body: "Te dejo el borrador", file_id: FILE_4 });
  });

  it("addOwnerRequest: POST /owner-requests { question, due_date }", async () => {
    const { calls } = stubFetch(dataResponse(ownerRequestFixture(), 201));
    expect(
      await setup().tasks.addOwnerRequest(TASK, {
        question: "¿Tienes el registro de marca?",
        due_date: "2026-10-25",
      }),
    ).toEqual(ownerRequestFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/tasks/${TASK}/owner-requests`,
      body: { question: "¿Tienes el registro de marca?", due_date: "2026-10-25" },
    });
  });

  it("setOwnerRequestResolved: PATCH /owner-requests/{id} { resolved }", async () => {
    const resolved = ownerRequestFixture({
      status: "resolved",
      resolved_at: "2026-10-19T13:00:00.000Z",
    });
    const { calls } = stubFetch(dataResponse(resolved));
    expect(await setup().tasks.setOwnerRequestResolved(REQUEST, true)).toEqual(resolved);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/owner-requests/${REQUEST}`,
      body: { resolved: true },
    });
  });

  it("answerOwnerRequest: uploads the File (owner_request), then POST /answer { note, file_id }", async () => {
    const answered = ownerRequestFixture({
      status: "resolved",
      answer: "Aquí está (registro.pdf)",
    });
    const { calls } = stubFetch(...uploadReplies(FILE_1), dataResponse(answered));
    const file = pdf("registro.pdf");
    expect(
      await setup().tasks.answerOwnerRequest(REQUEST, {
        file_name: file.name,
        note: "Aquí está",
        file,
      }),
    ).toEqual(answered);
    expect(calls[0]?.body).toMatchObject({
      context: "owner_request",
      original_name: "registro.pdf",
    });
    expect(calls[3]).toMatchObject({
      method: "POST",
      path: `/owner-requests/${REQUEST}/answer`,
      body: { note: "Aquí está", file_id: FILE_1 },
    });
  });

  it("answerOwnerRequest: a file name without its File is invalid_file, without calling", async () => {
    const { calls } = stubFetch();
    await expect(
      setup().tasks.answerOwnerRequest(REQUEST, { file_name: "registro.pdf", note: "" }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("proposeMeeting: POST /meetings { topic, starts_at, duration_minutes }", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture(), 201));
    const input = {
      topic: "Revisar contrato",
      starts_at: "2026-10-22T15:00:00.000Z",
      duration_minutes: 30,
    };
    expect(await setup().tasks.proposeMeeting(TASK, input)).toEqual(meetingFixture());
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/tasks/${TASK}/meetings`,
      body: input,
    });
  });

  it("confirmMeeting: POST /task-meetings/{id}/confirm", async () => {
    const { calls } = stubFetch(dataResponse(meetingFixture({ status: "confirmed" })));
    expect(await setup().tasks.confirmMeeting(MEETING)).toEqual(
      meetingFixture({ status: "confirmed" }),
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/task-meetings/${MEETING}/confirm`,
      body: undefined,
    });
  });
});
