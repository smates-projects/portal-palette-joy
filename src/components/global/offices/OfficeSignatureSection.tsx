import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useSetOfficeSignature } from "@/lib/api/hooks";
import type { UploadPhase } from "@/lib/api/repositories";
import type { Organization } from "@/lib/api/types";

/** Why the upload failed, in the person's words. The API's codes come as the error message. */
const errorKey = (e: unknown) => {
  const code = e instanceof Error ? e.message : "";
  if (code === "file_rejected" || code === "invalid_file" || code === "file_type_not_allowed") return "global.office.signature.error_rejected";
  if (code === "file_verification_timeout") return "global.office.signature.error_timeout";
  if (code === "upload_failed" || code === "network_error") return "global.office.signature.error_upload";
  return "global.t_error";
};

/**
 * "Firma de la oficina": the PNG the NDA and the MOU go out pre-signed with on behalf of Strategic Mates. The file is
 * uploaded, verified by the API ("Verificando el archivo") and only then attached; the saved name comes from the answer.
 * With `collapsed` (the signer already signs with a saved signature) it is one line and a link that opens the upload
 * as an optional backup.
 */
export function OfficeSignatureSection({
  office,
  title,
  hint,
  collapsed,
}: {
  office: Organization;
  title?: string;
  hint?: string;
  collapsed?: { line: string; expandLabel: string } | undefined;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const save = useSetOfficeSignature();
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // The office of the detail may be a few seconds behind the answer: the name just saved wins.
  const [saved, setSaved] = useState<Organization | null>(null);
  const current = saved?.id === office.id ? saved : office;
  const onFile = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!/\.png$/i.test(file.name)) {
      setError(t("global.office.signature.only_png"));
      return;
    }
    setError(null);
    setPhase("uploading");
    save.mutate({ officeId: office.id, file, onProgress: setPhase }, {
      onSuccess: (answer) => {
        setSaved(answer);
        toast.success(t("global.office.signature.t_saved", { name: office.name }));
      },
      onError: (e) => setError(t(errorKey(e))),
      onSettled: () => setPhase(null),
    });
  };
  if (collapsed && !expanded)
    return (
      <section className="mt-4 rounded-[4px] border border-border bg-surface px-4 py-3">
        <h2 className="text-sm font-semibold">{title ?? t("global.office.signature.title")}</h2>
        <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">{collapsed.line}</p>
          <button type="button" onClick={() => setExpanded(true)} className="text-xs text-link hover:underline">
            {collapsed.expandLabel}
          </button>
        </div>
      </section>
    );
  return (
    <section className="mt-4 rounded-[4px] border border-border bg-surface">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{title ?? t("global.office.signature.title")}</h2></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="min-w-0">
          <p>{current.signature_file_name ? t("global.office.signature.loaded", { file: current.signature_file_name }) : t("global.office.signature.none")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint ?? t("global.office.signature.hint")}</p>
          {phase && (
            <p role="status" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t(`global.office.signature.phase_${phase}`)}
            </p>
          )}
          {error && !phase && <p role="alert" className="mt-1.5 text-xs text-status-danger-fg">{error}</p>}
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />{t(current.signature_file_name ? "global.office.signature.replace" : "global.office.signature.upload")}
        </button>
        <input ref={input} type="file" accept="image/png,.png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </section>
  );
}
