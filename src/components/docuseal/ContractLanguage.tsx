import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContractLanguage } from "@/lib/api/types";
import { CONTRACT_LANGUAGES, contractLanguageOf } from "@/lib/contracts/language";
import { cn } from "@/lib/utils";

/**
 * The language a contract reader shows. Starts in the app language and follows it when the person switches the app;
 * the reader's own toggle changes only that reader. `initial` carries the choice from a card into its dialog.
 */
export function useContractLanguage(initial?: ContractLanguage) {
  const { i18n } = useTranslation();
  const app = contractLanguageOf(i18n.language);
  const [language, setLanguage] = useState<ContractLanguage>(initial ?? app);
  useEffect(() => {
    if (!initial) setLanguage(app);
  }, [app, initial]);
  return [language, setLanguage] as const;
}

/** "ES | EN" for one contract reader, drawn like the app language switch (visible border, 4 px radius). */
export function ContractLanguageToggle(props: { value: ContractLanguage; onChange: (language: ContractLanguage) => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("contracts_lang.toggle_label")} className={cn("inline-grid h-7 shrink-0 grid-cols-2 items-center rounded-[4px] border border-border bg-surface p-0.5", props.className)}>
      {CONTRACT_LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          onClick={() => props.onChange(language)}
          aria-pressed={props.value === language}
          className={cn(
            "h-full w-8 rounded-[4px] font-display text-[11px] font-semibold uppercase transition-colors",
            props.value === language ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}

/** Said when English was chosen and the contract has only its Spanish version (sent before the English ones). */
export function ContractFallbackNote({ show, className }: { show: boolean; className?: string }) {
  const { t } = useTranslation();
  if (!show) return null;
  return <p role="status" className={cn("text-xs text-muted-foreground", className)}>{t("contracts_lang.fallback")}</p>;
}
