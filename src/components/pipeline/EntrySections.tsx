import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Video } from "lucide-react";
import type { LeadWithComputed } from "@/lib/api/types";
import { emailItems, entryTimeline, meetingHeld } from "@/lib/leads/entry";
import { formatDate, formatDateTime } from "@/lib/format";
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
          <span className={cn("mt-1 block text-xs", s.state === "current" ? "font-semibold text-foreground" : "font-medium")}>{t(`entry.phases.${s.phase}`)}</span>
          <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">{s.at ? formatDate(s.at, i18n.language) : t("entry.phase_pending")}</span>
        </li>
      ))}
    </ol>
  );
}

/** Read-only preview of the summary email the person got (subject, headline, score, strengths, priorities, booking). */
export function SummaryEmail({ lead }: { lead: LeadWithComputed }) {
  const { t, i18n } = useTranslation();
  const first = lead.contact.name.split(" ")[0] ?? lead.contact.name;
  const result = lead.result;
  // Added by hand without an assessment: there is no summary email to show.
  if (!result) return null;
  return (
    <section>
      <h3 className={sectionTitle}>{t("entry.email.title")}</h3>
      {!lead.summary_sent_at ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("entry.email.not_sent")}</p>
      ) : (
        <div className="mt-2 rounded-md border border-border">
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5 text-xs">
            <dt className="text-muted-foreground">{t("entry.email.to")}</dt>
            <dd className="truncate">{lead.contact.email}</dd>
            <dt className="text-muted-foreground">{t("entry.email.subject_label")}</dt>
            <dd className="font-medium">{t("entry.email.subject", { name: first })}</dd>
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
            {/* Shown as in the email; inert here (read only). */}
            <span aria-disabled className="inline-flex h-8 items-center rounded-[4px] bg-primary px-3 font-display text-xs font-semibold text-primary-foreground">{t("entry.email.cta")}</span>
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{t("entry.email.read_only")}</p>
        </div>
      )}
    </section>
  );
}

/** The booked meeting: date, time, consultant and the Meet link. */
export function MeetingCard({ lead, consultantName }: { lead: LeadWithComputed; consultantName: string }) {
  const { t, i18n } = useTranslation();
  const m = lead.meeting;
  if (lead.stage !== "meeting") return null;
  return (
    <section>
      <h3 className={sectionTitle}>{t("entry.meeting.title")}</h3>
      {!m ? (
        <p className="mt-2 rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("entry.meeting.manual")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-sm">
          <div>
            <p className="font-medium tabular-nums">{t("entry.meeting.when", { date: formatDateTime(m.starts_at, i18n.language), minutes: m.duration_minutes })}</p>
            <p className="text-xs text-muted-foreground">{t("entry.meeting.with", { name: consultantName })}</p>
            {meetingHeld(m) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {m.notes_at ? t("entry.meeting.note_done", { date: formatDateTime(m.notes_at, i18n.language) }) : t("entry.meeting.held")}
              </p>
            )}
          </div>
          {!meetingHeld(m) && (
            <a href={m.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
              <Video className="h-4 w-4" />{t("entry.meeting.join")}<ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/** After the meeting: the consultant's note. Then Enviar NDA y MOU (accept) or Descartar. */
export function MeetingNoteDialog(props: { name: string; pending: boolean; onClose: () => void; onConfirm: (body: string) => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry.note.title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t("entry.note.body")}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry.note.label")}</span>
          <textarea
            autoFocus
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("entry.note.placeholder")}
            className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          {tried && !body.trim() && <span className="text-xs text-status-danger-fg">{t("entry.note.required")}</span>}
        </label>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => { setTried(true); if (body.trim()) props.onConfirm(body.trim()); }} disabled={props.pending}>{t("entry.note.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
