import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download } from "lucide-react";
import type { Contract } from "@/lib/api/types";
import { isMockRepository } from "@/lib/api/mode";
import { sealedCopiesOf } from "@/lib/contracts/language";
import { cn } from "@/lib/utils";

const linkCls =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The sealed PDF copies of a contract every party signed, "Descargar en español" and "Download in English" (each
 * named in its own language). The links are presigned and expire: they come fresh with every read of the contract
 * and open in a new tab. Nothing shows until the API sealed them. In the demo there is no real file: it says so.
 */
export function SealedCopyLinks({ contract, className }: { contract: Pick<Contract, "sealed_files" | "name">; className?: string }) {
  const { t } = useTranslation();
  const copies = sealedCopiesOf(contract);
  if (copies.length === 0) return null;
  const demo = isMockRepository("documents");
  return (
    <div role="group" aria-label={t("contracts_lang.sealed_label", { name: contract.name })} className={cn("flex flex-wrap items-center gap-2", className)}>
      {copies.map((copy) => (
        <a
          key={copy.language}
          href={copy.download_url}
          target="_blank"
          rel="noopener noreferrer"
          lang={copy.language}
          className={linkCls}
          onClick={demo ? (e) => { e.preventDefault(); toast.info(t("contracts_lang.t_demo_download")); } : undefined}
        >
          <Download className="h-3.5 w-3.5" />
          {t(`contracts_lang.download_${copy.language}`)}
        </a>
      ))}
    </div>
  );
}
