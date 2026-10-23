import { useState } from "react";
import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDeleteMySignature, useMySignature, useSaveMySignature } from "@/lib/api/hooks";
import type { ContractSignature } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad } from "@/components/docuseal/SignaturePad";

const secondaryBtn =
  "h-8 rounded-[4px] border border-border px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50";
const primaryBtn =
  "h-8 rounded-[4px] bg-primary px-3 font-display text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";

const errorCode = (e: unknown) => (e instanceof Error ? ((e as Error & { code?: string }).code ?? e.message) : "");

/**
 * Mi perfil: "Mi firma". The saved signature (GET /me/signature) with "Cambiar" and "Eliminar"; draw or upload a new
 * one. Hidden while viewing as someone (the API answers 403).
 */
export function MySignatureSection() {
  const { t, i18n } = useTranslation();
  const q = useMySignature();
  const save = useSaveMySignature();
  const remove = useDeleteMySignature();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<ContractSignature | null>(null);

  if (q.isError && errorCode(q.error) === "forbidden") return null;
  const saved = q.data ?? null;

  const onSave = () => {
    if (!draft || (draft.kind !== "drawn" && draft.kind !== "uploaded")) return;
    save.mutate({ kind: draft.kind, image_url: draft.image_url }, {
      onSuccess: () => { setEditing(false); setDraft(null); toast.success(t("profile.signature.t_saved")); },
      onError: () => toast.error(t("profile.signature.t_error")),
    });
  };
  const onDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => { setConfirming(false); toast.success(t("profile.signature.t_deleted")); },
      onError: () => toast.error(t("profile.signature.t_error")),
    });

  return (
    <section className="rounded-md border border-border bg-surface px-5 py-4">
      <div className="flex items-start gap-3">
        <PenLine aria-hidden className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("profile.signature.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("profile.signature.hint")}</p>

          {q.isLoading ? (
            <Skeleton className="mt-3 h-16 w-64" />
          ) : q.isError ? (
            <div className="mt-3 text-sm">
              <p>{t("profile.signature.load_error")}</p>
              <button onClick={() => void q.refetch()} className="mt-1 text-link hover:underline">{t("profile.retry")}</button>
            </div>
          ) : editing || !saved ? (
            !editing ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">{t("profile.signature.empty")}</p>
                <button className={primaryBtn} onClick={() => setEditing(true)}>{t("profile.signature.add")}</button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <SignaturePad signerName="" allowTyped={false} onChange={setDraft} />
                <div className="flex justify-end gap-2">
                  <button className={secondaryBtn} onClick={() => { setEditing(false); setDraft(null); }}>{t("profile.signature.cancel")}</button>
                  <button className={primaryBtn} onClick={onSave} disabled={!draft || save.isPending}>{t("profile.signature.save")}</button>
                </div>
              </div>
            )
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex h-20 max-w-xs items-center rounded-[4px] border border-border bg-surface px-3">
                <img src={saved.image_url} alt={t("profile.signature.alt")} className="max-h-16 max-w-full object-contain object-left" />
              </div>
              <p className="text-xs text-muted-foreground">{t("profile.signature.updated", { date: formatDate(saved.updated_at, i18n.language) })}</p>
              {confirming ? (
                <div role="alert" className="space-y-2 rounded-[4px] border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
                  <p>{t("profile.signature.confirm_delete")}</p>
                  <div className="flex gap-2">
                    <button className={secondaryBtn} onClick={() => setConfirming(false)}>{t("profile.signature.cancel")}</button>
                    <button className={primaryBtn} onClick={onDelete} disabled={remove.isPending}>{t("profile.signature.delete_confirm")}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className={secondaryBtn} onClick={() => setEditing(true)}>{t("profile.signature.change")}</button>
                  <button className={secondaryBtn} onClick={() => setConfirming(true)}>{t("profile.signature.delete")}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
