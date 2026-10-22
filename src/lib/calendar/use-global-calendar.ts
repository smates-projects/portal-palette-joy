// Data source of SM Global's Calendario: the same page and calendar the SM team uses (MyTasksPage + TaskCalendar),
// fed with Global's meetings and scoped by "Viendo". Only data lives here, no screen.
import { useBusinesses, useCalendarConnection, useCurrentUser, useLeadMeetings, useLeads, useOrganizations } from "@/lib/api/hooks";
import { useOfficeScope } from "@/lib/office-scope";
import { isCalendarConnected } from "./scheduling";
import { entryMeetingsOf, globalCalendarView, leadsInView, portalMeetingFilter, type GlobalCalendarView } from "./global";
import type { LeadMeetingItem } from "@/lib/api/entry-types";
import type { LeadWithComputed, PortalMeeting } from "@/lib/api/types";

export interface GlobalCalendarSource {
  view: GlobalCalendarView;
  /** Name of the office in view ("" for her own calendar). */
  officeName: string;
  /** The leads in view: hers, or every lead of the office. The actions pick among them. */
  leads: LeadWithComputed[];
  leadMeetings: LeadMeetingItem[];
  portalFilter: (m: PortalMeeting) => boolean;
  showGoogle: boolean;
  loading: boolean;
  connected: boolean;
}

/** `enabled` false (anyone but SM Global, or another view) reads nothing. */
export function useGlobalCalendar(enabled: boolean): GlobalCalendarSource {
  const me = useCurrentUser().data;
  const [scope] = useOfficeScope();
  const orgs = useOrganizations().data ?? [];
  const view = globalCalendarView(scope, orgs.find((o) => o.kind === "sm_global")?.id);
  const officeId = view.kind === "office" ? view.officeId : undefined;
  const leadsQ = useLeads(officeId, enabled);
  // GET /meetings first (her own, or the office's with office_id); while it answers nothing for Global, the same
  // meetings come from the leads in view.
  const meetingsQ = useLeadMeetings(enabled, officeId);
  const bizQ = useBusinesses();
  const connectionQ = useCalendarConnection();

  const leads = leadsInView(leadsQ.data ?? [], view, me?.id);
  const officeBusinessIds = officeId ? (bizQ.data ?? []).filter((b) => b.office_id === officeId).map((b) => b.id) : [];
  return {
    view,
    officeName: officeId ? orgs.find((o) => o.id === officeId)?.name ?? "" : "",
    leads,
    leadMeetings: meetingsQ.data && meetingsQ.data.length > 0 ? meetingsQ.data : entryMeetingsOf(leads),
    portalFilter: portalMeetingFilter(view, officeId ? leads : [], officeBusinessIds),
    showGoogle: view.kind === "own",
    loading: leadsQ.isLoading || meetingsQ.isLoading,
    connected: connectionQ.data ? connectionQ.data.connected : isCalendarConnected(me),
  };
}
