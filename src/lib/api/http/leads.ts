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

/** GET /leads/{id}: the front's LeadDetail plus what the API computes for the detail screen (dropped here). */
interface LeadDetailResponse extends LeadDetail {
  entry?: unknown;
  unbooked_days?: number | null;
  meetings?: unknown[];
  intake?: LeadIntake | null;
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

export function createHttpLeadsRepository(client: HttpClient): HttpLeadsRepository {
  /** A write that changes the lead: its answer carries the lead's new ETag. */
  const leadWrite = (id: Uuid, action: string, body?: unknown, idempotent = false) => {
    const resource = leadPath(id);
    return client.post<LeadWithComputed>(`${resource}/${action}`, body, { resource, idempotent });
  };

  /**
   * move, discard and approve-documents require If-Match with the lead's ETag. When none is known (the board only
   * lists leads), the lead is read first; a stale one answers precondition_failed.
   */
  const guardedWrite = async (id: Uuid, action: string, body?: unknown) => {
    const resource = leadPath(id);
    if (!client.etags.has(resource)) await client.get<LeadDetailResponse>(resource);
    return leadWrite(id, action, body);
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
    list: (opts) =>
      listAllByCursor<LeadWithComputed>(client, "/leads", {
        office_id: opts?.office_id,
        limit: PAGE_LIMIT,
      }),

    get: async (id) => {
      const detail = await getOrNull<LeadDetailResponse>(client, leadPath(id));
      return detail ? { lead: detail.lead, events: detail.events } : null;
    },

    move: (id, to) => guardedWrite(id, "move", { to }),

    discard: (id, reason) => guardedWrite(id, "discard", { reason }),

    addNote: async (id, body) =>
      forgetVersion(
        id,
        await client.post<LeadEvent>(`${leadPath(id)}/notes`, { body }, { idempotent: true }),
      ),

    sendNdaMou: (id) => leadWrite(id, "send-nda-mou", undefined, true),

    getIntake: (id) => getOrNull<LeadIntake>(client, `${leadPath(id)}/intake`),

    acceptDocument: async (id, documentId, verifiedFact) =>
      forgetVersion(
        id,
        await client.post<BusinessDocument>(
          `${leadPath(id)}/documents/${encodeURIComponent(documentId)}/accept`,
          // Empty: the API uses the rule's hint, as the mock does.
          { verified_fact: verifiedFact.trim() ? verifiedFact : undefined },
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

    /** Gap: starting the program is phase 3 (tripartite contract and Bishop funds). Rejects without calling. */
    confirmProgramStart: async () => {
      throw notImplemented("Starting the program is not available in the API yet.");
    },

    /** Gap: deprecated path of the mock, never exposed by the API. Rejects without calling. */
    startProgram: async () => {
      throw notImplemented("Starting the program is not available in the API yet.");
    },

    rejectDocuments: (id, reason) => leadWrite(id, "reject-documents", { comment: reason }),

    getInvestors: (id) => getOrNull<LeadInvestors>(client, `${leadPath(id)}/investors`),

    /** Gap: opportunities for Bishops are phase 3. Rejects without calling. */
    releaseOpportunity: async () => {
      throw notImplemented("Releasing an opportunity is not available in the API yet.");
    },

    /** Gap: the tripartite contract is phase 3. Rejects without calling. */
    sendTripartite: async () => {
      throw notImplemented("The tripartite contract is not available in the API yet.");
    },

    createManual: (input) =>
      client.post<LeadWithComputed>(
        "/leads",
        { contact: input.contact, business: input.business, origin_note: input.origin_note },
        { idempotent: true },
      ),

    sendAssessment: (id) => leadWrite(id, "send-assessment", undefined, true),

    addMeetingNote: async (id, body) =>
      forgetVersion(
        id,
        await client.post<LeadEvent>(
          `${leadPath(id)}/meeting-note`,
          { body },
          { idempotent: true },
        ),
      ),

    listMeetings: () => client.get<LeadMeetingItem[]>("/meetings"),

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
  };
}
