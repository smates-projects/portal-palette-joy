import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAcknowledgeMou } from "@/lib/api/hooks";
import { MOU_ACKNOWLEDGMENT_POINTS, type Contract, type MouAcknowledgmentPoint } from "@/lib/api/types";
import { acknowledgedAll } from "@/lib/leads/entry-flow";
import { cn } from "@/lib/utils";
import { primaryButtonCls } from "../shared";

/**
 * The MOU in plain words: the four points, each one with its own "Entendí". "Firmar" activates only when the four are
 * checked; it saves them (POST /acknowledge) and then opens the signer.
 */
export function MouAcceptance({ mou, onSign }: { mou: Contract; onSign: () => void }) {
  const { t } = useTranslation();
  const acknowledge = useAcknowledgeMou();
  const saved = mou.signers.find((s) => s.party === "owner")?.acknowledgments ?? [];
  const [checked, setChecked] = useState<MouAcknowledgmentPoint[]>(saved);
  const toggle = (p: MouAcknowledgmentPoint) => setChecked((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const ready = acknowledgedAll(checked);

  const sign = () => {
    if (!ready) return;
    if (acknowledgedAll(saved)) return onSign();
    acknowledge.mutate({ contractId: mou.id, points: [...MOU_ACKNOWLEDGMENT_POINTS] }, {
      onSuccess: onSign,
      onError: () => toast.error(t("intake.owner.mou.t_error")),
    });
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {MOU_ACKNOWLEDGMENT_POINTS.map((p) => {
          const on = checked.includes(p);
          return (
            <li key={p} className={cn("rounded-[4px] border bg-surface p-3", on ? "border-primary" : "border-border")}>
              <p className="text-sm font-semibold">{t(`intake.owner.mou.points.${p}.title`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(`intake.owner.mou.points.${p}.body`)}</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} onChange={() => toggle(p)} />
                {t("intake.owner.mou.understood")}
              </label>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {ready ? t("intake.owner.mou.ready") : t("intake.owner.mou.missing", { n: MOU_ACKNOWLEDGMENT_POINTS.length - checked.length })}
      </p>
      <button className={primaryButtonCls} disabled={!ready || acknowledge.isPending} onClick={sign}>{t("intake.owner.mou.sign")}</button>
    </div>
  );
}
