// LeadsRepository over the real API (pipeline module: leads.controller.ts and meetings.controller.ts).
// Every write that changes the lead answers its new ETag; it is kept under the lead's path (`resource`), so the
// next guarded write (move, discard, approve-documents) sends a current If-Match without reading again.
import type { LeadDetail, LeadIntake, LeadsRepository } from "../repositories";
import type {
  BusinessDocument,
  Contract,
  IsoDateTime,
  LeadEvent,
  LeadInvestors,
  LeadMeetingItem,
  LeadWithComputed,
  Uuid,
} from "../types";
import { getOrNull, listAllByCursor, notImplemented, type HttpClient } from "./client";
import { entryMeetings, type RawMeeting } from "@/lib/leads/meetings";

/** GET /leads/{id}: the front's LeadDetail plus what the API computes for the detail screen (dropped here). */
interface LeadDetailResponse extends LeadDetail {
  entry?: unknown;
  unbooked_days?: number | null;
  meetings?: unknown[];
  intake?: LeadIntake | null;
}

/** POST /leads/{id}/confirm-program-start: the front's result plus the day 1 the API set. */
interface ProgramStartResponse {
  lead: LeadWithComputed;
  business_id: Uuid;
  task_count: number;
  day1: string;
}

/** A booking the calendar sync could not match to a lead (always empty until Google Calendar, phase 5). */
export interface UnmatchedCalendarEvent {
  id: Uuid;
  consultant_user_id: Uuid;
  attendee_email: string | null;
  attendee_name: string | null;
  starts_at: IsoDateTime;
  duration_minutes: number;
  meet_url: string | null;
}

/** A meeting SM enters by hand (until Google Calendar arrives). */
export interface ManualMeetingInput {
  starts_at: IsoDateTime;
  duration_minutes: number;
  meet_url: string | null;
}

/**
 * Endpoints the API already has and the front's contract does not use yet (no screen for them). They live on the
 * adapter only, ready for the screen that adopts them.
 */
export interface HttpLeadsRepository extends LeadsRepository {
  /** POST /leads/{id}/meetings: Evaluado → Reunión with a meeting typed by SM; the summary email goes out. */
  bookMeeting(id: Uuid, input: ManualMeetingInput): Promise<LeadWithComputed>;
  /** POST /leads/{id}/link-meeting: attaches an unmatched calendar booking to the lead. */
  linkMeeting(id: Uuid, unmatchedEventId: Uuid): Promise<LeadWithComputed>;
  /** GET /unmatched-calendar-events. */
  listUnmatchedCalendarEvents(): Promise<UnmatchedCalendarEvent[]>;
}

/** Biggest page the API serves; the helper walks the cursor until the end. */
const PAGE_LIMIT = 200;

const leadPath = (id: Uuid) => `/leads/${encodeURIComponent(id)}`;

/**
 * GET /leads/{id}: the API's `meeting` is the latest meeting of any kind and the ids live in `meetings[]`. The front's
 * lead carries the initial one in `meeting` and the expansion one in `expansion_meeting`, both with their ids.
 */
export function withDetailMeetings(lead: LeadWithComputed, meetings: unknown[] | undefined): LeadWithComputed {
  const resolved = entryMeetings({
    meeting: lead.meeting,
    expansion_meeting: lead.expansion_meeting,
    meetings: (meetings ?? []) as RawMeeting[],
  });
  return { ...lead, meeting: resolved.initial ?? lead.meeting, expansion_meeting: resolved.expansion };
}

/** The board has no `meetings[]`: an expansion meeting sent as `meeting` is at least known as the expansion one. */
function withBoardMeetings(lead: LeadWithComputed): LeadWithComputed {
  if (lead.meeting?.kind !== "expansion" || lead.expansion_meeting) return lead;
  return { ...lead, expansion_meeting: lead.meeting };
}

/** The API's investor rows as they arrive (candidates keyed by `id`, presented Bishops listed as views). */
interface InvestorsResponse extends Omit<LeadInvestors, "views" | "candidates"> {
  views?: (Omit<LeadInvestors["views"][number], "viewed_at"> & { viewed_at: IsoDateTime | null; presented_at?: IsoDateTime | null })[];
  candidates?: { id?: Uuid; user_id?: Uuid; name: string; framework_signed?: boolean }[];
}

/**
 * GET /investors and POST /present-to-bishops. `views` keeps only the Bishops that opened the opportunity (a presented
 * Bishop who never opened it comes with viewed_at null) and every candidate gets its `user_id`: the API keys them by
 * `id`, which left the checkboxes without a key (one tick ticked all, and the request sent [null]).
 */
export function normalizeInvestors(raw: InvestorsResponse): LeadInvestors {
  const { views, candidates, ...rest } = raw;
  const opened = (views ?? []).flatMap(({ presented_at: _presented, ...v }) => (v.viewed_at ? [{ ...v, viewed_at: v.viewed_at }] : []));
  return {
    ...rest,
    views: opened,
    ...(candidates
      ? {
          candidates: candidates.flatMap((c) => {
            const userId = c.user_id ?? c.id;
            return userId ? [{ user_id: userId, name: c.name, ...(c.framework_signed !== undefined ? { framework_signed: c.framework_signed } : {}) }] : [];
          }),
        }
      : {}),
  };
}

export function createHttpLeadsRepository(client: HttpClient): HttpLeadsRepository {
  /** A write that changes the lead: its answer carries the lead's new ETag. */
  const leadWrite = <T = LeadWithComputed>(
    id: Uuid,
    action: string,
    body?: unknown,
    idempotent = false,
  ) => {
    const resource = leadPath(id);
    return client.post<T>(`${resource}/${action}`, body, { resource, idempotent });
  };

  /**
   * move, discard, approve-documents, confirm-program-start and the meeting outcome require If-Match with the lead's ETag. When none is
   * known (the board only lists leads), the lead is read first; a stale one answers precondition_failed.
   */
  const guardedWrite = async <T = LeadWithComputed>(id: Uuid, action: string, body?: unknown) => {
    const resource = leadPath(id);
    if (!client.etags.has(resource)) await client.get<LeadDetailResponse>(resource);
    return leadWrite<T>(id, action, body);
  };

  /**
   * Writes that may change the lead (last contact, intake state) without answering its new version: the cached
   * ETag is dropped so the next guarded write reads the lead again instead of failing with a stale version.
   */
  const forgetVersion = <T>(id: Uuid, value: T): T => {
    client.etags.delete(leadPath(id));
    return value;
  };

  return {
    list: async (opts) =>
      (
        await listAllByCursor<LeadWithComputed>(client, "/leads", {
          office_id: opts?.office_id,
          limit: PAGE_LIMIT,
        })
      ).map(withBoardMeetings),

    get: async (id) => {
      const detail = await getOrNull<LeadDetailResponse>(client, leadPath(id));
      return detail ? { lead: withDetailMeetings(detail.lead, detail.meetings), events: detail.events } : null;
    },

    move: (id, to) => guardedWrite(id, "move", { to }),

    /** POST /meetings { ..., source: "manual" } (Idempotency-Key): "Registrar reunión". The new ETag is kept. */
    registerMeeting: (id, input) =>
      leadWrite(
        id,
        "meetings",
        {
          starts_at: input.starts_at,
          duration_minutes: input.duration_minutes,
          meet_url: input.meet_url?.trim() ? input.meet_url.trim() : null,
          source: "manual",
        },
        true,
      ),

    discard: (id, reason) => guardedWrite(id, "discard", { reason }),

    /** POST /reactivate (If-Match on the lead): SM Global brings back a lead discarded by itself (mou_not_signed). */
    reactivate: (id) => guardedWrite(id, "reactivate"),

    /** POST /transfer { office_id, consultant_user_id } (If-Match on the lead): "Derivar a oficina". */
    transfer: (id, input) =>
      guardedWrite(id, "transfer", { office_id: input.office_id, consultant_user_id: input.consultant_user_id ?? null }),

    addNote: async (id, body) =>
      forgetVersion(
        id,
        await client.post<LeadEvent>(`${leadPath(id)}/notes`, { body }, { idempotent: true }),
      ),

    /** POST /send-nda (Idempotency-Key): owner account and NDA for a lead without a booking; the new ETag is kept. */
    sendNda: (id) => leadWrite(id, "send-nda", undefined, true),

    /** POST /send-mou (Idempotency-Key): Reunión → Documentación with the MOU; the new ETag is kept. */
    sendMou: (id) => leadWrite(id, "send-mou", undefined, true),

    /**
     * POST /meetings/{meetingId}/outcome (If-Match on the lead): the answer to "¿Se hizo?". The note travels only
     * with "held" and only when there is one.
     */
    setMeetingOutcome: (leadId, meetingId, input) => {
      const note = input.outcome === "held" ? input.note?.trim() : undefined;
      return guardedWrite(leadId, `meetings/${encodeURIComponent(meetingId)}/outcome`, {
        outcome: input.outcome,
        ...(note ? { note } : {}),
      });
    },

    /**
     * POST /present-to-bishops { bishop_user_ids } answers the lead, not the investors: the investors are read
     * right after with GET /investors.
     */
    presentToBishops: async (id, bishopUserIds) => {
      await client.post<unknown>(`${leadPath(id)}/present-to-bishops`, { bishop_user_ids: bishopUserIds });
      forgetVersion(id, null);
      const raw = await client.get<InvestorsResponse>(`${leadPath(id)}/investors`);
      return normalizeInvestors(raw);
    },

    getIntake: (id) => getOrNull<LeadIntake>(client, `${leadPath(id)}/intake`),

    acceptDocument: async (id, documentId, verifiedFact) =>
      forgetVersion(
        id,
        await client.post<BusinessDocument>(
          `${leadPath(id)}/documents/${encodeURIComponent(documentId)}/accept`,
          // The API answers 422 fact_required when the fact is empty.
          { verified_fact: verifiedFact.trim() },
        ),
      ),

    requestDocument: async (id, documentId, comment) =>
      forgetVersion(
        id,
        await client.post<BusinessDocument>(
          `${leadPath(id)}/documents/${encodeURIComponent(documentId)}/request`,
          { comment },
        ),
      ),

    resendContract: (id, contractId) =>
      client.post<Contract>(`${leadPath(id)}/contracts/${encodeURIComponent(contractId)}/resend`),

    approveDocuments: (id) => guardedWrite(id, "approve-documents"),

    /**
     * POST /confirm-program-start (If-Match on the lead): accepted → in_program with day 1 and the catalog's tasks.
     * The API also answers the day 1 it set, which the front's contract does not carry (dropped).
     */
    confirmProgramStart: async (id, day1) => {
      const result = await guardedWrite<ProgramStartResponse>(id, "confirm-program-start", {
        day1,
      });
      return { lead: result.lead, business_id: result.business_id, task_count: result.task_count };
    },

    /** Gap: deprecated path of the mock, never exposed by the API. Rejects without calling. */
    startProgram: async () => {
      throw notImplemented("Starting the program without the checks is not part of the API.");
    },

    rejectDocuments: (id, reason) => leadWrite(id, "reject-documents", { comment: reason }),

    getInvestors: async (id) => {
      const raw = await getOrNull<InvestorsResponse>(client, `${leadPath(id)}/investors`);
      return raw ? normalizeInvestors(raw) : null;
    },

    /** POST /release-opportunity { reason }: back to every Bishop; the lead's new ETag is kept. */
    releaseOpportunity: (id, reason) => leadWrite(id, "release-opportunity", { reason }),

    /**
     * POST /send-tripartite (Idempotency-Key). It answers the contract, not the lead, so the lead's cached version
     * is dropped: the next guarded write reads it again.
     */
    sendTripartite: async (id) =>
      forgetVersion(
        id,
        await client.post<Contract>(`${leadPath(id)}/send-tripartite`, undefined, {
          idempotent: true,
        }),
      ),

    createManual: (input) =>
      client.post<LeadWithComputed>(
        "/leads",
        { contact: input.contact, business: input.business, origin_note: input.origin_note },
        { idempotent: true },
      ),

    sendAssessment: (id) => leadWrite(id, "send-assessment", undefined, true),

    /** office_id only for SM Global looking at one office ("Viendo"); the office team never sends it. */
    listMeetings: (officeId) => client.get<LeadMeetingItem[]>("/meetings", officeId ? { query: { office_id: officeId } } : undefined),

    /**
     * Demo only. In production the assessment arrives at POST /webhooks/assessment signed with an HMAC secret
     * that the browser must never hold, so there is nothing to call: "Simular entrada" stays on the mock.
     */
    simulateAssessment: async () => {
      throw notImplemented("Simulating an assessment only exists in the demo (mock).");
    },

    /** Demo only: real bookings come from the consultant's calendar (phase 5) or from bookMeeting. */
    simulateBooking: async () => {
      throw notImplemented("Simulating a booking only exists in the demo (mock).");
    },

    bookMeeting: (id, input) =>
      leadWrite(
        id,
        "meetings",
        {
          starts_at: input.starts_at,
          duration_min: input.duration_minutes,
          meet_url: input.meet_url?.trim() ? input.meet_url.trim() : null,
        },
        true,
      ),

    linkMeeting: (id, unmatchedEventId) =>
      leadWrite(id, "link-meeting", { unmatched_event_id: unmatchedEventId }),

    listUnmatchedCalendarEvents: () =>
      client.get<UnmatchedCalendarEvent[]>("/unmatched-calendar-events"),

    /** PUT /validation: the draft of the definitive percentages. It answers the lead, with its new ETag. */
    saveValidation: (id, input) => {
      const resource = leadPath(id);
      return client.request<LeadWithComputed>("PUT", `${resource}/validation`, {
        resource,
        body: {
          equity_owner: input.equity_owner,
          equity_bishop: input.equity_bishop,
          equity_sm: input.equity_sm,
          investment_amount: input.investment_amount,
          notes: input.notes?.trim() ? input.notes.trim() : null,
          sm_square_center: input.sm_square_center?.trim() ? input.sm_square_center.trim() : null,
          sm_square_holder_user_id: input.sm_square_holder_user_id,
        },
      });
    },

    /** POST /validation/close (admin): the percentages become definitive. It answers the lead. */
    closeValidation: (id) => leadWrite(id, "validation/close"),
  };
}
