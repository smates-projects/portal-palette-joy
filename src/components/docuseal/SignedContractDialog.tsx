import { useTranslation } from "react-i18next";
import { Printer, ShieldCheck } from "lucide-react";
import type { Contract, Signer } from "@/lib/api/types";
import { documentFingerprint } from "@/lib/contracts/signature";
import { formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

/**
 * The sealed document as DocuSeal returns it: the text, one signature block per party (image, name, date) and the
 * audit trail (every event with its date, plus the document fingerprint). Read-only; "Descargar PDF" prints it.
 * In production this shows the real PDF and certificate stored by DocuSeal.
 */
export function SignedContractDialog({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const parties = contract.signers.map((s) => s.name).join(", ");
  const fingerprint = documentFingerprint(contract.id);
  const partyLabel = (s: Signer) => (s.party ? t(`intake.party.${s.party}`) : s.role);
  // Older contracts only keep signed_at: show that as the one audit event.
  const events = contract.signers
    .flatMap((s) => (s.history?.length ? s.history : s.signed_at ? [{ status: "signed" as const, at: s.signed_at }] : []).map((h) => ({ ...h, signer: s.name })))
    .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto bg-surface p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("intake.docuseal.signed_title")}</p>
          <DialogTitle>{contract.name}</DialogTitle>
          <DialogDescription>
            {contract.state === "signed" && contract.signed_at
              ? t("intake.docuseal.signed_all_on", { date: formatDate(contract.signed_at, lng) })
              : t("intake.docuseal.signed_partial")}
          </DialogDescription>
        </DialogHeader>

        <div className="print-doc space-y-4">
        <div id="signed-document" className="rounded-md border border-border bg-muted/50 p-2 sm:p-4 print:border-0 print:bg-transparent print:p-0">
          <div className="mx-auto max-w-xl rounded-md border border-border bg-surface px-5 py-6 text-[13px] leading-relaxed text-muted-foreground sm:px-10 sm:py-10 print:max-w-none print:border-0 print:shadow-none">
            <p className="text-center text-lg font-semibold tracking-tight text-foreground">{contract.name}</p>
            <p className="mt-1 text-center text-[11px] uppercase tracking-wide">{t("intake.docuseal.sample")}</p>
            <div className="mx-auto mt-4 h-px w-16 bg-border" />
            <p className="mt-5 text-foreground">{t("intake.docuseal.pdf_parties", { parties })}</p>
            <p className="mt-2">{t("intake.docuseal.pdf_body")}</p>
            <div className="mt-4 space-y-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-1.5 rounded bg-muted" style={{ width: `${92 - i * 11}%` }} />)}</div>

            <p className="mt-6 text-[11px] font-medium uppercase tracking-wide text-foreground">{t("intake.docuseal.signatures")}</p>
            <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 print:grid-cols-2">
              {contract.signers.map((s) => (
                <div key={`${s.name}-${s.role}`} className="break-inside-avoid">
                  {s.signed_at ? (
                    <div className="flex h-14 items-end border-b border-foreground/60 pb-1">
                      {s.signature ? (
                        <img src={s.signature.image_url} alt={s.name} className="h-12 max-w-full object-contain object-left" />
                      ) : (
                        <span className="text-2xl text-foreground" style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}>{s.name}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-14 items-end border-b border-dashed border-foreground/40 pb-1 text-muted-foreground">{t("intake.docuseal.pending_sig")}</div>
                  )}
                  <p className="mt-1.5 text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs">{partyLabel(s)}{s.signed_at ? ` · ${t("intake.docuseal.signed_on", { date: formatDate(s.signed_at, lng) })}` : ""}</p>
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
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{formatDate(e.at, lng)}</span>
                <span>{t(`intake.docuseal.audit_${e.status}`, { name: e.signer })}</span>
              </li>
            ))}
          </ol>
          <dl className="mt-3 border-t border-border pt-3 text-xs">
            <dt className="text-muted-foreground">{t("intake.docuseal.hash")}</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px]">{fingerprint}</dd>
            <dd className="mt-1 text-muted-foreground">{t("intake.docuseal.certificate")}</dd>
          </dl>
        </section>
        </div>

        <div className="no-print flex justify-end gap-2">
          <SecondaryButton onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />{t("intake.docuseal.print")}</SecondaryButton>
          <PrimaryButton onClick={onClose}>{t("intake.docuseal.close")}</PrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
