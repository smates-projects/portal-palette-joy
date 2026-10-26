import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAcceptEsignConsent } from "@/lib/api/hooks";
import type { EsignConsent } from "@/lib/api/repositories";
import type { ContractLanguage } from "@/lib/api/types";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { ContractLanguageToggle, useContractLanguage } from "./ContractLanguage";

/**
 * "Antes de firmar": the electronic records and signatures disclosure (ESIGN, UETA) the API serves, in the reader's
 * language (ES | EN), accepted once per version with an explicit checkbox. The API keeps who, when, the version, the
 * SHA-256 of the exact text shown, the IP and the browser; the signing form opens only after it.
 */
export function EsignConsentPanel({ consent, onAccepted }: { consent: EsignConsent; onAccepted: () => void }) {
  const { t } = useTranslation();
  const accept = useAcceptEsignConsent();
  const [language, setLanguage] = useContractLanguage();
  const [checked, setChecked] = useState(false);
  const [tried, setTried] = useState(false);
  const text = consent.text[language as ContractLanguage] || consent.text.es;
  const [title, ...paragraphs] = text.split(/\n\s*\n/);

  const submit = () => {
    setTried(true);
    if (!checked) return;
    accept.mutate(
      { version: consent.version, language },
      { onSuccess: onAccepted, onError: () => toast.error(t("intake.docuseal.t_error")) },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("intake.docuseal.consent_title")}</p>
          <p className="text-xs text-muted-foreground">{t("intake.docuseal.consent_intro")}</p>
        </div>
        <ContractLanguageToggle value={language} onChange={setLanguage} />
      </div>
      <div
        className="max-h-[45vh] overflow-y-auto rounded-[4px] border border-border bg-surface p-4 text-[13px] leading-relaxed"
        tabIndex={0}
        aria-label={t("intake.docuseal.consent_label")}
        lang={language}
      >
        <p className="font-semibold text-foreground">{title}</p>
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="mt-2 text-muted-foreground">{paragraph}</p>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span>{t("intake.docuseal.consent_check")}</span>
      </label>
      {tried && !checked && <p className="text-xs text-status-danger-fg">{t("intake.docuseal.consent_missing")}</p>}
      <div className="flex justify-end border-t border-border pt-3">
        <PrimaryButton onClick={submit} disabled={accept.isPending}>{t("intake.docuseal.consent_accept")}</PrimaryButton>
      </div>
    </div>
  );
}
