import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useBishopAgreements, useCurrentUser } from "@/lib/api/hooks";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { SealedCopyLinks } from "@/components/docuseal/SealedCopies";
import type { AgreementState, BishopAgreement, Contract } from "@/lib/api/types";
import { signingStatus } from "@/lib/contracts/parties";
import { formatDate } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, primaryButton, Screen, secondaryButton, Tag, type Tone } from "@/components/bishop/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BishopFundsSection } from "@/components/bishop/funds/BishopFundsSection";

const STATE_TONE: Record<AgreementState, Tone> = { draft: "neutral", sent: "warning", signed: "success" };

/**
 * The state as the Bishop reads it: once he signed, "Firmado por ti, falta Strategic Mates Corporate" (the pending
 * parties the API names) until everyone signed ("Firmado por todos"); before, the plain state.
 */
function AgreementStatus({ agreement: a }: { agreement: BishopAgreement }) {
  const { t } = useTranslation();
  const status = a.contract ? signingStatus({ ...a.contract, ...(a.my_signature ? { my_signature: a.my_signature } : {}), ...(a.pending_parties ? { pending_parties: a.pending_parties } : {}) }, "bishop") : null;
  if (status?.all || a.state === "signed") return <Tag tone="success">{t("bishop.agreements.signed_by_all")}</Tag>;
  if (status?.mine) return <Tag tone="warning">{t("bishop.agreements.signed_by_you_pending", { parties: status.pending.join(", ") })}</Tag>;
  return <Tag tone={STATE_TONE[a.state]}>{t(`bishop.agreements.state_${a.state}`)}</Tag>;
}

/** Sign, open the signed document, the stored file, or a disabled "Ver documento" with the reason. */
function AgreementAction({ agreement: a, onSign, onView }: { agreement: BishopAgreement; onSign: (c: Contract) => void; onView: (c: Contract) => void }) {
  const { t } = useTranslation();
  if (a.contract && a.contract.signers.some((x) => x.party === "bishop" && (x.status === "sent" || x.status === "opened"))) {
    const contract = a.contract;
    return <button onClick={() => onSign(contract)} className={primaryButton}>{t("bishop.agreements.sign")}</button>;
  }
  if (a.contract && a.contract.signers.some((x) => x.signed_at)) {
    const contract = a.contract;
    return (
      <button onClick={() => onView(contract)} aria-label={t("bishop.agreements.open_document_for", { name: a.name })} className={secondaryButton}>
        <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.agreements.open_document")}
      </button>
    );
  }
  if (a.file_url)
    // The stored agreement (GET /files/{id}/download). Without a link the button stays disabled.
    return (
      <a
        href={a.file_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("bishop.agreements.open_document_for", { name: a.name })}
        className={`${secondaryButton} inline-flex items-center whitespace-nowrap`}
      >
        <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.agreements.open_document")}
      </a>
    );
  // A disabled button gets no hover events, so the tooltip hangs from a focusable wrapper.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <button disabled aria-label={t("bishop.agreements.open_document_for", { name: a.name })} className={secondaryButton}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.agreements.open_document")}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("bishop.agreements.no_file")}</TooltipContent>
    </Tooltip>
  );
}

/** Agreements of the Bishop (equity agreement, NDA) with their signature status. */
export function AgreementsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const agreementsQ = useBishopAgreements();
  const me = useCurrentUser().data;
  const [signing, setSigning] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);

  if (agreementsQ.isError)
    return (
      <Screen ns="bishop" screen="agreements">
        <ErrorBlock title={t("bishop.error")} retryLabel={t("bishop.retry")} onRetry={() => void agreementsQ.refetch()} />
      </Screen>
    );
  if (agreementsQ.isLoading || !agreementsQ.data)
    return (
      <Screen ns="bishop" screen="agreements">
        <LoadingBlocks rows={2} />
      </Screen>
    );
  if (agreementsQ.data.length === 0)
    return (
      <Screen ns="bishop" screen="agreements">
        <div className="mt-6"><EmptyBlock title={t("bishop.agreements.empty_title")} body={t("bishop.agreements.empty_body")} /></div>
      </Screen>
    );

  const signedOn = (a: BishopAgreement) =>
    a.signed_at ? t("bishop.agreements.signed_on", { date: formatDate(a.signed_at, lng) }) : t("bishop.agreements.not_signed");
  const action = (a: BishopAgreement) => <AgreementAction agreement={a} onSign={setSigning} onView={setViewing} />;

  return (
    <Screen ns="bishop" screen="agreements">
      <div className="mt-6 min-w-0">
        <Panel>
          <TooltipProvider delayDuration={150}>
            {/* Phones: one card per agreement, never a table wider than the screen (QA M6, 390 px). */}
            <ul className="divide-y divide-border md:hidden">
              {agreementsQ.data.map((a) => (
                <li key={a.id} className="space-y-2 px-4 py-3 text-sm">
                  <p className="font-medium">{a.name}</p>
                  {a.counterparties && <p className="text-muted-foreground">{a.counterparties}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <AgreementStatus agreement={a} />
                    <span className="text-xs tabular-nums text-muted-foreground">{signedOn(a)}</span>
                  </div>
                  {a.contract && <SealedCopyLinks contract={a.contract} />}
                  <div className="[&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center [&_span]:block">{action(a)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.agreements.col_agreement")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.agreements.col_parties")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.agreements.col_status")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("bishop.agreements.col_date")}</th>
                    <th scope="col" className="w-44 px-4 py-2 font-medium"><span className="sr-only">{t("bishop.agreements.col_document")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border border-t border-border">
                  {agreementsQ.data.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-medium">
                        {a.name}
                        {a.contract && <SealedCopyLinks contract={a.contract} className="mt-2 font-normal" />}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.counterparties}</td>
                      <td className="px-4 py-3"><AgreementStatus agreement={a} /></td>
                      <td className="px-4 py-3 tabular-nums">{signedOn(a)}</td>
                      <td className="w-44 whitespace-nowrap px-4 py-3 text-right [&_button]:inline-flex [&_button]:items-center [&_button]:whitespace-nowrap">
                        {action(a)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TooltipProvider>
        </Panel>
      </div>
      {/* What he paid SM for each program, his receipts and, once it runs, how SM distributes it. */}
      <div className="mt-4"><BishopFundsSection variant="agreements" /></div>
      {signing && <DocuSealSigner contract={signing} party="bishop" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      {viewing && <SignedContractDialog contract={viewing} onClose={() => setViewing(null)} />}
    </Screen>
  );
}
