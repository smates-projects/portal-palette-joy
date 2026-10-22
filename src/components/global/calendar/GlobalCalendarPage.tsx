import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useBusinesses, useCalendarConnection, useCurrentUser, useLeads, useOrganizations, useRegisterMeeting, useUsers,
} from "@/lib/api/hooks";
import type { RegisterMeetingInput } from "@/lib/api/types";
import { useOfficeScope } from "@/lib/office-scope";
import { entryMeetingsOf, globalCalendarView, leadsInView, portalMeetingFilter, registrableLeads } from "@/lib/calendar/global";
import { isCalendarConnected } from "@/lib/calendar/scheduling";
import { bookingKind } from "@/lib/leads/entry-flow";
import { leadOwnerOf } from "@/lib/leads/scheduling";
import { formatDateTime } from "@/lib/format";
import { TaskCalendar, type MeetingsOnlyScope } from "@/components/tasks/TaskCalendar";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";
import { RegisterMeetingDialog } from "@/components/pipeline/RegisterMeetingDialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { LeadPickDialog } from "./LeadPickDialog";

type Action = "schedule" | "register";

export interface GlobalCalendarSearch {
  meeting?: string | undefined;
}

/**
 * Calendario of SM Global: her own meetings with the owners and her Google events (read only) or, with "Viendo" on
 * one office, that office's entry meetings. Month and week, as the team's calendar.
 */
export function GlobalCalendarPage({ search }: { search: GlobalCalendarSearch }) {
  const { t, i18n } = useTranslation();
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
  const usersQ = useUsers();
  const connectionQ = useCalendarConnection();
  const connected = connectionQ.data ? connectionQ.data.connected : isCalendarConnected(me);
  const register = useRegisterMeeting();
  const [picking, setPicking] = useState<Action | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [registerId, setRegisterId] = useState<string | null>(null);

  // "Agendar reunión" needs the owner's account (the portal's dialog invites him); "Registrar reunión" does not.
  const schedulable = inView.filter((l) => !!leadOwnerOf(l, usersQ.data));
  const registrable = registrableLeads(inView);
  const label = (l: (typeof inView)[number]) => `${l.business.name} · ${l.contact.name}`;
  const scheduleLead = inView.find((l) => l.id === scheduleId);
  const registerLead = inView.find((l) => l.id === registerId);
  const scheduleGuests = scheduleLead
    ? [leadOwnerOf(scheduleLead, usersQ.data), usersQ.data?.find((u) => u.id === scheduleLead.consultant_user_id)]
        .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me?.id)
        .map((u) => ({ user_id: u.id, name: u.full_name }))
    : [];
  const pick = (id: string) => {
    if (picking === "schedule") setScheduleId(id);
    else setRegisterId(id);
    setPicking(null);
  };
  const onRegister = (input: RegisterMeetingInput) => {
    if (!registerLead) return;
    register.mutate({ id: registerLead.id, input }, {
      onSuccess: (after) => {
        setRegisterId(null);
        toast.success(t("entry.register.t_done", { name: registerLead.business.name, date: after.meeting ? formatDateTime(after.meeting.starts_at, i18n.language) : "" }));
      },
      onError: (e) =>
        toast.error(e instanceof Error && ["invalid_transition", "invalid_url", "invalid_date"].includes(e.message) ? t(`entry.register.errors.${e.message}`) : t("pipeline.t_error")),
    });
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => setPicking("register")}>{t("entry.register.action")}</SecondaryButton>
          <PrimaryButton onClick={() => setPicking("schedule")}>{t("calendar.schedule")}</PrimaryButton>
        </div>
      </div>
      {!connected && (
        <p role="note" className="mt-4 rounded-[4px] border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
          {t("calendar.global.not_connected")}{" "}
          <Link to="/perfil" hash="google-calendar" className="font-medium underline underline-offset-2">{t("calendar.global.not_connected_link")}</Link>
        </p>
      )}
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
      {picking && (
        <LeadPickDialog
          title={t(picking === "schedule" ? "calendar.title" : "entry.register.action")}
          hint={t(picking === "schedule" ? "calendar.global.pick_hint_schedule" : "calendar.global.pick_hint_register")}
          choices={(picking === "schedule" ? schedulable : registrable).map((l) => ({ id: l.id, label: label(l) }))}
          onClose={() => setPicking(null)}
          onPick={pick}
        />
      )}
      {scheduleLead && (
        <ScheduleMeetingDialog
          open
          onOpenChange={(open) => !open && setScheduleId(null)}
          context={{ kind: "lead", lead_id: scheduleLead.id }}
          participants={scheduleGuests}
          defaultTopic={scheduleLead.business.name}
        />
      )}
      {registerLead && (
        <RegisterMeetingDialog
          name={registerLead.business.name}
          rebook={bookingKind(registerLead) === "rebook"}
          pending={register.isPending}
          onClose={() => setRegisterId(null)}
          onConfirm={onRegister}
        />
      )}
    </div>
  );
}
