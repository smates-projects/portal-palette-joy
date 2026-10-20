import { useTranslation } from "react-i18next";
import type { IntakeDocumentHelp } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The help of one entry document, the same for the owner (Documentos) and the consultant (the lead's checklist):
 * what it is, the "Sirve:" list and the tip.
 */
export function DocumentHelp({ help, className }: { help: IntakeDocumentHelp; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      {help.what && <p className="text-foreground">{help.what}</p>}
      {help.counts.length > 0 && (
        <div>
          <p className="font-medium text-foreground">{t("intake.help.counts")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {help.counts.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {help.tip && <p>{help.tip}</p>}
    </div>
  );
}
