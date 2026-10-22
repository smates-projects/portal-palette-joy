// SM Global's Calendario: what it shows depends on "Viendo".
// - The whole network or Corporate: her own calendar. The portal meetings she organizes or joins (GET /me/meetings),
//   the entry meetings of the leads she follows as consultant (from GET /leads) and her Google events, read only.
// - One office: that office's entry meetings (GET /leads?office_id=) and her portal meetings about its leads or
//   businesses. Her Google events stay out, they are not the office's.
// The API has no list of an office's portal meetings for Global, so the office view is built from its leads.
import { ALL_OFFICES, type OfficeScope } from "@/lib/office-scope";
import type { LeadMeeting, LeadMeetingItem } from "@/lib/api/entry-types";
import type { PortalMeeting } from "@/lib/api/types";
import { bookingKind } from "@/lib/leads/entry-flow";

export type GlobalCalendarView = { kind: "own" } | { kind: "office"; officeId: string };

/** "Viendo" on the whole network or on Corporate is her own calendar; any other office is that office's. */
export function globalCalendarView(scope: OfficeScope, corporateId: string | undefined): GlobalCalendarView {
  if (scope === ALL_OFFICES || !scope || scope === corporateId) return { kind: "own" };
  return { kind: "office", officeId: scope };
}

/** The lead fields the calendar reads. */
export interface CalendarLead {
  id: string;
  office_id: string;
  business_id: string | null;
  consultant_user_id: string;
  stage: string;
  business: { name: string };
  contact: { name: string; city: string; state: string; email: string };
  meeting: LeadMeeting | null;
  expansion_meeting?: LeadMeeting | null | undefined;
  expansion_meeting_held_at?: string | null | undefined;
}

/** The leads in view: hers (she is the consultant) or every lead of the office. Discarded ones never. */
export function leadsInView<L extends CalendarLead>(leads: readonly L[], view: GlobalCalendarView, meId: string | undefined): L[] {
  return leads.filter((l) =>
    l.stage !== "discarded" && (view.kind === "own" ? !!meId && l.consultant_user_id === meId : l.office_id === view.officeId),
  );
}

/** The meeting a lead has on the calendar: the initial one while in Reunión, the expansion one until it is held. */
function calendarMeetingOf(l: CalendarLead): LeadMeeting | null {
  if (l.stage === "meeting") return l.meeting;
  if (l.stage === "accepted" && !l.expansion_meeting_held_at) return l.expansion_meeting ?? null;
  return null;
}

/** Entry meetings of the leads in view, shaped like GET /meetings answers the office (soonest first). */
export function entryMeetingsOf(leads: readonly CalendarLead[]): LeadMeetingItem[] {
  return leads
    .flatMap((l) => {
      const meeting = calendarMeetingOf(l);
      return meeting
        ? [{ lead_id: l.id, business_name: l.business.name, owner_name: l.contact.name, city: l.contact.city, state: l.contact.state, meeting }]
        : [];
    })
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
}

/**
 * Which of her portal meetings the view shows: every one in her own calendar; in an office, only those about one of
 * its leads or businesses.
 */
export function portalMeetingFilter(
  view: GlobalCalendarView,
  officeLeads: readonly CalendarLead[],
  officeBusinessIds: readonly string[],
): (m: Pick<PortalMeeting, "lead_id" | "business_id">) => boolean {
  if (view.kind === "own") return () => true;
  const leadIds = new Set(officeLeads.map((l) => l.id));
  const businessIds = new Set([...officeBusinessIds, ...officeLeads.flatMap((l) => (l.business_id ? [l.business_id] : []))]);
  return (m) => (!!m.lead_id && leadIds.has(m.lead_id)) || (!!m.business_id && businessIds.has(m.business_id));
}

/** Leads she can register a meeting for by hand ("Registrar reunión"), as on the lead: evaluated or to rebook. */
export function registrableLeads<L extends CalendarLead>(leads: readonly L[]): L[] {
  return leads.filter((l) => {
    const kind = bookingKind(l);
    return kind === "initial" || kind === "rebook";
  });
}
