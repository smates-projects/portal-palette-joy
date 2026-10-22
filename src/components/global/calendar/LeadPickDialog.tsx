import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

export interface LeadChoice {
  id: string;
  label: string;
}

/**
 * First step of "Agendar reunión" and "Registrar reunión" from the Calendario: which business the meeting is about.
 * Then the same dialog as on the lead opens.
 */
export function LeadPickDialog(props: {
  title: string;
  hint: string;
  choices: LeadChoice[];
  onClose: () => void;
  onPick: (leadId: string) => void;
}) {
  const { t } = useTranslation();
  const [leadId, setLeadId] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.hint}</DialogDescription>
        </DialogHeader>
        {props.choices.length === 0 ? (
          <p className="rounded-[4px] border border-border px-3 py-3 text-sm text-muted-foreground">
            {t("calendar.global.pick_empty")}{" "}
            <Link to="/embudo" onClick={props.onClose} className="text-link hover:underline">{t("calendar.global.empty_link")}</Link>
          </p>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("calendar.global.pick_label")}</span>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-9 w-full rounded-[4px] border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">{t("calendar.global.pick_placeholder")}</option>
              {props.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        )}
        <DialogFooter className="gap-2">
          <SecondaryButton onClick={props.onClose}>{t("calendar.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => leadId && props.onPick(leadId)} disabled={!leadId}>{t("calendar.global.pick_continue")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
