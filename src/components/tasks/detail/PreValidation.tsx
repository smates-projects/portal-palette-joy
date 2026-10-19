import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useResolvePreValidation } from "@/lib/api/hooks";
import type { PreValidation, TaskWithComputed } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "./dialogs";

const badge = "inline-flex items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none";
const TONE: Record<PreValidation, string> = {
  pending: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  existing: "border-status-success-border bg-status-success-bg text-status-success-fg",
  needed: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
};

/** "A validar: el negocio ya lo tendría", "Ya existía" or "Hay que hacerla". */
export function PreValidationBadge({ value, className }: { value: PreValidation; className?: string }) {
  const { t } = useTranslation();
  return <span className={cn(badge, TONE[value], className)}>{t(`entry.pre.${value}`)}</span>;
}

/**
 * Task marked by the assessment. The SM team decides it with the owner during the Diagnóstico: "Ya lo tenía" (with
 * the evidence; approved as "Ya existía" without the firm) or "Hay que hacerla" (normal flow). Both can be undone.
 */
export function PreValidationBlock({ task, canResolve }: { task: TaskWithComputed; canResolve: boolean }) {
  const { t } = useTranslation();
  const resolve = useResolvePreValidation();
  const [open, setOpen] = useState(false);
  const value = task.pre_validation;
  // Not flagged by the assessment: SM can still mark it "Ya lo tenía" while it has not started.
  const canMarkAny = !value && canResolve && task.status === "pending";
  if (!value && !canMarkAny) return null;
  const fail = () => toast.error(t("entry.pre.t_error"));
  const undo = () => resolve.mutate({ id: task.id, input: { decision: "pending" } }, { onError: fail });
  const needed = () =>
    resolve.mutate({ id: task.id, input: { decision: "needed" } }, {
      onSuccess: () => toast.success(t("entry.pre.t_needed", { code: task.code }), { action: { label: t("entry.undo"), onClick: undo } }),
      onError: fail,
    });
  const existing = (evidence: string, note: string, file: File | null) =>
    resolve.mutate({ id: task.id, input: { decision: "existing", evidence_file_name: evidence, note, evidence_file: file } }, {
      onSuccess: () => { setOpen(false); toast.success(t("entry.pre.t_existing", { code: task.code }), { action: { label: t("entry.undo"), onClick: undo } }); },
      onError: fail,
    });

  if (!value) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-link hover:underline">{t("entry.pre.have_any")}</button>
        {open && <ExistingDialog code={task.code} pending={resolve.isPending} onClose={() => setOpen(false)} onConfirm={existing} />}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <PreValidationBadge value={value} />
      {value === "pending" && (
        <>
          <p className="text-xs text-muted-foreground">{t(canResolve ? "entry.pre.hint_sm" : "entry.pre.hint")}</p>
          {canResolve && (
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => setOpen(true)}>{t("entry.pre.have")}</SecondaryButton>
              <SecondaryButton onClick={needed}>{t("entry.pre.do")}</SecondaryButton>
            </div>
          )}
        </>
      )}
      {open && <ExistingDialog code={task.code} pending={resolve.isPending} onClose={() => setOpen(false)} onConfirm={existing} />}
    </div>
  );
}

/**
 * The evidence the owner showed: a file picked from the computer (what the real API stores) or, in the demo, just its
 * name typed in. Picking a file fills the name.
 */
function ExistingDialog(props: { code: string; pending: boolean; onClose: () => void; onConfirm: (evidence: string, note: string, file: File | null) => void }) {
  const { t } = useTranslation();
  const picker = useRef<HTMLInputElement>(null);
  const [evidence, setEvidence] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const input = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry.pre.dialog_title", { code: props.code })}</DialogTitle>
          <DialogDescription>{t("entry.pre.dialog_body")}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry.pre.evidence")}</span>
          <input autoFocus value={evidence} onChange={(e) => { setEvidence(e.target.value); setFile(null); }} placeholder={t("entry.pre.evidence_placeholder")} className={input} />
          <input
            ref={picker}
            type="file"
            className="sr-only"
            aria-label={t("entry.pre.evidence")}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) { setFile(picked); setEvidence(picked.name); }
              e.target.value = "";
            }}
          />
          <SecondaryButton onClick={() => picker.current?.click()}><Paperclip className="h-3.5 w-3.5" />{t("taskDetail.d_attach")}</SecondaryButton>
          {tried && !evidence.trim() && <span className="text-xs text-status-danger-fg">{t("entry.pre.evidence_required")}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry.pre.note")}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton disabled={props.pending} onClick={() => { setTried(true); if (evidence.trim()) props.onConfirm(evidence.trim(), note.trim(), file); }}>{t("entry.pre.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
