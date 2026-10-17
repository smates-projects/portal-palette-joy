import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, PenLine } from "lucide-react";
import { useDeclineContract, useOpenContract, useSignContract } from "@/lib/api/hooks";
import type { Contract, ContractSignature } from "@/lib/api/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { SignaturePad } from "./SignaturePad";

/**
 * Simulated DocuSeal signing. Every change goes through the repository (openContract, signContract,
 * declineContract), so the real DocuSeal embed can replace this component without touching the rest.
 */
export function DocuSealSigner(props: { contract: Contract; party: "owner" | "sm" | "bishop"; signerName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const open = useOpenContract();
  const sign = useSignContract();
  const decline = useDeclineContract();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const opened = useRef(false);
  const me = props.contract.signers.find((s) => s.party === props.party);
  const [signed, setSigned] = useState(me?.status === "signed");
  const [signature, setSignature] = useState<ContractSignature | null>(null);
  const [missing, setMissing] = useState(false);
  const shown = signed ? (me?.signature ?? signature) : null;
  const others = props.contract.signers.filter((s) => s.party !== props.party).map((s) => s.name);

  useEffect(() => {
    // DocuSeal reports "viewed" when the signer opens the document.
    if (!opened.current && me?.status === "sent") { opened.current = true; open.mutate(props.contract.id); }
  }, [me?.status, open, props.contract.id]);

  const fail = () => toast.error(t("intake.docuseal.t_error"));
  const doSign = () => {
    if (!signature) return setMissing(true);
    sign.mutate({ contractId: props.contract.id, signature }, {
      onSuccess: () => { setSigned(true); toast.success(t("intake.docuseal.t_signed", { name: props.contract.name })); },
      onError: fail,
    });
  };
  const doDecline = () => {
    setTried(true);
    if (!reason.trim()) return;
    decline.mutate({ contractId: props.contract.id, reason: reason.trim() }, {
      onSuccess: () => { toast.success(t("intake.docuseal.t_declined", { name: props.contract.name })); props.onClose(); },
      onError: fail,
    });
  };
  const download = () => {
    const blob = new Blob([`${props.contract.name}\n${t("intake.docuseal.sample")}\n${props.signerName}`], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.contract.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto bg-surface p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("intake.docuseal.header")}</p>
          <DialogTitle>{props.contract.name}</DialogTitle>
          <DialogDescription>{t("intake.docuseal.signing_as", { name: props.signerName })}</DialogDescription>
        </DialogHeader>

        {/* Sample PDF with the signature field highlighted; once signed it shows the signature itself */}
        <div className="rounded-md border border-border bg-muted/50 p-4">
          <div className="mx-auto max-w-sm rounded-md border border-border bg-surface p-5 text-xs leading-relaxed text-muted-foreground sm:p-6">
            <p className="text-sm font-semibold text-foreground">{props.contract.name}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide">{t("intake.docuseal.sample")}</p>
            <p className="mt-3">{t("intake.docuseal.pdf_line", { a: props.signerName, b: others.join(", ") })}</p>
            <div className="mt-3 space-y-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-1.5 rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />)}</div>
            {signed ? (
              <div className="mt-5 rounded-[4px] border border-status-success-border bg-status-success-bg px-3 py-2 text-status-success-fg">
                {shown ? <img src={shown.image_url} alt={props.signerName} className="h-12 max-w-full object-contain object-left" /> : null}
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium"><PenLine className="h-3 w-3" />{props.signerName}{me?.signed_at ? ` · ${me.signed_at}` : ""}</span>
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex h-14 items-end rounded-t-[4px] border-2 border-b-0 border-dashed border-gold bg-gold/10 px-3 pb-1 text-foreground">
                  {signature ? <img src={signature.image_url} alt="" className="h-12 max-w-full object-contain object-left" /> : <span className="inline-flex items-center gap-1.5 pb-1 font-medium"><PenLine className="h-3.5 w-3.5" />{t("intake.docuseal.field")}</span>}
                </div>
                <div className="border-t border-foreground/60 pt-1 text-[11px] text-foreground">{props.signerName}</div>
              </div>
            )}
          </div>
        </div>

        {signed ? (
          <div className="space-y-3">
            <p className="text-sm">{t("intake.docuseal.signed_done")}</p>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={download}><Download className="mr-1.5 h-4 w-4" />{t("intake.docuseal.download")}</SecondaryButton>
              <PrimaryButton onClick={props.onClose}>{t("intake.docuseal.close")}</PrimaryButton>
            </div>
          </div>
        ) : declining ? (
          <div className="space-y-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("intake.docuseal.decline_label")}</span>
              <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
            </label>
            {tried && !reason.trim() && <p className="text-xs text-status-danger-fg">{t("intake.docuseal.reason_required")}</p>}
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setDeclining(false)}>{t("intake.cancel")}</SecondaryButton>
              <PrimaryButton onClick={doDecline} disabled={decline.isPending}>{t("intake.docuseal.decline_confirm")}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad signerName={props.signerName} onChange={(s) => { setSignature(s); if (s) setMissing(false); }} />
            {missing && !signature && <p className="text-xs text-status-danger-fg">{t("intake.docuseal.sig_required")}</p>}
            <p className="text-xs text-muted-foreground">{t("intake.docuseal.sig_consent")}</p>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={() => setDeclining(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("intake.docuseal.decline")}</button>
              <PrimaryButton onClick={doSign} disabled={sign.isPending}>{t("intake.docuseal.sign")}</PrimaryButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
