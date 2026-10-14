import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/lib/api/hooks";

/** Placeholder for sections that come later: says what will be there. */
export function ComingSoonPage({ pageKey }: { pageKey: "manual" | "documents" | "numbers" | "business" | "businesses" | "catalog" | "settings" }) {
  const { t } = useTranslation();
  const role = useCurrentUser().data?.role;
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(role === "sm_team" ? "sm.for_role" : "owner.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(`pages.${pageKey}.subtitle`)}</h1>
      <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8">
        <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("topbar.coming_soon")}
        </span>
        <p className="mt-3 max-w-xl text-sm text-foreground">{t(`soon.${pageKey}`)}</p>
      </div>
    </div>
  );
}
