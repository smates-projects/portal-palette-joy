import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Circle, FileText } from "lucide-react";
import { useAcceptDocument, useLeadIntake, useRequestDocument, useResendContract } from "@/lib/api/hooks";
import type { BusinessDocument, Contract, ReviewClock } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { canResend } from "@/lib/leads/onboarding";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";

const TONE: Record<ReviewClock["tone"], string> = {
  ok: "border-border bg-muted text-foreground",
  amber: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  red: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
};
const DOC_TONE: Record<BusinessDocument["state"], string> = {
  requested: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  received: "border-status-info-border bg-status-info-bg text-status-info-fg",
  reviewed: "border-status-success-border bg-status-success-bg text-status-success-fg",
  rejected: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
};

export function ClockLabel({ clock }: { clock: ReviewClock }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex rounded-[4px] border px-2 py-0.5 text-xs font-medium", TONE[clock.tone])}>
      {t(`intake.clock.${clock.status}`, { day: clock.day, total: clock.total })}
    </span>
  );
}

/**
 * Entry checklist of a lead: NDA, MOU, documents uploaded and accepted, and each document with Aceptar / Pedir otro.
 * Review is Strategic Mates team work: any SM person of the office acts. SM Global reads it (`readOnly`).
 */
export function IntakeChecklist({ leadId, readOnly }: { leadId: string; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadIntake(leadId);
  const resend = useResendContract();
  const [accepting, setAccepting] = useState<BusinessDocument | null>(null);
  const [requesting, setRequesting] = useState<BusinessDocument | null>(null);
  const [signing, setSigning] = useState<Contract | null>(null);

  if (q.isLoading) return <Skeleton className="h-40 rounded-md" />;
  if (q.isError) return <button onClick={() => void q.refetch()} className="text-sm text-link hover:underline">{t("pipeline.retry")}</button>;
  if (!q.data) return null;
  const { summary, contracts, documents } = q.data;

  const contractRow = (c: Contract) => {
    const done = c.signers.every((s) => s.status === "signed");
    const sm = c.signers.find((s) => s.party === "sm");
    return (
      <li key={c.id} className="py-2.5">
        <div className="flex items-center gap-2">
          {done ? <Check className="h-4 w-4 text-status-success-fg" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{c.name}</span>
          <span className="ml-auto flex gap-2">
            {!readOnly && sm && sm.status !== "signed" && sm.status !== "declined" && (
              <button onClick={() => setSigning(c)} className="text-xs text-link hover:underline">{t("intake.sign_as_sm")}</button>
            )}
            {!readOnly && canResend(c) && (
              <button
                onClick={() => resend.mutate({ id: leadId, contractId: c.id }, { onSuccess: () => toast.success(t("intake.t_resent", { name: c.name })), onError: () => toast.error(t("pipeline.t_error")) })}
                className="text-xs text-link hover:underline"
              >
                {t("intake.resend")}
              </button>
            )}
          </span>
        </div>
        <ul className="mt-1 space-y-0.5 pl-6 text-xs text-muted-foreground">
          {c.signers.map((s) => {
            const last = s.history?.at(-1);
            return (
              <li key={s.party ?? s.name}>
                {t(`intake.party.${s.party ?? "owner"}`)}: <span className={cn(s.status === "signed" && "text-status-success-fg", s.status === "declined" && "text-status-danger-fg")}>{t(`intake.signer_status.${s.status ?? "sent"}`)}</span>
                {last && ` · ${formatDate(last.at, lng)}`}
                {s.decline_reason && ` · ${t("intake.declined_reason", { reason: s.decline_reason })}`}
              </li>
            );
          })}
        </ul>
      </li>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("intake.title")}</h3>
        <ClockLabel clock={summary.clock} />
      </div>
      <div className="rounded-md border border-border px-4">
        <ul className="divide-y divide-border">
          {contracts.map(contractRow)}
          <CountRow label={t("intake.uploaded")} n={summary.uploaded} m={summary.required_total} />
          <CountRow label={t("intake.accepted")} n={summary.accepted} m={summary.required_total} />
        </ul>
      </div>
      {!readOnly && <p className="text-xs text-muted-foreground">{t("intake.team_note")}</p>}

      <div id="intake-docs" className="rounded-md border border-border">
        <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">{t("intake.docs_title")}</p>
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{d.name}</span>
                <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium", DOC_TONE[d.state])}>{t(`intake.state.${d.state}`)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {d.required ? t("intake.required") : t("intake.optional")}
                {d.only_if_llc && ` · ${t("intake.only_llc")}`}
                {d.file_name ? (
                  <> · <a href="#" onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1 text-link hover:underline"><FileText className="h-3 w-3" />{t("intake.open_file")} {d.file_name}</a></>
                ) : ` · ${t("intake.not_uploaded")}`}
              </p>
              {d.state === "reviewed" && d.verified_fact && <p className="mt-0.5 text-xs text-status-success-fg">{t("intake.verified", { fact: d.verified_fact })}</p>}
              {d.state === "rejected" && d.review_comment && <p className="mt-0.5 text-xs text-status-warning-fg">{t("intake.asked_again", { comment: d.review_comment })}</p>}
              {!readOnly && (d.state === "received" || d.state === "reviewed") && (
                <div className="mt-1.5 flex gap-3">
                  {d.state === "received" && <button onClick={() => setAccepting(d)} className="text-xs font-medium text-link hover:underline">{t("intake.accept")}</button>}
                  <button onClick={() => setRequesting(d)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{t("intake.request_again")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {accepting && <AcceptDialog leadId={leadId} doc={accepting} onClose={() => setAccepting(null)} />}
      {requesting && <RequestDialog leadId={leadId} doc={requesting} onClose={() => setRequesting(null)} />}
      {signing && <DocuSealSigner contract={signing} party="sm" signerName="Strategic Mates" onClose={() => setSigning(null)} />}
    </section>
  );
}

function CountRow({ label, n, m }: { label: string; n: number; m: number }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2 py-2.5 text-sm">
      {n >= m && m > 0 ? <Check className="h-4 w-4 text-status-success-fg" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{t("intake.of_required", { n, m })}</span>
    </li>
  );
}

export function TextDialog(props: { title: string; body: string; label: string; confirm: string; required: string; initial?: string; pending: boolean; onClose: () => void; onConfirm: (v: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(props.initial ?? "");
  const [tried, setTried] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.body}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{props.label}</span>
          <textarea autoFocus rows={3} value={value} onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>
        {tried && !value.trim() && <p className="text-xs text-status-danger-fg">{props.required}</p>}
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("intake.cancel")}</SecondaryButton>
          <PrimaryButton disabled={props.pending} onClick={() => { setTried(true); if (value.trim()) props.onConfirm(value.trim()); }}>{props.confirm}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptDialog({ leadId, doc, onClose }: { leadId: string; doc: BusinessDocument; onClose: () => void }) {
  const { t } = useTranslation();
  const accept = useAcceptDocument();
  return (
    <TextDialog
      title={t("intake.accept_title", { name: doc.name })} body={t("intake.accept_body")} label={t("intake.accept_label")}
      confirm={t("intake.accept_confirm")} required={t("intake.fact_required")} initial={doc.verified_hint ?? ""} pending={accept.isPending} onClose={onClose}
      onConfirm={(fact) => accept.mutate({ id: leadId, documentId: doc.id, fact }, { onSuccess: () => { toast.success(t("intake.t_accepted")); onClose(); }, onError: () => toast.error(t("pipeline.t_error")) })}
    />
  );
}

function RequestDialog({ leadId, doc, onClose }: { leadId: string; doc: BusinessDocument; onClose: () => void }) {
  const { t } = useTranslation();
  const request = useRequestDocument();
  return (
    <TextDialog
      title={t("intake.request_title", { name: doc.name })} body={t("intake.request_body")} label={t("intake.request_label")}
      confirm={t("intake.request_confirm")} required={t("intake.comment_required")} pending={request.isPending} onClose={onClose}
      onConfirm={(comment) => request.mutate({ id: leadId, documentId: doc.id, comment }, { onSuccess: () => { toast.success(t("intake.t_requested")); onClose(); }, onError: () => toast.error(t("pipeline.t_error")) })}
    />
  );
}

/** "No aprobar": asks the reason, then the caller discards the lead. */
export function RejectDocsDialog(props: { name: string; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  return (
    <TextDialog title={t("intake.reject_title", { name: props.name })} body={t("intake.reject_body")} label={t("intake.reject_label")}
      confirm={t("intake.reject_confirm")} required={t("pipeline.reason_required")} pending={props.pending} onClose={props.onClose} onConfirm={props.onConfirm} />
  );
}
