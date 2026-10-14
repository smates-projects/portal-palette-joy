import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useContracts, useDocuments, useUploadDocument } from "@/lib/api/hooks";
import type { BusinessDocument, ContractState, DocumentState } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, secondaryButtonCls, ToneBadge, type Tone } from "../shared";

const CONTRACT_TONE: Record<ContractState, Tone> = {
  draft: "neutral",
  sent: "info",
  opened: "review",
  signed: "success",
  declined: "danger",
};
const DOCUMENT_TONE: Record<DocumentState, Tone> = { requested: "warning", received: "review", reviewed: "success" };

/** Documents SM asked for (upload them here), the ones already received, and the contracts with their signature status. */
export function OwnerDocumentsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const documentsQ = useDocuments();
  const contractsQ = useContracts();
  const upload = useUploadDocument();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const documents = documentsQ.data ?? [];
  const contracts = contractsQ.data ?? [];
  const requested = documents.filter((d) => d.state === "requested");
  const received = documents.filter((d) => d.state !== "requested");

  const areaLabel = (area: BusinessDocument["area"]) => (area === "diagnosis" || area === "closing" ? t(`owner_extra.documents.area_${area}`) : t(`areas.${area}`));

  const pick = (documentId: string) => {
    setUploadingId(documentId);
    fileInput.current?.click();
  };
  const onFile = (file: File | undefined) => {
    const documentId = uploadingId;
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !documentId) return setUploadingId(null);
    upload.mutate(
      { documentId, fileName: file.name },
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
          <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />

          <Panel title={t("owner_extra.documents.requested_title")} aside={t("owner_extra.documents.count", { count: requested.length })}>
            {requested.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.documents.requested_empty")}</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {requested.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {areaLabel(d.area)} · {t("owner_extra.documents.asked_on", { date: formatDate(d.requested_at, lng) })}
                      </p>
                    </div>
                    <button className={secondaryButtonCls} disabled={upload.isPending} onClick={() => pick(d.id)}>
                      <Upload className="h-4 w-4" />
                      {uploadingId === d.id && upload.isPending ? t("owner_extra.documents.uploading") : t("owner_extra.documents.upload")}
                    </button>
                  </li>
                ))}
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
                      <ToneBadge tone={CONTRACT_TONE[c.state]}>{t(`owner_extra.documents.contract_${c.state}`)}</ToneBadge>
                    </div>
                    {c.signers.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {c.signers.map((s) => (
                          <li key={`${s.name}-${s.role}`}>
                            {s.name} ({s.role}):{" "}
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
    </div>
  );
}
