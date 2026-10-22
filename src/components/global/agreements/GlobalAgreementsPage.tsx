import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { useCurrentUser, useFrameworkAgreements } from "@/lib/api/hooks";
import type { Contract } from "@/lib/api/types";
import { pendingPartyNames } from "@/lib/contracts/parties";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { SealedCopyLinks } from "@/components/docuseal/SealedCopies";
import { primaryBtn, secondaryBtn } from "@/components/accounts/shared";
import { EmptyBox, ErrorBox, GlobalHeader, ListSkeleton } from "../shared";

const TONE = {
  signed: "border-status-success-border bg-status-success-bg text-status-success-fg",
  pending: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
} as const;

/**
 * Acuerdos (SM Global): every Bishop's framework agreement (created when the Bishop is invited). Corporate's CEO
 * countersigns it here with "Firmar como Strategic Mates"; a Bishop cannot be presented a business until both signed.
 */
export function GlobalAgreementsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useFrameworkAgreements();
  const me = useCurrentUser().data;
  const [signing, setSigning] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const header = <GlobalHeader question={t("global.agreements.question")} />;

  if (q.isError) return <div className="mx-auto max-w-7xl px-6 py-8">{header}<div className="mt-6"><ErrorBox onRetry={() => void q.refetch()} /></div></div>;
  if (q.isLoading || !q.data) return <div className="mx-auto max-w-7xl px-6 py-8">{header}<div className="mt-6"><ListSkeleton rows={3} /></div></div>;
  const rows = q.data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {header}
      <p className="mt-2 text-sm text-muted-foreground">{t("global.agreements.hint")}</p>
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyBox title={t("global.agreements.empty_title")} body={t("global.agreements.empty_body")} />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {rows.map((c) => {
              const bishop = c.signers.find((s) => s.party === "bishop");
              const sm = c.signers.find((s) => s.party === "sm");
              const pending = pendingPartyNames(c);
              const done = c.state === "signed" || pending.length === 0;
              return (
                <li key={c.id} className="flex flex-col gap-3 px-4 py-3 text-sm md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{bishop?.name ?? c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.name}{c.sent_at ? ` · ${t("global.agreements.sent_on", { date: formatDate(c.sent_at, lng) })}` : ""}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      <li>{t("global.agreements.bishop_part", { name: bishop?.name ?? "" })}, {t(`intake.signer_status.${bishop?.status ?? "sent"}`)}{bishop?.signed_at ? ` · ${formatDate(bishop.signed_at, lng)}` : ""}</li>
                      <li>{sm?.status === "signed" && sm.user_id ? t("intake.signed_on_behalf_by", { name: sm.name, entity: t("global.agreements.corporate") }) : `${t("global.agreements.corporate")}, ${t(`intake.signer_status.${sm?.status ?? "sent"}`)}`}</li>
                    </ul>
                  </div>
                  <span className={cn("inline-flex w-fit items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", done ? TONE.signed : TONE.pending)}>
                    {done ? t("global.agreements.state_signed") : t("global.agreements.state_pending", { parties: pending.join(", ") })}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.can_sign && <button className={primaryBtn} onClick={() => setSigning(c)}>{t("intake.sign_as_sm")}</button>}
                    {c.signers.some((s) => s.signed_at) && (
                      <button className={secondaryBtn} onClick={() => setViewing(c)}><FileText className="h-4 w-4" />{t("intake.docuseal.view_signed")}</button>
                    )}
                    <SealedCopyLinks contract={c} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {signing && <DocuSealSigner contract={signing} party="sm" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      {viewing && <SignedContractDialog contract={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
