import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useBishopAgreements, useCurrentUser } from "@/lib/api/hooks";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
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

  return (
    <Screen ns="bishop" screen="agreements">
      <div className="mt-6">
        <Panel>
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto">
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
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.counterparties}</td>
                      <td className="px-4 py-3"><AgreementStatus agreement={a} /></td>
                      <td className="px-4 py-3 tabular-nums">
                        {a.signed_at ? t("bishop.agreements.signed_on", { date: formatDate(a.signed_at, lng) }) : t("bishop.agreements.not_signed")}
                      </td>
                      <td className="w-44 whitespace-nowrap px-4 py-3 text-right [&_button]:inline-flex [&_button]:items-center [&_button]:whitespace-nowrap">
                        {a.contract && a.contract.signers.some((x) => x.party === "bishop" && (x.status === "sent" || x.status === "opened")) ? (
                          <button onClick={() => setSigning(a.contract!)} className={primaryButton}>{t("bishop.agreements.sign")}</button>
                        ) : a.contract && a.contract.signers.some((x) => x.signed_at) ? (
                          <button onClick={() => setViewing(a.contract!)} aria-label={t("bishop.agreements.open_document_for", { name: a.name })} className={secondaryButton}>
                            <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.agreements.open_document")}
                          </button>
                        ) : a.has_file ? (
                          // The mock has no real file: it only says that the document would download.
                          <button
                            onClick={() => toast.info(t("bishop.agreements.t_download", { file: a.file_name ?? a.name }))}
                            aria-label={t("bishop.agreements.open_document_for", { name: a.name })}
                            className={secondaryButton}
                          >
                            <FileText className="mr-1.5 h-3.5 w-3.5" />{t("bishop.agreements.open_document")}
                          </button>
                        ) : (
                          // A disabled button gets no hover events, so the tooltip hangs from a focusable wrapper.
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
                        )}
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
