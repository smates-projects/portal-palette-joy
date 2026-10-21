import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The reviewer's note on a document asked again. Error semantics, like a failed payment: red, bordered, with the
 * exclamation icon. The owner reads it in Documentos and the consultant in the lead's checklist. The API also emails
 * it to the owner.
 */
export function ReviewNoteAlert({ comment, className }: { comment: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={cn("flex items-start gap-2 rounded-[4px] border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg", className)}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">{t("intake.review_note_title")}</span> {comment}
      </p>
    </div>
  );
}
