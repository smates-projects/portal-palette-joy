import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCurrentUser, useRegisterMeeting, useUsers } from "@/lib/api/hooks";
import type { LeadWithComputed, RegisterMeetingInput } from "@/lib/api/types";
import { registrableLeads } from "@/lib/calendar/global";
import { bookingKind } from "@/lib/leads/entry-flow";
import { leadOwnerOf } from "@/lib/leads/scheduling";
import { formatDateTime } from "@/lib/format";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";
import { RegisterMeetingDialog } from "@/components/pipeline/RegisterMeetingDialog";
import { LeadPickDialog } from "./LeadPickDialog";

type Action = "schedule" | "register";

/** Same look as the buttons of the filter row of Mis tareas, where these two sit for SM Global. */
const buttonCls = "flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-2 text-sm hover:bg-muted";

/**
 * "Agendar reunión" (calendar v2, free slots, the Google event with Meet) and "Registrar reunión" (by hand) from SM
 * Global's Calendario, for a lead in view. Both pick the business first, then open the same dialog as on the lead.
 */
export function GlobalCalendarActions({ leads }: { leads: LeadWithComputed[] }) {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser().data;
  const usersQ = useUsers();
  const register = useRegisterMeeting();
  const [picking, setPicking] = useState<Action | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [registerId, setRegisterId] = useState<string | null>(null);

  // "Agendar reunión" invites the owner, so it needs his account; "Registrar reunión" does not.
  const schedulable = leads.filter((l) => !!leadOwnerOf(l, usersQ.data));
  const registrable = registrableLeads(leads);
  const scheduleLead = leads.find((l) => l.id === scheduleId);
  const registerLead = leads.find((l) => l.id === registerId);
  const guests = scheduleLead
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

  return (
    <>
      <button onClick={() => setPicking("schedule")} className={buttonCls}>{t("calendar.schedule")}</button>
      <button onClick={() => setPicking("register")} className={buttonCls}>{t("entry.register.action")}</button>
      {picking && (
        <LeadPickDialog
          title={t(picking === "schedule" ? "calendar.title" : "entry.register.action")}
          hint={t(picking === "schedule" ? "calendar.global.pick_hint_schedule" : "calendar.global.pick_hint_register")}
          choices={(picking === "schedule" ? schedulable : registrable).map((l) => ({ id: l.id, label: `${l.business.name} · ${l.contact.name}` }))}
          onClose={() => setPicking(null)}
          onPick={pick}
        />
      )}
      {scheduleLead && (
        <ScheduleMeetingDialog
          open
          onOpenChange={(open) => !open && setScheduleId(null)}
          context={{ kind: "lead", lead_id: scheduleLead.id }}
          participants={guests}
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
    </>
  );
}
