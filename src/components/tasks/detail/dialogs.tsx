import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Paperclip, X } from "lucide-react";
import { TODAY } from "@/config/app";
import type { BrandProposalUpload } from "@/lib/api/repositories";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandCaptureSection } from "@/components/brand/BrandCaptureSection";

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
  ownerName: string;
  changesQuote: string | null;
  pending: boolean;
  /** B5-13 only: the firm uploads the brand manual and the logo; the palette read from it travels with the version. */
  brandCapture?: { businessName: string } | undefined;
  /** file_names for the mock, files (the picked Files, same order, without the brand's) for the real API. */
  onSubmit: (v: { note: string; file_names: string[]; files: File[]; brand?: BrandProposalUpload | null }) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState<BrandProposalUpload | null>(null);
  // The manual and the logo of the brand count as files of the deliverable.
  const fileNames = files.map((f) => f.name);
  const allFiles = brand ? [...fileNames, brand.manual_file_name, ...(brand.logo_file_name ? [brand.logo_file_name] : [])] : fileNames;
  const canSend = allFiles.length > 0 && (!props.brandCapture || !!brand);
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        props.onOpenChange(o);
        if (!o) {
          setFiles([]);
          setNote("");
          setBrand(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.isResubmit ? t("taskDetail.d_resubmit_title", { version: props.nextVersion }) : t("taskDetail.d_submit_title")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("taskDetail.d_files_hint")}</DialogDescription>
        </DialogHeader>
        {props.brandCapture && <BrandCaptureSection businessName={props.brandCapture.businessName} value={brand} onChange={setBrand} />}
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
              <div key={`${i}-${f.name}`} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{f.name}</span>
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
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              aria-label={t("taskDetail.d_files")}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length > 0) setFiles((f) => [...f, ...picked]);
                e.target.value = "";
              }}
            />
            <SecondaryButton onClick={() => input.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" />
              {t("taskDetail.d_attach")}
            </SecondaryButton>
            {allFiles.length === 0 && <p className="text-xs text-muted-foreground">{t("taskDetail.d_files_hint")}</p>}
            {props.brandCapture && !brand && <p className="text-xs text-muted-foreground">{t("brand.required_hint")}</p>}
          </div>
          <Field label={t("taskDetail.d_note", { name: props.ownerName })}>
            <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("taskDetail.d_note_placeholder")} className={textareaCls} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={!canSend || props.pending} onClick={() => props.onSubmit({ note: note.trim(), file_names: allFiles, files, brand })}>
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

/** Owner: request changes on a delivered version. The note is required. */
export function RequestChangesDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  firmName: string;
  pending: boolean;
  onSubmit: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  return (
    <Dialog open={props.open} onOpenChange={(o) => { props.onOpenChange(o); if (!o) setNote(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("owner.d_changes_title")}</DialogTitle>
          <DialogDescription>{t("owner.d_changes_body", { firm: props.firmName })}</DialogDescription>
        </DialogHeader>
        <Field label={t("owner.d_changes_note")}>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("owner.d_changes_placeholder")} className={textareaCls} />
        </Field>
        {!note.trim() && <p className="text-xs text-muted-foreground">{t("owner.d_changes_required")}</p>}
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={!note.trim() || props.pending} onClick={() => props.onSubmit(note.trim())}>
            {t("owner.action_request_changes")}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Owner: answer a firm's request by uploading a file, with an optional note. */
export function AnswerRequestDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  question: string;
  pending: boolean;
  /** file_name for the mock, file (the picked File) for the real API. */
  onSubmit: (v: { file_name: string; note: string; file: File }) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  return (
    <Dialog open={props.open} onOpenChange={(o) => { props.onOpenChange(o); if (!o) { setFile(null); setNote(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("owner.d_upload_title")}</DialogTitle>
          <DialogDescription>{props.question}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">{t("owner.d_upload_file")}</span>
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{file.name}</span>
                <button type="button" aria-label={t("taskDetail.d_remove_file")} onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={input}
                  type="file"
                  className="sr-only"
                  aria-label={t("owner.d_upload_file")}
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) setFile(picked);
                    e.target.value = "";
                  }}
                />
                <SecondaryButton onClick={() => input.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" />
                  {t("taskDetail.d_attach")}
                </SecondaryButton>
              </>
            )}
          </div>
          <Field label={t("owner.d_upload_note")}>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={textareaCls} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={() => props.onOpenChange(false)}>{t("taskDetail.d_cancel")}</SecondaryButton>
          <PrimaryButton disabled={!file || props.pending} onClick={() => file && props.onSubmit({ file_name: file.name, note: note.trim(), file })}>
            {t("owner.d_upload_send")}
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
