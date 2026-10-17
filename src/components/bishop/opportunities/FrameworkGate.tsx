import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Contract } from "@/lib/api/types";
import { useCurrentUser } from "@/lib/api/hooks";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { primaryButton } from "@/components/bishop/ui";

/** Shown instead of the opportunities while the Bishop has not signed the framework agreement. */
export function FrameworkGate({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("bishop.framework.gate_title")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("bishop.framework.gate_body")}</p>
      <button onClick={() => setOpen(true)} className={`${primaryButton} mt-4`}>{t("bishop.framework.sign")}</button>
      {open && <DocuSealSigner contract={contract} party="bishop" signerName={me?.full_name ?? ""} onClose={() => setOpen(false)} />}
    </div>
  );
}
