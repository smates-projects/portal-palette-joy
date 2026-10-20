import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CalendarCheck, X } from "lucide-react";
import { nowIso } from "@/lib/clock";
import {
  useAvailability, useCalendarConnection, useCurrentUser, useRescheduleMeeting, useScheduleMeeting, useUsers,
} from "@/lib/api/hooks";
import type { AvailabilityInput, PortalMeeting, PortalMeetingKind } from "@/lib/api/types";
import { isActiveUser } from "@/lib/accounts/permissions";
import {
  AVAILABILITY_DAYS, MAX_MEETING_PARTICIPANTS, MEETING_DURATIONS, addPerson, availabilityWindow, canSearchSlots, durationOf,
  isCalendarConnected, joinNames, scheduleOutcome, unavailableKind, type SchedulingPerson,
} from "@/lib/calendar/scheduling";
import { groupSlotsByDay } from "@/lib/calendar/slots";
import { formatDateTime, localeTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

/** What the meeting is about. The id of the kind is required by the API. */
export interface ScheduleContext {
  kind: PortalMeetingKind;
  task_id?: string | null | undefined;
  business_id?: string | null | undefined;
  lead_id?: string | null | undefined;
}

/** Home: the person picks the task first; each task brings its own people. */
export interface TaskChoice {
  id: string;
  label: string;
  participants: SchedulingPerson[];
}

export interface ScheduleMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: ScheduleContext | undefined;
  taskChoices?: TaskChoice[] | undefined;
  /** Pre-filled guests (the organizer is the current user and is never listed). */
  participants?: SchedulingPerson[] | undefined;
  defaultTopic?: string | undefined;
  /** "Mover": only the slot picker, for this meeting. */
  reschedule?: PortalMeeting | null | undefined;
  onDone?: ((meeting: PortalMeeting) => void) | undefined;
}

type Step = "details" | "slots" | "done";

const inputCls =
  "h-9 w-full rounded-[4px] border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
const NOTE_TONE = {
  info: "border-status-info-border bg-status-info-bg text-status-info-fg",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
} as const;

/** The one scheduling dialog: who, what and how long; then the common free slots; then what happened. */
export function ScheduleMeetingDialog(props: ScheduleMeetingDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(props.reschedule ? "calendar.title_reschedule" : "calendar.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("calendar.participants_hint")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts clean. */}
        {props.open && <ScheduleBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleBody(props: ScheduleMeetingDialogProps) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const me = useCurrentUser().data;
  const usersQ = useUsers();
  const connectionQ = useCalendarConnection();
  const schedule = useScheduleMeeting();
  const move = useRescheduleMeeting();
  const moving = props.reschedule ?? null;

  const [taskId, setTaskId] = useState(props.context?.task_id ?? "");
  const [people, setPeople] = useState<SchedulingPerson[]>(() =>
    moving
      ? moving.participants.filter((p) => p.user_id !== me?.id).map((p) => ({ user_id: p.user_id, name: p.name }))
      : (props.participants ?? []).reduce<SchedulingPerson[]>((list, p) => addPerson(list, p, me?.id), []),
  );
  const [topic, setTopic] = useState(moving?.topic ?? props.defaultTopic ?? "");
  const [duration, setDuration] = useState<number>(moving ? durationOf(moving) : 30);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>(moving ? "slots" : "details");
  const [range, setRange] = useState(() => availabilityWindow(Date.parse(nowIso())));
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortalMeeting | null>(null);

  const users = usersQ.data ?? [];
  const userOf = (id: string) => users.find((u) => u.id === id);
  const meConnected = connectionQ.data?.connected ?? isCalendarConnected(me);
  const nameOf = (id: string) => (id === me?.id ? me.full_name : people.find((p) => p.user_id === id)?.name ?? userOf(id)?.full_name ?? "");
  const choice = props.taskChoices?.find((c) => c.id === taskId);
  const context: ScheduleContext | null = props.taskChoices ? (taskId ? { kind: "task", task_id: taskId } : null) : (props.context ?? null);
  const pickable = users.filter((u) => isActiveUser(u) && u.id !== me?.id && !people.some((p) => p.user_id === u.id));
  const tooMany = people.length + 1 > MAX_MEETING_PARTICIPANTS;
  const ready = !!context && canSearchSlots({ participants: people, topic, duration });

  // Moving keeps the meeting's own people (SM may move a meeting it is not part of).
  const everyone = moving ? moving.participants.map((p) => p.user_id) : me ? [me.id, ...people.map((p) => p.user_id)] : [];
  const availabilityInput: AvailabilityInput | null = step === "slots" && everyone.length > 0
    ? { participant_user_ids: everyone, from: range.from, to: range.to, duration_minutes: duration }
    : null;
  const availabilityQ = useAvailability(availabilityInput);
  const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const days = useMemo(() => groupSlotsByDay(availabilityQ.data?.slots ?? [], zone), [availabilityQ.data, zone]);
  const unavailable = (availabilityQ.data?.unavailable_participants ?? []).filter((u) => u.user_id !== me?.id);
  const meUnreadable = !meConnected || (availabilityQ.data?.unavailable_participants ?? []).some((u) => u.user_id === me?.id);

  const pickTask = (id: string) => {
    setTaskId(id);
    const next = props.taskChoices?.find((c) => c.id === id);
    if (next) setPeople(next.participants.reduce<SchedulingPerson[]>((list, p) => addPerson(list, p, me?.id), []));
  };
  const openSlots = () => {
    setRange(availabilityWindow(Date.parse(nowIso())));
    setPicked(null);
    setError(null);
    setStep("slots");
  };
  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    if (code === "slot_unavailable") {
      setPicked(null);
      void availabilityQ.refetch();
    }
    setError(i18n.exists(`calendar.errors.${code}`) ? code : "generic");
  };
  const confirm = () => {
    if (!picked) return;
    setError(null);
    if (moving) {
      move.mutate({ id: moving.id, input: { starts_at: picked, duration_minutes: duration } }, {
        onSuccess: (m) => { setResult(m); setStep("done"); props.onDone?.(m); },
        onError: fail,
      });
      return;
    }
    if (!context) return;
    schedule.mutate({
      ...context, participant_user_ids: people.map((p) => p.user_id), starts_at: picked, duration_minutes: duration, topic: topic.trim(),
      note: note.trim() || null,
    }, {
      onSuccess: (m) => { setResult(m); setStep("done"); props.onDone?.(m); },
      onError: fail,
    });
  };
  const time = (iso: string) => new Intl.DateTimeFormat(localeTag(lng), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dayLabel = (day: string) => {
    const text = new Intl.DateTimeFormat(localeTag(lng), { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00`));
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  if (step === "done" && result) {
    const outcome = scheduleOutcome(result);
    const titleKey = moving ? "calendar.done_title_moved" : result.status === "confirmed" ? "calendar.done_title" : "calendar.done_title_proposal";
    return (
      <>
        <div role="status" className={cn("space-y-1 rounded-[4px] border px-3 py-3 text-sm", NOTE_TONE[result.google_synced ? "success" : "info"])}>
          <p className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-4 w-4" />{t(titleKey)}</p>
          <p>{result.topic} · {formatDateTime(result.starts_at, lng)}</p>
          {moving && <p>{t("calendar.moved_note", { when: formatDateTime(result.starts_at, lng) })}</p>}
          {!moving && outcome.invitation_sent && <p>{t("calendar.invitation_sent")}</p>}
          {!moving && outcome.pending_names.length > 0 && (
            <p>{t("calendar.pending", { count: outcome.pending_names.length, names: joinNames(outcome.pending_names, t("calendar.and")) })}</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:items-center">
          <Link to="/tareas" search={{ view: "calendar", meeting: result.id }} onClick={() => props.onOpenChange(false)} className="text-sm text-link hover:underline">
            {t("calendar.see_in_calendar")}
          </Link>
          <PrimaryButton onClick={() => props.onOpenChange(false)}>{t("calendar.done")}</PrimaryButton>
        </DialogFooter>
      </>
    );
  }

  if (step === "slots") {
    const pending = schedule.isPending || move.isPending;
    return (
      <>
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t("calendar.slots_title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("calendar.slots_hint", { count: AVAILABILITY_DAYS })}</p>
          </div>
          {meUnreadable && !moving && (
            <p className={cn("rounded-[4px] border px-3 py-2 text-sm", NOTE_TONE.warning)}>
              {t("calendar.me_not_connected")}{" "}
              <Link to="/perfil" className="font-medium underline underline-offset-2">{t("calendar.connect_link")}</Link>
            </p>
          )}
          {unavailable.length > 0 && (
            <ul className={cn("space-y-1 rounded-[4px] border px-3 py-2 text-sm", NOTE_TONE.info)}>
              {unavailable.map((u) => (
                <li key={u.user_id}>{t(`calendar.unavailable_${unavailableKind(u.reason)}`, { name: nameOf(u.user_id) })}</li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className={cn("rounded-[4px] border px-3 py-2 text-sm", NOTE_TONE.danger)}>{t(`calendar.errors.${error}`)}</p>}
          {availabilityQ.isLoading ? (
            <p className="rounded-[4px] border border-border px-3 py-4 text-sm text-muted-foreground">{t("calendar.slots_loading")}</p>
          ) : availabilityQ.isError ? (
            <div className="rounded-[4px] border border-border px-3 py-3 text-sm">
              <p>{t("calendar.slots_error")}</p>
              <button onClick={() => void availabilityQ.refetch()} className="mt-1 text-link hover:underline">{t("calendar.slots_retry")}</button>
            </div>
          ) : days.length === 0 ? (
            <p className="rounded-[4px] border border-border px-3 py-4 text-sm text-muted-foreground">{t("calendar.slots_empty", { count: AVAILABILITY_DAYS })}</p>
          ) : (
            <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
              {days.map((d) => (
                <section key={d.day} aria-label={dayLabel(d.day)}>
                  <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{dayLabel(d.day)}</h4>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {d.slots.map((s) => {
                      const selected = picked === s.starts_at;
                      return (
                        <button
                          key={s.starts_at}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setPicked(s.starts_at)}
                          className={cn(
                            "h-8 rounded-[4px] border text-sm tabular-nums transition-colors",
                            selected ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-surface hover:border-primary",
                          )}
                        >
                          {time(s.starts_at)}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
          {picked && <p className="text-sm">{t("calendar.selected", { when: formatDateTime(picked, lng) })}</p>}
        </div>
        <DialogFooter className="gap-2">
          {moving ? (
            <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("calendar.cancel")}</SecondaryButton>
          ) : (
            <SecondaryButton onClick={() => setStep("details")}>{t("calendar.back")}</SecondaryButton>
          )}
          <PrimaryButton onClick={confirm} disabled={!picked || pending}>
            {t(moving ? "calendar.confirm_move" : meUnreadable ? "calendar.confirm_proposal" : "calendar.confirm")}
          </PrimaryButton>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {props.taskChoices && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("calendar.about_task")}</span>
            <select value={taskId} onChange={(e) => pickTask(e.target.value)} className={inputCls}>
              <option value="">{t("calendar.about_task_placeholder")}</option>
              {props.taskChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        {(!props.taskChoices || choice) && (
          <>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t("calendar.participants")}</legend>
              <p className="text-xs text-muted-foreground">{t("calendar.participants_hint")}</p>
              {people.length === 0 ? (
                <p className="rounded-[4px] border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{t("calendar.participants_empty")}</p>
              ) : (
                <ul className="divide-y divide-border rounded-[4px] border border-border">
                  {people.map((p) => {
                    const u = userOf(p.user_id);
                    return (
                      <li key={p.user_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {u && !isCalendarConnected(u) && <span className="shrink-0 text-xs text-muted-foreground">{t("profile.cal_off_short")}</span>}
                        <button
                          type="button"
                          onClick={() => setPeople((list) => list.filter((x) => x.user_id !== p.user_id))}
                          aria-label={t("calendar.remove_person", { name: p.name })}
                          className="rounded-[4px] p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pickable.length > 0 && (
                <select
                  value=""
                  aria-label={t("calendar.add_person")}
                  onChange={(e) => {
                    const u = userOf(e.target.value);
                    if (u) setPeople((list) => addPerson(list, { user_id: u.id, name: u.full_name }, me?.id));
                  }}
                  className={inputCls}
                >
                  <option value="">{t("calendar.add_person_placeholder")}</option>
                  {pickable.map((u) => <option key={u.id} value={u.id}>{u.full_name}{u.title ? ` · ${u.title}` : ""}</option>)}
                </select>
              )}
              {tooMany && <p className="text-xs text-status-danger-fg">{t("calendar.too_many", { count: MAX_MEETING_PARTICIPANTS })}</p>}
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("calendar.topic")}</span>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("calendar.topic_placeholder")} className={inputCls} />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">{t("calendar.duration")}</legend>
              <div role="radiogroup" aria-label={t("calendar.duration")} className="mt-1.5 flex gap-1.5">
                {MEETING_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={duration === m}
                    onClick={() => setDuration(m)}
                    className={cn(
                      "h-8 rounded-[4px] border px-3 text-sm tabular-nums transition-colors",
                      duration === m ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-surface hover:border-primary",
                    )}
                  >
                    {t("calendar.minutes", { count: m })}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("calendar.note")}</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("calendar.note_placeholder")} className={cn(inputCls, "h-auto resize-none py-2")} />
            </label>
          </>
        )}
      </div>
      <DialogFooter className="gap-2">
        <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("calendar.cancel")}</SecondaryButton>
        <PrimaryButton onClick={openSlots} disabled={!ready}>{t("calendar.see_slots")}</PrimaryButton>
      </DialogFooter>
    </>
  );
}
