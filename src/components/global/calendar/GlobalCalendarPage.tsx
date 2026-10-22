import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useBusinesses, useCurrentUser, useLeads, useOrganizations } from "@/lib/api/hooks";
import { useOfficeScope } from "@/lib/office-scope";
import { entryMeetingsOf, globalCalendarView, leadsInView, portalMeetingFilter } from "@/lib/calendar/global";
import { TaskCalendar, type MeetingsOnlyScope } from "@/components/tasks/TaskCalendar";

export interface GlobalCalendarSearch {
  meeting?: string | undefined;
}

/**
 * Calendario of SM Global: her own meetings with the owners and her Google events (read only) or, with "Viendo" on
 * one office, that office's entry meetings. Month and week, as the team's calendar.
 */
export function GlobalCalendarPage({ search }: { search: GlobalCalendarSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/calendario" });
  const me = useCurrentUser().data;
  const [scope] = useOfficeScope();
  const orgs = useOrganizations().data ?? [];
  const corporateId = orgs.find((o) => o.kind === "sm_global")?.id;
  const view = globalCalendarView(scope, corporateId);
  const officeName = view.kind === "office" ? orgs.find((o) => o.id === view.officeId)?.name ?? "" : "";
  const leadsQ = useLeads(view.kind === "office" ? view.officeId : undefined);
  const bizQ = useBusinesses();

  const inView = leadsInView(leadsQ.data ?? [], view, me?.id);
  const officeBusinessIds = view.kind === "office" ? (bizQ.data ?? []).filter((b) => b.office_id === view.officeId).map((b) => b.id) : [];
  const businessName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";

  const empty = (mode: "month" | "week") => (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-border bg-surface px-4 py-3 text-sm">
      <p className="font-medium">
        {view.kind === "office" ? t(`calendar.global.empty_office_${mode}`, { office: officeName }) : t(`calendar.global.empty_${mode}`)}
      </p>
      <Link to="/embudo" className="text-link hover:underline">{t("calendar.global.empty_link")}</Link>
    </div>
  );
  const meetingsOnly: MeetingsOnlyScope = {
    leadMeetings: entryMeetingsOf(inView),
    portalFilter: portalMeetingFilter(view, view.kind === "office" ? inView : [], officeBusinessIds),
    showGoogle: view.kind === "own",
    loading: leadsQ.isLoading,
    initialMode: "week",
    renderEmpty: empty,
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("calendar.global.heading")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view.kind === "office" ? t("calendar.global.subtitle_office", { office: officeName }) : t("calendar.global.subtitle_own")}
          </p>
        </div>
      </div>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <TaskCalendar
          rows={[]}
          businessName={businessName}
          onOpen={() => undefined}
          focusMeetingId={search.meeting}
          onFocusMeeting={(id) => void navigate({ search: { meeting: id ?? undefined } })}
          meetingsOnly={meetingsOnly}
        />
      </div>
    </div>
  );
}
