import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/format";
import { programDayOn, validDay1 } from "@/lib/leads/funds";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { inputCls } from "./parts";

/**
 * "Confirmar inicio del programa". Proposes as day 1 the date of whatever happened last (tripartite signed by the
 * three or funds complete); SM can pick a later date, never an earlier one.
 */
export function StartProgramDialog(props: { name: string; proposed: string; pending: boolean; onClose: () => void; onConfirm: (day1: string) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [day1, setDay1] = useState(props.proposed);
  const valid = validDay1(day1, props.proposed);
  const day = valid ? programDayOn(day1) : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("funds.start.title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t("funds.start.body")}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("funds.start.day1")}</span>
          <input type="date" value={day1} min={props.proposed} onChange={(e) => setDay1(e.target.value)} className={inputCls} />
        </label>
        <p className="text-xs text-muted-foreground">{t("funds.start.proposed", { date: formatDate(props.proposed, lng) })}</p>
        {!valid && <p className="text-xs text-status-danger-fg">{t("funds.start.too_early", { date: formatDate(props.proposed, lng) })}</p>}
        {valid && <p className="text-sm">{day > 0 ? t("funds.start.today_day", { day }) : t("funds.start.future", { date: formatDate(day1, lng) })}</p>}
        <p className="text-xs text-muted-foreground">{t("funds.start.what_happens")}</p>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("funds.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => props.onConfirm(day1)} disabled={props.pending || !valid}>{t("funds.start.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
