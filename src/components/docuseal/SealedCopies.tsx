import { useEffect, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, ShieldCheck } from "lucide-react";
import type { Contract, ContractLanguage } from "@/lib/api/types";
import { apiBaseUrl } from "@/lib/api/http/client";
import { isMockRepository } from "@/lib/api/mode";
import { CONTRACT_LANGUAGES, sealedCopiesOf, sealedCopyUrl } from "@/lib/contracts/language";
import { cn } from "@/lib/utils";

const linkCls =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The sealed PDF copies of a contract every party signed, "Descargar en español" and "Download in English" (each
 * named in its own language), and DocuSeal's audit certificate next to them when DocuSeal signed it (one certificate
 * covers both copies: who signed, when, from where, how they were verified, the hash of each document). The links
 * answer a short presigned download and open in a new tab. Nothing shows until the API sealed them. In the demo there
 * is no real file: it says so.
 */
export function SealedCopyLinks({ contract, className }: { contract: Pick<Contract, "sealed_files" | "name">; className?: string }) {
  const { t } = useTranslation();
  const copies = sealedCopiesOf(contract);
  if (copies.length === 0) return null;
  const demo = isMockRepository("documents");
  const audit = contract.sealed_files?.audit?.download_url;
  const demoClick = demo ? (e: MouseEvent) => { e.preventDefault(); toast.info(t("contracts_lang.t_demo_download")); } : undefined;
  return (
    <div role="group" aria-label={t("contracts_lang.sealed_label", { name: contract.name })} className={cn("flex flex-wrap items-center gap-2", className)}>
      {copies.map((copy) => (
        <a key={copy.language} href={copy.download_url} target="_blank" rel="noopener noreferrer" lang={copy.language} className={linkCls} onClick={demoClick}>
          <Download className="h-3.5 w-3.5" />
          {t(`contracts_lang.download_${copy.language}`)}
        </a>
      ))}
      {audit && (
        <a href={audit} target="_blank" rel="noopener noreferrer" className={linkCls} onClick={demoClick}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("contracts_lang.download_audit")}
        </a>
      )}
    </div>
  );
}

/**
 * /contratos/$id, where the "Contrato firmado" email lands (through the entry link for an owner without a password):
 * starts the download of the copy in the requested language, and offers both copies in case it does not start. The
 * API checks that the person is a party and answers 404 while the copy is not stored. In the demo nothing downloads.
 */
export function SealedCopyPage({ contractId, language }: { contractId: string; language: ContractLanguage }) {
  const { t } = useTranslation();
  const demo = isMockRepository("documents");

  useEffect(() => {
    if (!demo) window.location.assign(sealedCopyUrl(contractId, language, apiBaseUrl()));
  }, [contractId, language, demo]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("contracts_lang.copy_page_title")}</h1>
      <p className="text-sm text-muted-foreground">{t("contracts_lang.copy_page_body")}</p>
      <div role="group" aria-label={t("contracts_lang.copy_page_title")} className="flex flex-wrap items-center gap-2">
        {CONTRACT_LANGUAGES.map((copy) => (
          <a
            key={copy}
            href={sealedCopyUrl(contractId, copy, apiBaseUrl())}
            lang={copy}
            className={linkCls}
            onClick={demo ? (e) => { e.preventDefault(); toast.info(t("contracts_lang.t_demo_download")); } : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            {t(`contracts_lang.download_${copy}`)}
          </a>
        ))}
      </div>
      <Link to="/" className="text-sm text-link hover:underline">
        {t("contracts_lang.copy_page_home")}
      </Link>
    </div>
  );
}
