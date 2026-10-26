import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAcknowledgeMou, useProgramDays } from "@/lib/api/hooks";
import { MOU_ACKNOWLEDGMENT_POINTS, type Contract, type MouAcknowledgmentPoint, type MouAcknowledgmentPointText } from "@/lib/api/types";
import { isMockRepository } from "@/lib/api/mode";
import { acknowledgedAll } from "@/lib/leads/entry-flow";
import { cn } from "@/lib/utils";
import { secondaryButtonCls } from "../shared";

/**
 * The MOU in plain words: its points as the API sends them (Contract.acknowledgment_points, in the reading language),
 * each one with its own "Entendí". "Firmar" activates only when all of them are checked; it saves them
 * (POST /acknowledge) and then opens the signer. It is a secondary button: the MOU is signed at the end of the first
 * meeting with the consultant, signing earlier is allowed but not the step's call. Only the demo, whose contracts
 * carry no points, writes them from the locale texts.
 */
export function MouAcceptance({ mou, onSign }: { mou: Contract; onSign: () => void }) {
  const { t, i18n } = useTranslation();
  const acknowledge = useAcknowledgeMou();
  // The program length of the rules, never a written "180" (QA B4).
  const days = useProgramDays();
  const fromApi = mou.acknowledgment_points?.[i18n.language.startsWith("en") ? "en" : "es"];
  const points: MouAcknowledgmentPointText[] = fromApi?.length
    ? fromApi
    : isMockRepository("documents")
      ? MOU_ACKNOWLEDGMENT_POINTS.map((code) => ({ code, title: t(`intake.owner.mou.points.${code}.title`), body: t(`intake.owner.mou.points.${code}.body`, { days }) }))
      : [];
  const codes = points.map((p) => p.code);
  const saved = mou.signers.find((s) => s.party === "owner")?.acknowledgments ?? [];
  const [checked, setChecked] = useState<MouAcknowledgmentPoint[]>(saved);
  const toggle = (p: MouAcknowledgmentPoint) => setChecked((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const ready = codes.length > 0 && codes.every((c) => checked.includes(c)) && acknowledgedAll(checked);

  const sign = () => {
    if (!ready) return;
    if (codes.every((c) => saved.includes(c))) return onSign();
    acknowledge.mutate({ contractId: mou.id, points: codes }, {
      onSuccess: onSign,
      onError: () => toast.error(t("intake.owner.mou.t_error")),
    });
  };

  if (points.length === 0) return <p className="text-sm text-muted-foreground">{t("intake.owner.mou.points_missing")}</p>;

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {points.map(({ code: p, title, body }) => {
          const on = checked.includes(p);
          return (
            <li key={p} className={cn("rounded-[4px] border bg-surface p-3", on ? "border-primary" : "border-border")}>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} onChange={() => toggle(p)} />
                {t("intake.owner.mou.understood")}
              </label>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {ready ? t("intake.owner.mou.ready") : t("intake.owner.mou.missing", { n: codes.filter((c) => !checked.includes(c)).length })}
      </p>
      <button className={secondaryButtonCls} disabled={!ready || acknowledge.isPending} onClick={sign}>{t("intake.owner.mou.sign")}</button>
    </div>
  );
}
