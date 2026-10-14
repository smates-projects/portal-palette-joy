import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Paperclip, X } from "lucide-react";
import { TODAY } from "@/config/app";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
const textareaCls =
  "w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

export function PrimaryButton(props: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function SecondaryButton(props: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      {props.children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function SubmitDeliverableDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nextVersion: number;
  isResubmit: boolean;
  defaultFileName: string;
  ownerName: string;
  changesQuote: string | null;
  pending: boolean;
  onSubmit: (v: { note: string; file_names: string[] }) => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const attach = () => {
    const base = props.defaultFileName.replace(/\.pdf$/, "");
    setFiles((f) => [...f, f.length === 0 ? props.defaultFileName : `${base}_anexo_${f.length}.pdf`]);
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        props.onOpenChange(o);
        if (!o) {
          setFiles([]);
          setNote("");
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.isResubmit ? t("taskDetail.d_resubmit_title", { version: props.nextVersion }) : t("taskDetail.d_submit_title")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("taskDetail.d_files_hint")}</DialogDescription>
        </DialogHeader>
        {props.changesQuote && (
          <blockquote className="rounded-md border-l-2 border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm">
            <p className="text-xs font-medium text-status-warning-fg">{t("taskDetail.d_changes_quote", { name: props.ownerName })}</p>
            <p className="mt-1 text-foreground">{props.changesQuote}</p>
          </blockquote>
        )}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">{t("taskDetail.d_files")}</span>
            {files.map((f, i) => (
              <div key={f} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{f}</span>
                <button
                  type="button"
                  aria-label={t("taskDetail.d_remove_file")}
                  onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <SecondaryButton onClick={attach}>
              <Paperclip className="h-3.5 w-3.5" />
              {t("taskDetail.d_attach")}
            </SecondaryButton>
            {files.length === 0 && <p className="text-xs text-muted-foreground">{t("taskDetail.d_files_hint")}</p>}
          </div>
          <Field label={t("taskDetail.d_note", { name: props.ownerName })}>
            <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("taskDetail.d_note_placeholder")} className={textareaCls} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={files.length === 0 || props.pending} onClick={() => props.onSubmit({ note: note.trim(), file_names: files })}>
            {t("taskDetail.d_send")}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OwnerRequestDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (v: { question: string; due_date: string }) => void;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [due, setDue] = useState(TODAY);
  return (
    <Dialog open={props.open} onOpenChange={(o) => { props.onOpenChange(o); if (!o) setQuestion(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("taskDetail.d_request_title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("taskDetail.d_request_question")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("taskDetail.d_request_question")}>
            <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("taskDetail.d_request_placeholder")} className={textareaCls} />
          </Field>
          <Field label={t("taskDetail.d_request_due")}>
            <input type="date" min={TODAY} value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={!question.trim() || !due || props.pending} onClick={() => props.onSubmit({ question: question.trim(), due_date: due })}>
            {t("taskDetail.d_request_send")}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MeetingDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (v: { topic: string; starts_at: string; duration_minutes: number }) => void;
}) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(TODAY);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  return (
    <Dialog open={props.open} onOpenChange={(o) => { props.onOpenChange(o); if (!o) setTopic(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("taskDetail.d_meeting_title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("taskDetail.d_meeting_topic")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("taskDetail.d_meeting_topic")}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("taskDetail.d_meeting_topic_placeholder")} className={inputCls} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("taskDetail.d_meeting_date")}>
              <input type="date" min={TODAY} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("taskDetail.d_meeting_time")}>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("taskDetail.d_meeting_duration")}>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>{t("taskDetail.minutes", { count: m })}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton
            disabled={!topic.trim() || !date || !time || props.pending}
            onClick={() => props.onSubmit({ topic: topic.trim(), starts_at: new Date(`${date}T${time}:00`).toISOString(), duration_minutes: duration })}
          >
            {t("taskDetail.d_meeting_send")}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
