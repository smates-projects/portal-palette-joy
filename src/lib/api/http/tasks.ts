// TasksRepository over the real API (program module: tasks.controller.ts). Notes:
// - Status names are the mock's (accepted, changes_requested...): no mapping.
// - Every task the API answers carries its row `version`; the adapter keeps it as the ETag of /tasks/{id} (also from
//   the list), so the deliverable writes (versions, approve, request-changes need If-Match) and the bulk PATCH
//   (one version per item) rarely need an extra read. A stale one answers precondition_failed.
// - Files travel through the files module (./files.ts): the adapter uploads the picked Files first and then sends
//   their ids. A name without its File (the mock's simulated upload) is invalid_file, without calling the API.
// - A task waiting for others answers 409 `blocked` ("Blocked by B6-01."): it arrives as ApiError code blocked, with
//   that detail.
import type {
  BrandProposalUpload,
  TaskDetail,
  TaskListOptions,
  TasksRepository,
} from "../repositories";
import type {
  Meeting,
  OwnerRequest,
  TaskComment,
  TaskVersion,
  TaskWithComputed,
  Uuid,
} from "../types";
import { ApiError, getOrNull, listAllByCursor, notImplemented, type HttpClient } from "./client";
import { invalidFile, isBlob, logoBlob, uploadFile, type FileContext } from "./files";

/** TaskApiSchema: the front's task plus what only the HTTP layer needs. */
export interface TaskApi extends TaskWithComputed {
  version: number;
  collaborator_user_ids: Uuid[];
  business_name: string;
}

interface TaskDetailResponse extends Omit<TaskDetail, "task"> {
  task: TaskApi;
}

/** The screens read the whole program at once; the API's own default, sent explicitly. */
export const TASKS_PAGE_LIMIT = 500;

const taskPath = (id: Uuid) => `/tasks/${encodeURIComponent(id)}`;
const ownerRequestPath = (id: Uuid) => `/owner-requests/${encodeURIComponent(id)}`;

/** `"3"`, `W/"3"` or `3` → 3 (the API's ETag is the row version). */
export function versionOfEtag(etag: string | undefined): number | null {
  const match = etag ? /^(?:W\/)?"?(\d{1,9})"?$/.exec(etag.trim()) : null;
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * The front's shape: the API-only fields are left out. What blocks the task (blocked_by_codes, blocked_by_task_ids),
 * is_due_today, is_stale and last_submitted_at stay: the screens show them as the API computed them.
 */
export function toFrontTask(task: TaskApi): TaskWithComputed {
  const {
    version: _version,
    collaborator_user_ids: _collaborators,
    business_name: _businessName,
    ...front
  } = task;
  return front;
}

const csv = (values: readonly string[] | undefined) =>
  values && values.length > 0 ? values.join(",") : undefined;

/** TaskListOptions → the query of GET /tasks (ListTasksQuerySchema). */
export function taskListQuery(opts: TaskListOptions = {}) {
  const q = opts.q?.trim();
  return {
    business_id: opts.business_id,
    area: csv(opts.area),
    status: csv(opts.status),
    assignee: opts.assignee_user_id,
    due_from: opts.due_from,
    due_to: opts.due_to,
    // The API wants 2 characters at least: a shorter search means "no search".
    q: q && q.length >= 2 ? q : undefined,
    include_cancelled: opts.include_cancelled ? "true" : undefined,
    limit: TASKS_PAGE_LIMIT,
  };
}

export function createHttpTasksRepository(client: HttpClient): TasksRepository {
  /** Business of each task seen, so uploads can name it (the API checks it and fills the office). */
  const businessOf = new Map<Uuid, Uuid>();

  /** Keeps the version of a task the API answered as the ETag of /tasks/{id}, and maps it to the front's shape. */
  const remember = (task: TaskApi): TaskWithComputed => {
    client.etags.set(taskPath(task.id), `"${task.version}"`);
    businessOf.set(task.id, task.business_id);
    return toFrontTask(task);
  };

  /** Reads the task when its ETag is not known yet (the writes guarded by If-Match need it). */
  const ensureEtag = async (id: Uuid) => {
    if (client.etags.has(taskPath(id))) return;
    const detail = await client.get<TaskDetailResponse>(taskPath(id));
    businessOf.set(detail.task.id, detail.task.business_id);
  };

  const versionOf = async (id: Uuid): Promise<number> => {
    await ensureEtag(id);
    const version = versionOfEtag(client.etags.get(taskPath(id)));
    if (version === null) {
      throw new ApiError({
        code: "precondition_required",
        status: 428,
        detail: `The API did not answer a version for task ${id}.`,
      });
    }
    return version;
  };

  /** A write on one task that answers the task: its new ETag lands on /tasks/{id}. */
  const taskWrite = async (id: Uuid, action: string, body?: unknown) =>
    remember(
      await client.post<TaskApi>(`${taskPath(id)}/${action}`, body, { resource: taskPath(id) }),
    );

  const upload = (file: Blob, context: FileContext, taskId: Uuid | null) =>
    uploadFile(client, file, {
      context,
      businessId: taskId ? (businessOf.get(taskId) ?? null) : null,
    });

  /**
   * B5-13: the manual (a document, context task_version) and the logo (context brand, the logos allowlist; it
   * becomes the public logo when the owner approves) are uploaded after the deliverable files.
   */
  const uploadBrand = async (taskId: Uuid, brand: BrandProposalUpload) => {
    if (!isBlob(brand.manual_file)) throw invalidFile("Pick the brand manual file to upload.");
    const logo = logoBlob(brand.logo_file, brand.logo_url);
    const manualFileId = await upload(brand.manual_file, "task_version", taskId);
    const logoFileId = logo
      ? await uploadFile(client, logo, {
          context: "brand",
          name: brand.logo_file?.name ?? brand.logo_file_name ?? "logo",
          businessId: businessOf.get(taskId) ?? null,
        })
      : null;
    return {
      fileIds: [manualFileId, ...(logoFileId ? [logoFileId] : [])],
      proposal: {
        primary_color: brand.primary_color,
        accent_color: brand.accent_color,
        font_family: brand.font_family,
        logo_file_id: logoFileId,
        manual_file_id: manualFileId,
      },
    };
  };

  return {
    /** GET /tasks with the filters, every page (meta.next_cursor). */
    list: async (opts) =>
      (await listAllByCursor<TaskApi>(client, "/tasks", taskListQuery(opts))).map(remember),

    /** GET /tasks/{id}: one call answers the whole detail; 404 (not visible) is null. */
    get: async (id) => {
      const detail = await getOrNull<TaskDetailResponse>(client, taskPath(id));
      if (!detail) return null;
      businessOf.set(detail.task.id, detail.task.business_id);
      return {
        task: toFrontTask(detail.task),
        versions: detail.versions,
        comments: detail.comments,
        owner_requests: detail.owner_requests,
        meetings: detail.meetings,
        events: detail.events,
      };
    },

    /** PATCH /tasks { items }: each item carries the version it read (cached ETag, or the task is read first). */
    update: async (ids, patch) => {
      const versions = await Promise.all(ids.map(versionOf));
      const items = ids.map((id, index) => ({ id, version: versions[index], ...patch }));
      return (await client.patch<TaskApi[]>("/tasks", { items })).map(remember);
    },

    cancel: async (ids, reason) =>
      (await client.post<TaskApi[]>("/tasks/cancel", { ids, reason })).map(remember),

    /**
     * "Empezar" is POST /start; "Volver a pendiente" is POST /unstart, guarded by If-Match (the task is read first
     * when its version is unknown). The API has no generic status change: any other status rejects with
     * not_implemented without calling (the screens move the rest through approve, request-changes, versions).
     */
    updateStatus: async (id, status) => {
      if (status === "in_progress") return taskWrite(id, "start");
      if (status === "pending") {
        await ensureEtag(id);
        return taskWrite(id, "unstart");
      }
      throw notImplemented(`The API has no endpoint to move a task to ${status}.`);
    },

    start: (id) => taskWrite(id, "start"),

    /** Uploads the deliverable files in order (then the brand's), and POST /versions with If-Match. */
    submitVersion: async (id, input) => {
      const files = input.files ?? [];
      if (files.some((file) => !isBlob(file))) throw invalidFile("Pick the files to upload.");
      const brandFiles = input.brand
        ? 1 + (input.brand.logo_file_name || input.brand.logo_file ? 1 : 0)
        : 0;
      if (input.file_names.length > files.length + brandFiles) {
        throw invalidFile("Pick the files to upload: names alone cannot be sent.");
      }
      // Fail before uploading anything when the brand cannot be sent.
      if (input.brand && !isBlob(input.brand.manual_file)) {
        throw invalidFile("Pick the brand manual file to upload.");
      }
      await ensureEtag(id);
      const fileIds: Uuid[] = [];
      for (const file of files) fileIds.push(await upload(file, "task_version", id));
      const brand = input.brand ? await uploadBrand(id, input.brand) : null;
      return client.post<TaskVersion>(
        `${taskPath(id)}/versions`,
        {
          note: input.note,
          // The API needs at least one file; the brand's count as files of the deliverable (as in the mock).
          file_ids: [...fileIds, ...(brand?.fileIds ?? [])],
          brand_proposal: brand?.proposal ?? null,
        },
        { resource: taskPath(id), idempotent: true },
      );
    },

    addComment: async (id, input) => {
      if (input.file !== undefined && input.file !== null && !isBlob(input.file)) {
        throw invalidFile("Pick the file to upload.");
      }
      const fileId = input.file ? await upload(input.file, "task_comment", id) : input.file_id;
      return client.post<TaskComment>(
        `${taskPath(id)}/comments`,
        { body: input.body, file_id: fileId },
        { idempotent: true },
      );
    },

    addOwnerRequest: (id, input) =>
      client.post<OwnerRequest>(
        `${taskPath(id)}/owner-requests`,
        { question: input.question, due_date: input.due_date },
        { idempotent: true },
      ),

    setOwnerRequestResolved: (requestId, resolved) =>
      client.patch<OwnerRequest>(ownerRequestPath(requestId), { resolved }),

    proposeMeeting: (id, input) =>
      client.post<Meeting>(
        `${taskPath(id)}/meetings`,
        {
          topic: input.topic,
          starts_at: input.starts_at,
          duration_minutes: input.duration_minutes,
        },
        { idempotent: true },
      ),

    listUpcomingMeetings: () => client.get<Meeting[]>("/task-meetings/upcoming"),

    listMeetings: () => client.get<Meeting[]>("/task-meetings"),

    listVersions: () => client.get<TaskVersion[]>("/versions"),

    listOpenOwnerRequests: () =>
      client.get<OwnerRequest[]>("/owner-requests", { query: { status: "open" } }),

    approve: async (id) => {
      await ensureEtag(id);
      return taskWrite(id, "approve");
    },

    requestChanges: async (id, note) => {
      await ensureEtag(id);
      return taskWrite(id, "request-changes", { note });
    },

    /** Uploads the File (context owner_request) and POST /answer { note, file_id }. A name alone is invalid_file. */
    answerOwnerRequest: async (requestId, input) => {
      if (isBlob(input.file)) {
        const fileId = await uploadFile(client, input.file, { context: "owner_request" });
        return client.post<OwnerRequest>(
          `${ownerRequestPath(requestId)}/answer`,
          { note: input.note, file_id: fileId },
          { idempotent: true },
        );
      }
      if (input.file_name.trim() || input.file) throw invalidFile("Pick the file to upload.");
      return client.post<OwnerRequest>(
        `${ownerRequestPath(requestId)}/answer`,
        { note: input.note, file_id: null },
        { idempotent: true },
      );
    },

    confirmMeeting: (meetingId) =>
      client.post<Meeting>(`/task-meetings/${encodeURIComponent(meetingId)}/confirm`),

    /** "Ya lo tenía" needs the evidence File (uploaded with context pre_validation); a name alone is invalid_file. */
    resolvePreValidation: async (id, input) => {
      if (input.decision !== "existing")
        return taskWrite(id, "pre-validation", { decision: input.decision });
      if (!isBlob(input.evidence_file)) throw invalidFile("Pick the evidence file to upload.");
      const evidenceFileId = await upload(input.evidence_file, "pre_validation", id);
      return taskWrite(id, "pre-validation", {
        decision: "existing",
        evidence_file_id: evidenceFileId,
        note: input.note,
      });
    },
  };
}
