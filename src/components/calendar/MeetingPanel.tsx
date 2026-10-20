import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Video } from "lucide-react";
import {
  useAddComment, useBusinesses, useCancelPortalMeeting, useCurrentUser, useLeadDetail, usePortalMeeting, useTasks, useUsers,
} from "@/lib/api/hooks";
import type { PortalMeeting } from "@/lib/api/types";
import { canManageMeeting, durationOf, responseLabelKey } from "@/lib/calendar/scheduling";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { ScheduleMeetingDialog } from "./ScheduleMeetingDialog";
import { GoogleMark, MeetingStatusChip } from "./parts";

const textareaCls =
  "w-full resize-none rounded-[4px] border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

/** Side panel of a portal meeting in the calendar: Meet link, who goes, and Mover / Cancelar or "Avisar que no puedo". */
export function MeetingPanel({ meetingId, onClose }: { meetingId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const q = usePortalMeeting(meetingId);
  return (
    <Sheet open={!!meetingId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-surface sm:max-w-md">
        <SheetTitle className="pr-6 text-base">{q.data?.topic ?? t("calendar.schedule")}</SheetTitle>
        <SheetDescription className="sr-only">{t("calendar.panel.when")}</SheetDescription>
        {q.isLoading ? (
          <div className="mt-4 space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-24" /></div>
        ) : !q.data ? (
          <p className="mt-4 rounded-[4px] border border-border px-3 py-3 text-sm text-muted-foreground">{t("calendar.panel.not_found")}</p>
        ) : (
          <MeetingBody key={q.data.id} meeting={q.data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function MeetingBody({ meeting }: { meeting: PortalMeeting }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const me = useCurrentUser().data;
  const users = useUsers().data ?? [];
  const tasks = useTasks().data ?? [];
  const businesses = useBusinesses().data ?? [];
  const isSm = me?.role === "sm_team" || me?.role === "sm_global";
  const leadQ = useLeadDetail(meeting.kind === "lead" && isSm ? meeting.lead_id ?? undefined : undefined);
  const cancel = useCancelPortalMeeting();
  const comment = useAddComment();
  const [moving, setMoving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reason, setReason] = useState("");
  const when = formatDateTime(meeting.starts_at, lng);
  const [cantBody, setCantBody] = useState(() => t("calendar.panel.cant_default", { topic: meeting.topic, when }));
  const [cantOpen, setCantOpen] = useState(false);

  const task = tasks.find((x) => x.id === meeting.task_id);
  const businessName = businesses.find((b) => b.id === (meeting.business_id ?? task?.business_id))?.name ?? leadQ.data?.lead.business.name ?? "";
  const manage = canManageMeeting(meeting, me);
  const live = meeting.status !== "cancelled";
  const organizerEmail = users.find((u) => u.id === meeting.organizer.user_id)?.email;
  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    toast.error(t(i18n.exists(`calendar.errors.${code}`) ? `calendar.errors.${code}` : "calendar.errors.generic"));
  };

  const about =
    meeting.kind === "task" && task ? t("calendar.panel.about_task", { code: task.code, business: businessName })
      : meeting.kind === "lead" ? t("calendar.panel.about_lead", { business: businessName })
        : t("calendar.panel.about_business", { business: businessName });

  return (
    <div className="mt-3 space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <MeetingStatusChip status={meeting.status} />
        {meeting.google_synced && <GoogleMark />}
      </div>

      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("calendar.panel.when")}</dt>
          <dd className={cn("mt-0.5 tabular-nums", !live && "line-through")}>{when} · {t("calendar.minutes", { count: durationOf(meeting) })}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("calendar.panel.about")}</dt>
          <dd className="mt-0.5">
            {about}
            {task && (
              <Link to="/tareas" search={{ task: task.id }} className="ml-2 text-link hover:underline">{t("calendar.panel.open_task")}</Link>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("calendar.panel.organizer")}</dt>
          <dd className="mt-0.5">{meeting.organizer.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("calendar.panel.participants")}</dt>
          <dd className="mt-1">
            <ul className="divide-y divide-border rounded-[4px] border border-border">
              {meeting.participants.map((p) => (
                <li key={p.user_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className={cn("shrink-0 text-xs", p.response === "declined" ? "text-status-danger-fg" : p.response === "accepted" ? "text-status-success-fg" : "text-muted-foreground")}>
                    {t(`calendar.response.${responseLabelKey(p.response, meeting.status)}`)}
                  </span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      {live && (
        <div className="flex flex-wrap gap-2">
          {meeting.meet_url && (
            <a
              href={meeting.meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-display text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Video className="h-4 w-4" />
              {t("calendar.panel.join")}
            </a>
          )}
          {manage ? (
            <>
              <SecondaryButton onClick={() => setMoving(true)}>{t("calendar.panel.move")}</SecondaryButton>
              <SecondaryButton onClick={() => setConfirmCancel(true)}>{t("calendar.panel.cancel")}</SecondaryButton>
            </>
          ) : (
            <SecondaryButton onClick={() => setCantOpen(true)}>{t("calendar.panel.cant_make_it")}</SecondaryButton>
          )}
        </div>
      )}

      {/* Cancel, confirmed inside the panel; the reason is optional. */}
      {live && manage && confirmCancel && (
        <div role="alertdialog" aria-label={t("calendar.panel.cancel_title")} className="space-y-2 rounded-[4px] border border-status-danger-border bg-status-danger-bg px-3 py-3">
          <p className="font-semibold text-status-danger-fg">{t("calendar.panel.cancel_title")}</p>
          <p className="text-foreground">{t("calendar.panel.cancel_body")}</p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{t("calendar.panel.cancel_reason")}</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: meeting.id, reason: reason.trim() || null }, {
                onSuccess: () => { setConfirmCancel(false); toast.success(t("calendar.t_cancelled")); },
                onError: fail,
              })}
              className="inline-flex h-9 items-center rounded-md border border-status-danger-fg bg-surface px-4 text-sm font-semibold text-status-danger-fg hover:bg-muted disabled:opacity-50"
            >
              {t("calendar.panel.cancel_confirm")}
            </button>
            <SecondaryButton onClick={() => setConfirmCancel(false)}>{t("calendar.panel.cancel_back")}</SecondaryButton>
          </div>
        </div>
      )}

      {/* "Avisar que no puedo": a comment on the task when there is one, otherwise a mail to the organizer. */}
      {live && !manage && cantOpen && (
        task ? (
          <div className="space-y-2 rounded-[4px] border border-border px-3 py-3">
            <p className="text-muted-foreground">{t("calendar.panel.cant_body")}</p>
            <textarea rows={3} value={cantBody} onChange={(e) => setCantBody(e.target.value)} className={textareaCls} aria-label={t("calendar.panel.cant_make_it")} />
            <PrimaryButton
              disabled={!cantBody.trim() || comment.isPending}
              onClick={() => comment.mutate({ id: task.id, body: cantBody.trim(), file_id: null }, {
                onSuccess: () => { setCantOpen(false); toast.success(t("calendar.panel.cant_sent")); },
                onError: fail,
              })}
            >
              {t("calendar.panel.cant_send")}
            </PrimaryButton>
          </div>
        ) : organizerEmail ? (
          <a
            href={`mailto:${organizerEmail}?subject=${encodeURIComponent(t("calendar.panel.cant_mail_subject", { topic: meeting.topic }))}&body=${encodeURIComponent(cantBody)}`}
            className="inline-flex text-link hover:underline"
          >
            {t("calendar.panel.cant_mail", { name: meeting.organizer.name })}
          </a>
        ) : (
          <p className="rounded-[4px] border border-border px-3 py-2 text-muted-foreground">{t("calendar.panel.cant_no_mail", { name: meeting.organizer.name })}</p>
        )
      )}

      <ScheduleMeetingDialog open={moving} onOpenChange={setMoving} reschedule={meeting} />
    </div>
  );
}
