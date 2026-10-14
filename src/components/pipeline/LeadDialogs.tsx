import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TODAY } from "@/config/app";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

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

export function SignContractDialog(props: { consultant: string; pending: boolean; onClose: () => void; onConfirm: (date: string) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(TODAY);
  const future = date > TODAY;
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.sign_title")}</DialogTitle>
          <DialogDescription>{t("pipeline.sign_body", { consultant: props.consultant })}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("pipeline.sign_date")}</span>
          <input type="date" value={date} max={TODAY} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          {future && <span className="text-xs text-status-danger-fg">{t("pipeline.sign_future")}</span>}
        </label>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => props.onConfirm(date)} disabled={props.pending || !date || future}>{t("pipeline.sign_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
