import { useTranslation } from "react-i18next";
import { Printer, ShieldCheck } from "lucide-react";
import type { Contract, ContractLanguage, Signer } from "@/lib/api/types";
import { contractTextIn } from "@/lib/contracts/language";
import { smEntitiesOf, smSignerEntityName } from "@/lib/leads/contract-rules";
import { useRules, useSignedDocument } from "@/lib/api/hooks";
import { isMockRepository } from "@/lib/api/mode";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { ContractText, SignatureMark } from "./ContractDocument";
import { SealedCopyLinks } from "./SealedCopies";
import { ContractFallbackNote, ContractGoverningNote, ContractLanguageToggle, useContractLanguage } from "./ContractLanguage";

/**
 * The contract as a document: its full text in the language of its "ES | EN" toggle (Spanish when the English one is
 * missing); one signature block per party (image, name, date, or "Pendiente de firma") and the audit trail. Over the
 * API the trail, the seal and the SHA-256 of the stored copy come from GET /contracts/{id}/signed-document (with the
 * email and IP of every step); nothing is computed here. Read-only, also before anyone signs ("Leer el MOU completo");
 * "Descargar PDF" prints it. "DocuSeal" is named only when DocuSeal really sealed it.
 */
export function SignedContractDialog({ contract, language: initial, onClose }: { contract: Contract; language?: ContractLanguage; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [language, setLanguage] = useContractLanguage(initial);
  const reading = contractTextIn(contract, language);
  const body = reading.value;
  const anySigned = contract.signers.some((s) => s.signed_at);
  const parties = contract.signers.map((s) => s.name).join(", ");
  const signed = useSignedDocument(contract.id).data;
  // The SHA-256 of the stored sealed copy (DocuSeal's PDF, else the portal's copy in the language shown).
  const sha256 = signed?.sealed_pdf_sha256 ?? signed?.sealed_files_sha256?.[reading.language] ?? null;
  const byDocuSeal = !!signed?.sealed_pdf_url;
  // The demo has no stored text for older contracts: only there a sample stands in for it.
  const demoSample = isMockRepository("documents");
  const entities = smEntitiesOf(useRules().data);
  const partyLabel = (s: Signer) => (s.party ? t(`intake.party.${s.party}`) : s.role);
  // The SM part is signed by a person on behalf of the company (the CEO for Corporate).
  const onBehalf = (s: Signer) => (s.party === "sm" && s.signed_at && s.user_id ? t("intake.signed_on_behalf_by", { name: s.name, entity: smSignerEntityName(s, entities) }) : null);
  // The API's audit trail (with email and IP); without it, the signers' history (older contracts: signed_at only).
  const events: { status: string; at: string; signer: string; email?: string | null | undefined; ip?: string | null | undefined }[] = signed
    ? signed.audit_trail.map((e) => ({ status: e.status, at: e.at, signer: e.name, email: e.email, ip: e.ip }))
    : contract.signers
        .flatMap((s) => (s.history?.length ? s.history : s.signed_at ? [{ status: "signed" as const, at: s.signed_at }] : []).map((h) => ({ ...h, signer: s.name })))
        .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto bg-surface p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(anySigned ? "intake.docuseal.signed_title" : "intake.docuseal.document_title")}</p>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>{contract.name}</DialogTitle>
            <ContractLanguageToggle value={language} onChange={setLanguage} className="no-print mr-6" />
          </div>
          <DialogDescription>
            {contract.state === "signed" && contract.signed_at
              ? `${t("intake.docuseal.signed_all_on", { date: formatDate(contract.signed_at, lng) })}${byDocuSeal ? ` ${t("intake.docuseal.sealed_by_docuseal")}` : ""}`
              : anySigned ? t("intake.docuseal.signed_partial") : t("intake.docuseal.not_signed_yet")}
          </DialogDescription>
        </DialogHeader>

        <ContractGoverningNote contract={contract} />
        <ContractFallbackNote show={reading.fallback} className="no-print" />
        <div className="print-doc space-y-4">
        <div id="signed-document" className="rounded-md border border-border bg-muted/50 p-2 sm:p-4 print:border-0 print:bg-transparent print:p-0">
          <div className="mx-auto max-w-xl rounded-md border border-border bg-surface px-5 py-6 text-[13px] leading-relaxed text-muted-foreground sm:px-10 sm:py-10 print:max-w-none print:border-0 print:shadow-none">
            <p className="text-center text-lg font-semibold tracking-tight text-foreground">{contract.name}</p>
            {!body && demoSample && <p className="mt-1 text-center text-[11px] uppercase tracking-wide">{t("intake.docuseal.sample")}</p>}
            <div className="mx-auto mt-4 h-px w-16 bg-border" />
            {body ? (
              // The full text, section by section (the dialog scrolls).
              <ContractText body={body} lang={reading.language} className="mt-5" />
            ) : !demoSample ? (
              <p className="mt-5 text-center">{t("intake.docuseal.text_missing")}</p>
            ) : (<>
              <p className="mt-5 text-foreground">{t("intake.docuseal.pdf_parties", { parties })}</p>
              <p className="mt-2">{t("intake.docuseal.pdf_body")}</p>
              <div className="mt-4 space-y-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-1.5 rounded bg-muted" style={{ width: `${92 - i * 11}%` }} />)}</div>
            </>)}

            <p className="mt-6 text-[11px] font-medium uppercase tracking-wide text-foreground">{t("intake.docuseal.signatures")}</p>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 print:grid-cols-2">
              {contract.signers.map((s) => (
                <div key={`${s.name}-${s.role}`} className="break-inside-avoid">
                  {s.signed_at ? (
                    <div className="flex h-14 items-end border-b border-foreground/60 pb-1">
                      <SignatureMark signature={s.signature} signerName={s.name} />
                    </div>
                  ) : (
                    <div className="flex h-14 items-end border-b border-dashed border-foreground/40 pb-1 text-muted-foreground">{t("intake.docuseal.pending_sig")}</div>
                  )}
                  <p className="mt-1.5 text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs">{partyLabel(s)}{s.signed_at ? ` · ${t("intake.docuseal.signed_on", { date: formatDate(s.signed_at, lng) })}` : ""}</p>
                  {onBehalf(s) && <p className="text-xs">{onBehalf(s)}</p>}
                  {s.signed_at && s.signature?.kind === "saved" && <p className="text-xs">{t("intake.docuseal.saved_signature")}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="break-inside-avoid rounded-md border border-border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-status-success-fg" />{t("intake.docuseal.audit")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("intake.docuseal.audit_hint")}</p>
          <ol className="mt-3 space-y-1 text-xs">
            {contract.sent_at && (
              <li className="flex gap-3"><span className="w-24 shrink-0 tabular-nums text-muted-foreground">{formatDate(contract.sent_at, lng)}</span><span>{t("intake.docuseal.audit_sent_to", { parties })}</span></li>
            )}
            {events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{signed ? formatDateTime(e.at, lng) : formatDate(e.at, lng)}</span>
                <span>
                  {t(`intake.docuseal.audit_${e.status}`, { name: e.signer, defaultValue: `${e.signer} · ${e.status}` })}
                  {(e.email || e.ip) && <span className="block text-muted-foreground">{[e.email, e.ip ? t("intake.docuseal.audit_ip", { ip: e.ip }) : null].filter(Boolean).join(" · ")}</span>}
                </span>
              </li>
            ))}
          </ol>
          <dl className="mt-3 border-t border-border pt-3 text-xs">
            {signed?.fingerprint && (<>
              <dt className="text-muted-foreground">{t("intake.docuseal.seal")}</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px]">{signed.fingerprint}</dd>
            </>)}
            <dt className={cn("text-muted-foreground", signed?.fingerprint && "mt-2")}>{t("intake.docuseal.hash")}</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px]">{sha256 ?? <span className="font-sans text-muted-foreground">{t("intake.docuseal.hash_pending")}</span>}</dd>
            {byDocuSeal && <dd className="mt-1 text-muted-foreground">{t("intake.docuseal.certificate")}</dd>}
            {byDocuSeal && (
              <dd className="no-print mt-1 flex flex-wrap gap-3">
                <a href={signed!.sealed_pdf_url!} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{t("intake.docuseal.sealed_pdf")}</a>
                {signed?.audit_log_url && <a href={signed.audit_log_url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">{t("intake.docuseal.audit_log")}</a>}
              </dd>
            )}
          </dl>
        </section>
        </div>

        <div className="no-print flex flex-wrap items-center justify-end gap-2">
          <SealedCopyLinks contract={contract} className="mr-auto" />
          <SecondaryButton onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />{t("intake.docuseal.print")}</SecondaryButton>
          <PrimaryButton onClick={onClose}>{t("intake.docuseal.close")}</PrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
