import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useContracts, useCurrentUser, useDocuments, useMarkNotApplicable, useRules, useUploadDocument } from "@/lib/api/hooks";
import { TextDialog } from "@/components/pipeline/IntakeChecklist";
import { INTAKE_DOCUMENT_ACCEPT, entryRules, intakeDocumentHelp, oaWaitingUntil } from "@/lib/leads/entry-flow";
import { smEntitiesOf } from "@/lib/leads/contract-rules";
import { DocumentHelp } from "@/components/pipeline/DocumentHelp";
import { ReviewNoteAlert } from "@/components/pipeline/ReviewNoteAlert";
import type { Contract } from "@/lib/api/types";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import type { BusinessDocument, ContractState, DocumentState } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, secondaryButtonCls, ToneBadge, type Tone } from "../shared";

const CONTRACT_TONE: Record<ContractState, Tone> = {
  draft: "neutral",
  sent: "info",
  opened: "info",
  signed: "success",
  declined: "danger",
};
const DOCUMENT_TONE: Record<DocumentState, Tone> = { requested: "warning", received: "info", reviewed: "success", rejected: "warning", not_applicable: "info" };

/** Documents SM asked for (upload them here), the ones already received, and the contracts with their signature status. */
export function OwnerDocumentsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const documentsQ = useDocuments();
  const contractsQ = useContracts();
  const upload = useUploadDocument();
  const markNotApplicable = useMarkNotApplicable();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // "No aplica": the document whose reason is being written.
  const [notApplicableFor, setNotApplicableFor] = useState<BusinessDocument | null>(null);

  const documents = documentsQ.data ?? [];
  const contracts = contractsQ.data ?? [];
  const me = useCurrentUser().data;
  const [signing, setSigning] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  // Documents asked again go first, with the Strategic Mates comment.
  const requested = [...documents.filter((d) => d.state === "rejected"), ...documents.filter((d) => d.state === "requested")];
  const received = documents.filter((d) => d.state !== "requested" && d.state !== "rejected");
  // Entry documents unlock once the owner signed the MOU (locked_until_mou on each one).
  const locked = requested.some((d) => d.area === "intake" && d.locked_until_mou);
  const rulesData = useRules().data;
  const rules = entryRules(rulesData);
  const entities = smEntitiesOf(rulesData);
  const helpText = rulesData?.intake_help_text?.trim() ?? "";
  const hasIntake = documents.some((d) => d.area === "intake");
  /** The MOU is signed from "Tu ingreso" (the four points first); the Operating Agreement only after its waiting period. */
  const signableHere = (c: Contract) =>
    c.kind !== "mou" && !(c.kind === "tripartite" && oaWaitingUntil(c, rules.oa_waiting_days));

  const areaLabel = (area: BusinessDocument["area"]) => (area === "diagnosis" || area === "closing" || area === "intake" ? t(`owner_extra.documents.area_${area}`) : t(`areas.${area}`));

  const pick = (documentId: string) => {
    setUploadingId(documentId);
    fileInput.current?.click();
  };
  const onFile = (file: File | undefined) => {
    const documentId = uploadingId;
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !documentId) return setUploadingId(null);
    upload.mutate(
      { documentId, file },
      {
        onSuccess: () => toast.success(t("owner_extra.documents.t_uploaded", { name: file.name })),
        onError: () => toast.error(t("owner_extra.common.t_error")),
        onSettled: () => setUploadingId(null),
      },
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.documents.question")} />

      {documentsQ.isError || contractsQ.isError ? (
        <ErrorState onRetry={() => { void documentsQ.refetch(); void contractsQ.refetch(); }} />
      ) : documentsQ.isLoading || contractsQ.isLoading ? (
        <LoadingState rows={3} />
      ) : documents.length === 0 && contracts.length === 0 ? (
        <EmptyState title={t("owner_extra.documents.empty_title")} hint={t("owner_extra.documents.empty_hint")} />
      ) : (
        <div className="mt-6 space-y-4">
          {/* PDF, photos (PNG, JPG) and Word / Excel: what the API takes for entry documents. */}
          <input ref={fileInput} type="file" accept={INTAKE_DOCUMENT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />

          {hasIntake && helpText && (
            <p className="whitespace-pre-line rounded-[4px] border border-border bg-surface px-4 py-3 text-sm">{helpText}</p>
          )}

          <Panel title={t("owner_extra.documents.requested_title")} aside={t("owner_extra.documents.count", { count: requested.length })}>
            {locked && (
              <p className="border-t border-border bg-muted px-4 py-2 text-sm">{t("intake.owner_docs.locked")}</p>
            )}
            {requested.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.documents.requested_empty")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {requested.map((d) => {
                  const help = intakeDocumentHelp(d, rulesData);
                  return (
                  <li key={d.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {areaLabel(d.area)} · {t("owner_extra.documents.asked_on", { date: formatDate(d.requested_at, lng) })}
                      </p>
                      {d.state === "rejected" && d.review_comment && <ReviewNoteAlert comment={d.review_comment} className="mt-2" />}
                      {help && <DocumentHelp help={help} className="mt-2" />}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button className={secondaryButtonCls} disabled={upload.isPending || !!d.locked_until_mou} onClick={() => pick(d.id)}>
                        <Upload className="h-4 w-4" />
                        {uploadingId === d.id && upload.isPending ? t("owner_extra.documents.uploading") : d.state === "rejected" ? t("intake.owner_docs.upload_new") : t("owner_extra.documents.upload")}
                      </button>
                      {/* The document does not apply to this business: say why and SM decides. */}
                      <button className={secondaryButtonCls} disabled={markNotApplicable.isPending || !!d.locked_until_mou} onClick={() => setNotApplicableFor(d)}>
                        {t("owner_extra.documents.not_applicable")}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title={t("owner_extra.documents.received_title")} aside={t("owner_extra.documents.count", { count: received.length })}>
            {received.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.documents.received_empty")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {received.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {areaLabel(d.area)}
                        {d.file_name ? ` · ${d.file_name}` : ""}
                        {d.received_at ? ` · ${t("owner_extra.documents.received_on", { date: formatDate(d.received_at, lng) })}` : ""}
                      </p>
                      {d.state === "not_applicable" && d.not_applicable_reason && (
                        <p className="mt-1 text-xs text-muted-foreground">{t("owner_extra.documents.not_applicable_reason", { reason: d.not_applicable_reason })}</p>
                      )}
                    </div>
                    <ToneBadge tone={DOCUMENT_TONE[d.state]}>{t(`owner_extra.documents.state_${d.state}`)}</ToneBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("owner_extra.documents.contracts_title")} aside={t("owner_extra.documents.count", { count: contracts.length })}>
            {contracts.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.documents.contracts_empty")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {contracts.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {areaLabel(c.area)}
                          {c.signed_at
                            ? ` · ${t("owner_extra.documents.signed_on", { date: formatDate(c.signed_at, lng) })}`
                            : c.sent_at
                              ? ` · ${t("owner_extra.documents.sent_on", { date: formatDate(c.sent_at, lng) })}`
                              : ""}
                        </p>
                      </div>
                      {c.signers.some((x) => x.party === "owner" && (x.status === "sent" || x.status === "opened")) && (
                        signableHere(c)
                          ? <button className={secondaryButtonCls} onClick={() => setSigning(c)}>{t("intake.owner_docs.sign")}</button>
                          : <Link to="/" className={secondaryButtonCls}>{t("intake.owner_docs.go_home")}</Link>
                      )}
                      {c.signers.some((x) => x.signed_at) && (
                        <button className={secondaryButtonCls} onClick={() => setViewing(c)}><FileText className="h-4 w-4" />{t("intake.docuseal.view_signed")}</button>
                      )}
                      <ToneBadge tone={CONTRACT_TONE[c.state]}>{t(`owner_extra.documents.contract_${c.state}`)}</ToneBadge>
                    </div>
                    {c.signers.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {c.signers.map((s) => (
                          <li key={`${s.name}-${s.role}`}>
                            {/* The SM part reads "Firmado por Marilyn Boraei en nombre de Strategic Mates Corporate". */}
                            {s.party === "sm" && s.signed_at && s.user_id ? t("intake.signed_on_behalf_by", { name: s.name, entity: entities[s.sm_entity ?? "corporate"].name }) : `${s.name} (${s.party ? t(`intake.party.${s.party}`) : s.role})`},{" "}
                            <span className={s.signed_at ? "text-status-success-fg" : undefined}>
                              {s.signed_at ? t("owner_extra.documents.signer_signed", { date: formatDate(s.signed_at, lng) }) : t("owner_extra.documents.signer_pending")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
      {signing && <DocuSealSigner contract={signing} party="owner" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      {viewing && <SignedContractDialog contract={viewing} onClose={() => setViewing(null)} />}
      {notApplicableFor && (
        <TextDialog
          title={t("owner_extra.documents.not_applicable_title", { name: notApplicableFor.name })}
          body={t("owner_extra.documents.not_applicable_body")}
          label={t("owner_extra.documents.not_applicable_label")}
          placeholder={t("owner_extra.documents.not_applicable_placeholder")}
          confirm={t("owner_extra.documents.not_applicable_confirm")}
          required={t("owner_extra.documents.not_applicable_required")}
          pending={markNotApplicable.isPending}
          onClose={() => setNotApplicableFor(null)}
          onConfirm={(reason) =>
            markNotApplicable.mutate({ documentId: notApplicableFor.id, reason }, {
              onSuccess: () => { setNotApplicableFor(null); toast.success(t("owner_extra.documents.t_not_applicable", { name: notApplicableFor.name })); },
              onError: () => toast.error(t("owner_extra.common.t_error")),
            })
          }
        />
      )}
    </div>
  );
}
