import { useTranslation } from "react-i18next";

/**
 * Placeholder of a screen that is built later. Every feature page (global, owner, bishop, franchisee) renders this
 * until its engineer replaces the page component. Copy lives in the feature's own i18n namespace:
 * `<ns>.for_role` (role line) and `<ns>.<screen>.question` / `.soon` (heading and what will be here).
 */
export function ScreenPlaceholder({ ns, screen }: { ns: "global" | "owner_extra" | "bishop" | "franchisee"; screen: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`${ns}.for_role`)}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(`${ns}.${screen}.question`)}</h1>
      <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8">
        <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("topbar.coming_soon")}
        </span>
        <p className="mt-3 max-w-xl text-sm text-foreground">{t(`${ns}.${screen}.soon`)}</p>
      </div>
    </div>
  );
}
