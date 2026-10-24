import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Video } from "lucide-react";
import { nowIso } from "@/lib/clock";
import type { LeadMeeting, LeadWithComputed, MeetingOutcome } from "@/lib/api/types";
import type { SummaryEmailCopy } from "@/lib/api/repositories";
import { emailItems, entryTimeline, meetingHeld, rebookedAfterSummary } from "@/lib/leads/entry";
import { outcomePending } from "@/lib/leads/entry-flow";
import { entryMeetings } from "@/lib/leads/meetings";
import { formatDate, formatDateTime, oneFinalPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

const sectionTitle = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** The four entry phases with the date of each one; the current one highlighted. Same words everywhere. */
export function EntryTimeline({ lead }: { lead: LeadWithComputed }) {
  const { t, i18n } = useTranslation();
  const steps = entryTimeline(lead);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("entry.phases_title")}>
      {steps.map((s, i) => (
        <li
          key={s.phase}
          aria-current={s.state === "current" ? "step" : undefined}
          className={cn(
            "rounded-[4px] border px-2.5 py-2",
            s.state === "current" ? "border-primary bg-accent/60" : s.state === "done" ? "border-border bg-surface" : "border-dashed border-border bg-surface text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("grid h-4 w-4 place-items-center rounded-full border font-display text-[10px] tabular-nums", s.state === "pending" ? "border-border" : "border-primary bg-primary text-primary-foreground")}>
              {s.state === "done" ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </span>
            {i < 3 && s.state !== "pending" && <span>{t("entry.auto")}</span>}
          </span>
          <span className={cn("mt-1 block text-xs", s.state === "current" ? "font-semibold text-foreground" : "font-medium")}>
            {/* "Reunión hecha" only with an outcome; past and unanswered reads as missing. */}
            {s.phase === "meeting_held" && s.state === "current" && lead.meeting && !lead.meeting.outcome ? t("entry.phases.outcome_missing") : t(`entry.phases.${s.phase}`)}
          </span>
          {s.phase === "summary_sent" && <span className="block text-[11px] leading-snug text-muted-foreground">{t("entry.phase_hints.summary_sent")}</span>}
          <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">{s.at ? formatDate(s.at, i18n.language) : t("entry.phase_pending")}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The summary email the person got when booking. Over the API it is the stored copy (`copy`) exactly as it went out,
 * or "no copy" when the API kept none; the demo (copy undefined) composes the same preview from the lead.
 */
export function SummaryEmail({ lead, copy }: { lead: LeadWithComputed; copy?: SummaryEmailCopy | null | undefined }) {
  const { t, i18n } = useTranslation();
  const first = lead.contact.name.split(" ")[0] ?? lead.contact.name;
  const result = lead.result;
  const m = lead.meeting;
  // Booked again after a reschedule: the summary was about the first meeting; the owner only got the new date.
  const rebooked = rebookedAfterSummary(lead);
  if (copy !== undefined) return <StoredSummaryEmail copy={copy} />;
  // Added by hand without an assessment: there is no summary email to show.
  if (!result) return null;
  return (
    <section>
      <h3 className={sectionTitle}>{t("entry.email.title")}</h3>
      {!lead.summary_sent_at || !m ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("entry.email.not_sent")}</p>
      ) : (
        <div className="mt-2 rounded-md border border-border">
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
            <dt className="text-muted-foreground">{t("entry.email.to")}</dt>
            <dd className="truncate">{lead.contact.email}</dd>
            <dt className="text-muted-foreground">{t("entry.email.subject_label")}</dt>
            <dd className="font-medium">{rebooked ? t("entry.email.subject_first", { name: first }) : t("entry.email.subject", { name: first, date: formatDate(m.starts_at, i18n.language) })}</dd>
            <dt className="text-muted-foreground">{t("entry.email.sent_label")}</dt>
            <dd className="tabular-nums">{formatDateTime(lead.summary_sent_at, i18n.language)}</dd>
          </dl>
          <div className="space-y-3 px-4 py-3 text-sm">
            <p>{t("entry.email.greeting", { name: first })}</p>
            <p className="font-semibold leading-snug">{t(`pipeline.detail.headline.${result.band}`)}</p>
            <p>{t("entry.email.score", { score: result.score })}</p>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("entry.email.strengths")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{emailItems(result.strengths).map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("entry.email.priorities")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{emailItems(result.priorities).map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            {rebooked ? (
              <p className="rounded-[4px] border border-border px-3 py-2 text-xs text-muted-foreground">{t("entry.email.first_meeting_note")}</p>
            ) : (
            <div className="rounded-[4px] border border-border px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">{t("entry.email.meeting_title")}</p>
              <p className="mt-0.5 font-medium tabular-nums">{t("entry.email.meeting_when", { date: formatDateTime(m.starts_at, i18n.language), minutes: m.duration_minutes })}</p>
              <p className="mt-0.5 text-xs">
                <span className="text-muted-foreground">{t("entry.email.meeting_link")} </span>
                <span className="break-all">{m.meet_url}</span>
              </p>
            </div>
            )}
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{t("entry.email.read_only")}</p>
        </div>
      )}
      {/* The new booking's own message: only the meeting, with its date, time and Meet link. */}
      {rebooked && m && (
        <div className="mt-2 rounded-md border border-border px-4 py-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t("entry.email.update_title")}</p>
          <p className="mt-0.5">{t("entry.email.update_body", { name: first })}</p>
          <p className="mt-1 font-medium tabular-nums">{t("entry.email.meeting_when", { date: formatDateTime(m.starts_at, i18n.language), minutes: m.duration_minutes })}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{t("entry.email.update_sent", { date: formatDateTime(m.booked_at, i18n.language) })}</p>
        </div>
      )}
    </section>
  );
}

/** The copy the API stored: recipient, subject, date and the body as sent (HTML in a sandbox, no scripts). */
function StoredSummaryEmail({ copy }: { copy: SummaryEmailCopy | null }) {
  const { t, i18n } = useTranslation();
  return (
    <section>
      <h3 className={sectionTitle}>{t("entry.email.title")}</h3>
      {!copy ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("entry.email.no_copy")}</p>
      ) : (
        <div className="mt-2 rounded-md border border-border">
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
            <dt className="text-muted-foreground">{t("entry.email.to")}</dt>
            <dd className="truncate">{copy.to}</dd>
            <dt className="text-muted-foreground">{t("entry.email.subject_label")}</dt>
            <dd className="font-medium">{copy.subject}</dd>
            <dt className="text-muted-foreground">{t("entry.email.sent_label")}</dt>
            <dd className="tabular-nums">{formatDateTime(copy.sent_at, i18n.language)}</dd>
          </dl>
          {copy.html ? (
            <iframe title={copy.subject} sandbox="" srcDoc={copy.html} className="h-96 w-full bg-white" />
          ) : (
            <p className="whitespace-pre-line px-4 py-3 text-sm">{copy.text}</p>
          )}
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{t("entry.email.read_only_copy")}</p>
        </div>
      )}
    </section>
  );
}

/**
 * The meetings of the lead: the initial one from Reunión on, and the expansion one once booked (or while Aceptado).
 * Only the meeting the lead is waiting on takes an answer; the others read as a record ("Se hizo el ...").
 * `focused` (from the bell) scrolls to the actionable one and outlines it.
 */
export function MeetingCard(props: {
  lead: LeadWithComputed;
  consultantName: string;
  readOnly?: boolean;
  /** Who may answer "¿Se hizo?" (canAnswerOutcome); without it, anyone not in read only. */
  canAnswer?: ((meeting: LeadMeeting) => boolean) | undefined;
  focused?: boolean;
  pending?: boolean;
  onOutcome?: (meeting: LeadMeeting, outcome: MeetingOutcome) => void;
}) {
  const { lead } = props;
  const ref = useRef<HTMLDivElement>(null);
  const { initial, expansion } = entryMeetings(lead);
  useEffect(() => {
    if (props.focused) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.focused]);
  if (lead.stage === "evaluated" || lead.stage === "discarded") return null;
  const expansionOpen = lead.stage === "accepted" && !lead.expansion_meeting_held_at;
  const showInitial = lead.stage === "meeting" || !!initial;
  const showExpansion = !!expansion || expansionOpen;
  if (!showInitial && !showExpansion) return null;
  return (
    <div ref={ref} id="lead-meeting" className="space-y-6">
      {showInitial && (
        <OneMeeting {...props} meeting={initial} kind="initial" actionable={lead.stage === "meeting"} focused={!!props.focused && lead.stage === "meeting"} />
      )}
      {showExpansion && (
        <OneMeeting {...props} meeting={expansion} kind="expansion" actionable={expansionOpen} focused={!!props.focused && expansionOpen} />
      )}
    </div>
  );
}

function OneMeeting(props: {
  meeting: LeadMeeting | null;
  kind: "initial" | "expansion";
  actionable: boolean;
  consultantName: string;
  readOnly?: boolean;
  canAnswer?: ((meeting: LeadMeeting) => boolean) | undefined;
  focused: boolean;
  pending?: boolean;
  onOutcome?: (meeting: LeadMeeting, outcome: MeetingOutcome) => void;
}) {
  const { t, i18n } = useTranslation();
  const m = props.meeting;
  const expansion = props.kind === "expansion";
  const started = !!m && Date.parse(m.starts_at) <= Date.parse(nowIso());
  const asked = outcomePending(m) && !!m?.outcome_prompted_at;
  // Who held it answers even from SM Global's read-only funnel (the API decides by person, not by screen).
  const canAnswer = props.actionable && !!m && (props.canAnswer ? props.canAnswer(m) : !props.readOnly);
  return (
    <section>
      <h3 className={sectionTitle}>{t(expansion ? "entry.meeting.expansion_title" : "entry.meeting.title")}</h3>
      {!m ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t(expansion ? "entry.meeting.expansion_none" : "entry.meeting.manual")}</p>
      ) : (
        <div className={cn("mt-2 rounded-md border px-4 py-3 text-sm", props.focused ? "border-primary ring-2 ring-primary/20" : "border-border")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium tabular-nums">{t("entry.meeting.when", { date: formatDateTime(m.starts_at, i18n.language), minutes: m.duration_minutes })}</p>
              <p className="text-xs text-muted-foreground">{t("entry.meeting.with", { name: props.consultantName })}</p>
              {m.outcome && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {oneFinalPeriod(t(`entry.outcome.done_${m.outcome}`, { date: formatDateTime(m.notes_at ?? m.starts_at, i18n.language) }))}
                </p>
              )}
            </div>
            {!meetingHeld(m) && !m.outcome && m.meet_url && (
              <a href={m.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
                <Video className="h-4 w-4" />{t("entry.meeting.join")}<ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {!m.outcome && started && props.actionable && (
            <div className="mt-3 border-t border-border pt-3">
              <p className={cn("text-sm", asked ? "font-medium text-status-warning-fg" : "font-medium")}>{t(asked ? "entry.outcome.pending" : "entry.outcome.question")}</p>
              {canAnswer && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <PrimaryButton disabled={!!props.pending} onClick={() => props.onOutcome?.(m, "held")}>{t("entry.outcome.held")}</PrimaryButton>
                  {(["no_show", "reschedule"] as const).map((o) => (
                    <button key={o} disabled={!!props.pending} onClick={() => props.onOutcome?.(m, o)}
                      className="inline-flex h-9 items-center rounded-[4px] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                      {t(`entry.outcome.${o}`)}
                    </button>
                  ))}
                </div>
              )}
              {canAnswer && <p className="mt-2 text-xs text-muted-foreground">{t(expansion ? "entry.outcome.hint_expansion" : "entry.outcome.hint")}</p>}
            </div>
          )}
          {props.actionable && (m.outcome === "no_show" || m.outcome === "reschedule") && (
            <p className="mt-2 text-xs text-muted-foreground">{t("entry.outcome.rebook_hint")}</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * "Se hizo": an optional note of the meeting. On the first meeting it sends the documents list (the MOU is already
 * signed by then, together at the end of the meeting); on the expansion, it opens the Operating Agreement.
 */
export function MeetingNoteDialog(props: { name: string; expansion?: boolean; pending: boolean; onClose: () => void; onConfirm: (body: string) => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry.note.title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t(props.expansion ? "entry.note.body_expansion" : "entry.note.body")}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry.note.label")}</span>
          <textarea
            autoFocus
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("entry.note.placeholder")}
            className="w-full resize-none rounded-[4px] border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => props.onConfirm(body.trim())} disabled={props.pending}>{t("entry.note.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
