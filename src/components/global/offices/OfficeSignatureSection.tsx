import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useSetOfficeSignature } from "@/lib/api/hooks";
import type { Organization } from "@/lib/api/types";

/** "Firma de la oficina": the PNG the NDA and the MOU go out pre-signed with on behalf of Strategic Mates. */
export function OfficeSignatureSection({ office }: { office: Organization }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const save = useSetOfficeSignature();
  const onFile = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!/\.png$/i.test(file.name)) {
      toast.error(t("global.office.signature.only_png"));
      return;
    }
    save.mutate({ officeId: office.id, file }, {
      onSuccess: () => toast.success(t("global.office.signature.t_saved", { name: office.name })),
      onError: () => toast.error(t("global.t_error")),
    });
  };
  return (
    <section className="mt-4 rounded-[4px] border border-border bg-surface">
      <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t("global.office.signature.title")}</h2></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="min-w-0">
          <p>{office.signature_file_name ? t("global.office.signature.loaded", { file: office.signature_file_name }) : t("global.office.signature.none")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("global.office.signature.hint")}</p>
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />{t(office.signature_file_name ? "global.office.signature.replace" : "global.office.signature.upload")}
        </button>
        <input ref={input} type="file" accept="image/png,.png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </section>
  );
}
