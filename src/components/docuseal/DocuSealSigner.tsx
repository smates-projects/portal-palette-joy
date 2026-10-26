import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { useContractSigningPoll, useCurrentUser, useDeclineContract, useEsignConsent, useMySignature, useOpenContract, useRefreshSigning, useSignContract } from "@/lib/api/hooks";
import { MOU_ACKNOWLEDGMENT_POINTS, type Contract, type ContractLanguage, type ContractSignature } from "@/lib/api/types";
import { contractTextIn } from "@/lib/contracts/language";
import { formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { cn } from "@/lib/utils";
import { ContractText, SignatureMark } from "./ContractDocument";
import { DocusealEmbed } from "./DocusealEmbed";
import { EsignConsentPanel } from "./EsignConsentPanel";
import { SealedCopyLinks } from "./SealedCopies";
import { SignaturePad } from "./SignaturePad";
import { ContractFallbackNote, ContractGoverningNote, ContractLanguageToggle, useContractLanguage } from "./ContractLanguage";

/** How long the dialog waits for the worker to create the DocuSeal submission (3 s each, about a minute). */
const PREPARING_RETRY_MS = 3000;
const PREPARING_MAX_TRIES = 20;

const codeOf = (e: unknown) => (e instanceof Error ? ((e as Error & { code?: string }).code ?? e.message) : "");

/**
 * Signing a contract. With the API's DocuSeal driver (real signatures): the person accepts the electronic records
 * disclosure once (EsignConsentPanel), opening the contract answers the signer's own form (signing.embed_src) and the
 * dialog mounts DocuSeal's official form (DocusealEmbed) with the two documents, Spanish and English, signed once. The
 * signature reaches the API only from DocuSeal (its webhook, or the API asking DocuSeal through sync): the dialog asks
 * for that sync every few seconds and closes once the signer's status changed. Otherwise (the mock, the API's
 * simulated driver) it is the portal's own screen, labelled as a test signature with no legal value, and every change
 * goes through the repository (openContract, signContract, declineContract).
 */
export function DocuSealSigner(props: { contract: Contract; party: "owner" | "sm" | "bishop"; signerName: string; language?: ContractLanguage; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const open = useOpenContract();
  const sign = useSignContract();
  const decline = useDeclineContract();
  const refresh = useRefreshSigning();
  const user = useCurrentUser().data;
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const opened = useRef(false);
  const me = props.contract.signers.find((s) => s.party === props.party);
  const [signed, setSigned] = useState(me?.status === "signed");
  const [signature, setSignature] = useState<ContractSignature | null>(null);
  const [missing, setMissing] = useState(false);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  // Who signs: known once the contract was opened (the mock answers no session: the portal's own test screen).
  const [provider, setProvider] = useState<"simulated" | "docuseal" | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const tries = useRef(0);
  const retry = useRef<number | null>(null);
  // "Mi firma": with a saved signature the main action signs with it; "Usar otra firma" opens the pad.
  const savedQ = useMySignature();
  const saved = savedQ.data ?? null;
  const [useOther, setUseOther] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saveNew, setSaveNew] = useState(false);
  const withSaved = !!saved && !useOther;
  const shown = signed ? (me?.signature ?? signature) : null;
  const others = props.contract.signers.filter((s) => s.party !== props.party).map((s) => s.name);
  // The text in the language of the reader's "ES | EN" toggle (Spanish when the English one is missing).
  const [language, setLanguage] = useContractLanguage(props.language);
  const reading = contractTextIn(props.contract, language);
  const body = reading.value;
  // The electronic records disclosure: required before a real signing form opens.
  const esignQ = useEsignConsent();
  const esign = esignQ.data;
  const needsConsent = !!esign && esign.required && !esign.accepted;
  const canOpen = me?.status === "sent" || me?.status === "opened";

  /** The API's reasons a signature waits: the four MOU points, the Operating Agreement's waiting period. */
  const fail = useCallback((e?: unknown) => {
    const code = codeOf(e);
    const detail = e instanceof Error ? (e as Error & { detail?: string | null }).detail ?? "" : "";
    if (code === "signature_not_saved") { setUseOther(true); void savedQ.refetch(); toast.error(t("intake.docuseal.saved_missing")); }
    // The number of points this MOU has (the API's list), not a written "four" (QA B4).
    else if (code === "acknowledgment_required") toast.error(t(`entry.errors.${code}`, { count: props.contract.acknowledgment_points?.es.length || MOU_ACKNOWLEDGMENT_POINTS.length }));
    else if (code === "waiting_period") toast.error(t("entry.errors.waiting_period", { date: /^\d{4}-\d{2}-\d{2}/.test(detail) ? formatDate(detail, i18n.language) : detail }));
    else toast.error(t("intake.docuseal.t_error"));
  }, [i18n.language, props.contract.acknowledgment_points, savedQ, t]);

  // DocuSeal reports "viewed" when the signer opens it. A signer who already opened it opens again to get the embed
  // back. With DocuSeal the worker creates the submission a few seconds after the contract goes out: until then the
  // embed is null and the dialog asks again.
  const openContract = useCallback(() => {
    open.mutate(props.contract.id, {
      onSuccess: (answer) => {
        const signing = answer.signing;
        setProvider(signing?.provider ?? "simulated");
        if (signing?.provider !== "docuseal") return;
        if (signing.embed_src) {
          setPreparing(false);
          setEmbedSrc(signing.embed_src);
        } else if (tries.current++ < PREPARING_MAX_TRIES) {
          setPreparing(true);
          retry.current = window.setTimeout(() => openContract(), PREPARING_RETRY_MS);
        } else {
          setPreparing(false);
          toast.error(t("intake.docuseal.t_error"));
        }
      },
      onError: (e) => {
        // The disclosure changed or was withdrawn meanwhile: show it again.
        if (codeOf(e) === "esign_consent_required") {
          opened.current = false;
          void esignQ.refetch();
          return;
        }
        fail(e);
      },
    });
  }, [esignQ, fail, open, props.contract.id, t]);

  useEffect(() => {
    if (opened.current || !canOpen || !esign || needsConsent) return;
    opened.current = true;
    openContract();
  }, [canOpen, esign, needsConsent, openContract]);
  useEffect(() => () => { if (retry.current !== null) window.clearTimeout(retry.current); }, []);

  // While the embed is open: ask the API (which asks DocuSeal) and close once the signer signed or declined.
  const poll = useContractSigningPoll(props.contract.id, embedSrc !== null);
  const polledStatus = poll.data?.signers.find((s) => s.party === props.party)?.status;
  const { onClose } = props;
  const contractName = props.contract.name;
  useEffect(() => {
    if (!embedSrc || (polledStatus !== "signed" && polledStatus !== "declined")) return;
    setEmbedSrc(null);
    void refresh();
    toast.success(t(polledStatus === "signed" ? "intake.docuseal.t_signed" : "intake.docuseal.t_declined", { name: contractName }));
    onClose();
  }, [embedSrc, polledStatus, refresh, t, contractName, onClose]);
  // DocuSeal's form says it finished: ask right away instead of waiting for the next poll.
  const embedFinished = useCallback(() => {
    setFinishing(true);
    void poll.refetch();
  }, [poll]);

  const doSign = () => {
    if (withSaved) {
      if (!consent) return setMissing(true);
      return sign.mutate({ contractId: props.contract.id, options: { use_saved_signature: true } }, {
        onSuccess: () => { setSigned(true); toast.success(t("intake.docuseal.t_signed", { name: props.contract.name })); },
        onError: fail,
      });
    }
    if (!signature) return setMissing(true);
    const canSave = saveNew && (signature.kind === "drawn" || signature.kind === "uploaded");
    sign.mutate({ contractId: props.contract.id, signature, options: canSave ? { save_signature: true } : undefined }, {
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

  // Never "DocuSeal" unless DocuSeal really signs it; the portal's own screen says it is a test signature.
  const header = provider === "docuseal" ? t("intake.docuseal.header") : provider === "simulated" ? t("intake.docuseal.header_test") : t("intake.docuseal.header_neutral");
  const wide = needsConsent || embedSrc !== null || (!!body && !preparing);

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className={cn("max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto bg-surface p-4 sm:p-6", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{header}</p>
          <DialogTitle>{props.contract.name}</DialogTitle>
          <DialogDescription>{t("intake.docuseal.signing_as", { name: props.signerName })}</DialogDescription>
        </DialogHeader>
        {provider === "simulated" && (
          <p role="note" className="rounded-[4px] border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg">
            {t("intake.docuseal.test_notice")}
          </p>
        )}

        {needsConsent && esign ? (
          <EsignConsentPanel consent={esign} onAccepted={() => { opened.current = false; }} />
        ) : preparing ? (
          <p className="text-sm text-muted-foreground" role="status">{t("intake.docuseal.preparing")}</p>
        ) : embedSrc ? (
          <div className="space-y-3">
            {/* DocuSeal's own form for this signer: it collects the signature; the API hears it from DocuSeal. */}
            <div className="overflow-hidden rounded-[4px] border border-border bg-surface">
              <DocusealEmbed
                src={embedSrc}
                email={user?.email}
                language={i18n.language.toLowerCase().startsWith("en") ? "en" : "es"}
                title={t("intake.docuseal.embed_title", { name: props.contract.name })}
                onCompleted={embedFinished}
                onDeclined={embedFinished}
              />
            </div>
            <p className="text-xs text-muted-foreground" role="status">{t(finishing ? "intake.docuseal.finishing" : "intake.docuseal.embed_hint")}</p>
            <div className="flex justify-end">
              <SecondaryButton onClick={props.onClose}>{t("intake.docuseal.close")}</SecondaryButton>
            </div>
          </div>
        ) : (<>
        {/* The contract's full text (scrollable) with the signature field below; a sample only when it has no text.
            Once signed it shows the signature itself. */}
        {body && <ContractGoverningNote contract={props.contract} />}
        <div className="rounded-md border border-border bg-muted/50 p-2 sm:p-4">
          <div className={cn("mx-auto rounded-md border border-border bg-surface p-5 text-xs leading-relaxed text-muted-foreground sm:p-6", body ? "max-w-none" : "max-w-sm")}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{props.contract.name}</p>
              {body && <ContractLanguageToggle value={language} onChange={setLanguage} />}
            </div>
            <ContractFallbackNote show={reading.fallback} className="mt-1" />
            {body ? (
              <div className="mt-3 max-h-[40vh] overflow-y-auto border-b border-border pb-3 pr-2 text-[13px]" tabIndex={0} aria-label={t("intake.docuseal.text_label", { name: props.contract.name })}>
                <ContractText body={body} lang={reading.language} />
              </div>
            ) : (<>
              <p className="mt-1 text-[11px] uppercase tracking-wide">{t("intake.docuseal.sample")}</p>
              <p className="mt-3">{t("intake.docuseal.pdf_line", { a: props.signerName, b: others.join(", ") })}</p>
              <div className="mt-3 space-y-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-1.5 rounded bg-muted" style={{ width: `${90 - i * 12}%` }} />)}</div>
            </>)}
            {signed ? (
              <div className="mt-5 rounded-[4px] border border-status-success-border bg-status-success-bg px-3 py-2 text-status-success-fg">
                {shown ? <SignatureMark signature={shown} signerName={props.signerName} /> : null}
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium"><PenLine className="h-3 w-3" />{props.signerName}{me?.signed_at ? ` · ${me.signed_at}` : ""}</span>
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex h-14 items-end rounded-t-[4px] border-2 border-b-0 border-dashed border-gold bg-gold/10 px-3 pb-1 text-foreground">
                  {withSaved ? <img src={saved.image_url} alt={t("intake.docuseal.saved_alt")} className="h-12 max-w-full object-contain object-left" /> : signature ? <img src={signature.image_url} alt="" className="h-12 max-w-full object-contain object-left" /> : <span className="inline-flex items-center gap-1.5 pb-1 font-medium"><PenLine className="h-3.5 w-3.5" />{t("intake.docuseal.field")}</span>}
                </div>
                <div className="border-t border-foreground/60 pt-1 text-[11px] text-foreground">{props.signerName}</div>
              </div>
            )}
          </div>
        </div>

        {signed ? (
          <div className="space-y-3">
            <p className="text-sm">{t("intake.docuseal.signed_done")}</p>
            {/* The real sealed copies once every party signed; never a made-up file before. */}
            {props.contract.sealed_files ? <SealedCopyLinks contract={props.contract} /> : <p className="text-xs text-muted-foreground">{t("intake.docuseal.copies_pending")}</p>}
            <div className="flex justify-end gap-2">
              <PrimaryButton onClick={props.onClose}>{t("intake.docuseal.close")}</PrimaryButton>
            </div>
          </div>
        ) : provider === "docuseal" ? (
          // DocuSeal signs (the embed is gone: someone else's turn, or the contract no longer takes signatures).
          <div className="flex justify-end">
            <SecondaryButton onClick={props.onClose}>{t("intake.docuseal.close")}</SecondaryButton>
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
        ) : withSaved ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (e.target.checked) setMissing(false); }} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>{t("intake.docuseal.saved_consent")}</span>
            </label>
            {missing && !consent && <p className="text-xs text-status-danger-fg">{t("intake.docuseal.consent_required")}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-4">
                <button onClick={() => setDeclining(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("intake.docuseal.decline")}</button>
                <button onClick={() => { setUseOther(true); setMissing(false); }} className="text-sm text-link hover:underline">{t("intake.docuseal.use_other")}</button>
              </div>
              <PrimaryButton onClick={doSign} disabled={sign.isPending || !consent}>{t("intake.docuseal.sign_saved")}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad signerName={props.signerName} onChange={(s) => { setSignature(s); if (s) setMissing(false); }} />
            {missing && !signature && <p className="text-xs text-status-danger-fg">{t("intake.docuseal.sig_required")}</p>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>{t("intake.docuseal.save_for_next")}</span>
            </label>
            <p className="text-xs text-muted-foreground">{t("intake.docuseal.sig_consent")}</p>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-4">
                <button onClick={() => setDeclining(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("intake.docuseal.decline")}</button>
                {saved && <button onClick={() => { setUseOther(false); setMissing(false); }} className="text-sm text-link hover:underline">{t("intake.docuseal.use_saved")}</button>}
              </div>
              <PrimaryButton onClick={doSign} disabled={sign.isPending}>{t("intake.docuseal.sign")}</PrimaryButton>
            </div>
          </div>
        )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}
