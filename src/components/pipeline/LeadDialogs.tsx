import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

/**
 * "Se hizo" with the MOU unsigned: the lead leaves the process by itself, so the consultant is warned before. The two
 * ways out are the alternatives, not a generic cancel: "Reagendar" (sign the MOU in that meeting) or "Confirmar igual".
 */
export function MouUnsignedDialog(props: { name: string; pending: boolean; onClose: () => void; onReschedule: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry.outcome.mou_warning_title")}</DialogTitle>
          <DialogDescription>{props.name}</DialogDescription>
        </DialogHeader>
        <div role="alert" className="flex items-start gap-2 rounded-[4px] border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t("entry.outcome.mou_warning_body")}</p>
        </div>
        <p className="text-sm text-muted-foreground">{t("entry.outcome.mou_warning_hint")}</p>
        <DialogFooter>
          <SecondaryButton onClick={() => { if (!props.pending) props.onReschedule(); }}>{t("entry.outcome.mou_warning_reschedule")}</SecondaryButton>
          <PrimaryButton onClick={props.onConfirm} disabled={props.pending}>{t("entry.outcome.mou_warning_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The old "Marcar contrato firmado" dialog was replaced by StartProgramDialog (components/funds): the program
// starts only with the tripartite contract signed and the Bishop funds complete.

export function DiscardLeadDialog(props: { name: string; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (reason.trim()) props.onConfirm(reason.trim());
  };
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.discard_title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t("pipeline.discard_body")}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("pipeline.discard_reason")}</span>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("pipeline.discard_placeholder")}
            className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          {tried && !reason.trim() && <span className="text-xs text-status-danger-fg">{t("pipeline.reason_required")}</span>}
        </label>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("pipeline.discard_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
