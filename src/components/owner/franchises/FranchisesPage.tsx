import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useFranchises } from "@/lib/api/hooks";
import type { ReportStatus } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { EmptyState, ErrorState, formatMonth, LoadingState, PageHeader, ProgressBar, ToneBadge, type Tone } from "../shared";

const REPORT_TONE: Record<ReportStatus, Tone> = { due: "warning", submitted: "review", paid: "success" };

/** Mis franquicias: one row per unit with status, sales, royalty, standards and last report. */
export function FranchisesPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const businessId = useCurrentUser().data?.business_id ?? undefined;
  const franchisesQ = useFranchises(businessId);
  const franchises = franchisesQ.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.franchises.question")} />

      {franchisesQ.isError ? (
        <ErrorState onRetry={() => void franchisesQ.refetch()} />
      ) : franchisesQ.isLoading ? (
        <LoadingState rows={2} />
      ) : franchises.length === 0 ? (
        <EmptyState title={t("owner_extra.franchises.empty_title")} hint={t("owner_extra.franchises.empty_hint")} />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[4px] border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">{t("owner_extra.franchises.col_franchise")}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t("owner_extra.franchises.col_status")}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("owner_extra.franchises.col_sales")}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("owner_extra.franchises.col_royalty")}</th>
                <th scope="col" className="w-44 px-4 py-2.5 font-medium">{t("owner_extra.franchises.col_standards")}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t("owner_extra.franchises.col_report")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {franchises.map((f) => (
                <tr key={f.id} className="hover:bg-muted">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link to="/franquicias/$franchiseId" params={{ franchiseId: f.id }} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{f.franchisee_name} · {f.city}, {f.state}</p>
                  </th>
                  <td className="px-4 py-3">
                    <ToneBadge tone={f.status === "operating" ? "success" : "info"}>{t(`owner_extra.franchises.status_${f.status}`)}</ToneBadge>
                  </td>
                  <td className="px-4 py-3 text-right">{f.last_sales === null ? "-" : formatUsd(f.last_sales, lng)}</td>
                  <td className="px-4 py-3 text-right">{f.last_report?.royalty_amount == null ? "-" : formatUsd(f.last_report.royalty_amount, lng)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><ProgressBar pct={f.compliance_pct} label={t("owner_extra.franchises.standards_label", { name: f.name })} /></div>
                      <span className="w-9 text-right text-xs">{f.compliance_pct}%</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.status === "opening" ? t("owner_extra.franchises.standards_opening") : t("owner_extra.franchises.standards_operating")}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {f.last_report ? (
                      <>
                        <p className="text-sm">{formatMonth(f.last_report.month, lng)}</p>
                        <ToneBadge tone={REPORT_TONE[f.last_report.status]}>{t(`owner_extra.franchises.report_${f.last_report.status}`)}</ToneBadge>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("owner_extra.franchises.no_report")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
