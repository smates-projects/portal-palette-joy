import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useFranchises, useFranchisorSummary } from "@/lib/api/hooks";
import { formatUsd } from "@/lib/format";
import { buildAttentionList, type AttentionItem, type AttentionReason } from "../logic";
import { EmptyState, ErrorState, formatMonth, LoadingState, PageHeader, Panel, Stat } from "../shared";

const MAX_ITEMS = 5;

/** Home of an owner whose business already franchises: network numbers of the last month and who needs attention. */
export function FranchisorHomePage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const businessId = useCurrentUser().data?.business_id ?? undefined;
  const summaryQ = useFranchisorSummary(businessId);
  const franchisesQ = useFranchises(businessId);

  const summary = summaryQ.data;
  const attention = buildAttentionList(franchisesQ.data ?? []);
  const month = summary ? formatMonth(summary.last_month, lng) : "";

  const reasonText = ({ franchise, reasons }: AttentionItem) => {
    const text: Record<AttentionReason, string> = {
      report_late: t("owner_extra.franchisor_home.reason_report_late", { month: franchise.last_report ? formatMonth(franchise.last_report.month, lng) : "" }),
      tickets: t("owner_extra.franchisor_home.reason_tickets", { count: franchise.open_tickets }),
      low_standards: t("owner_extra.franchisor_home.reason_standards", { pct: franchise.compliance_pct }),
    };
    return reasons.map((r) => text[r]).join(" · ");
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.franchisor_home.question")} />

      {summaryQ.isError || franchisesQ.isError ? (
        <ErrorState onRetry={() => { void summaryQ.refetch(); void franchisesQ.refetch(); }} />
      ) : summaryQ.isLoading || franchisesQ.isLoading ? (
        <LoadingState rows={3} />
      ) : !summary || summary.franchises === 0 ? (
        <EmptyState title={t("owner_extra.franchisor_home.empty_title")} hint={t("owner_extra.franchisor_home.empty_hint")} />
      ) : (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label={t("owner_extra.franchisor_home.franchises")}
              value={summary.franchises}
              hint={t("owner_extra.franchisor_home.franchises_split", { operating: summary.operating, opening: summary.opening })}
            />
            <Stat label={t("owner_extra.franchisor_home.sales")} value={formatUsd(summary.sales_last_month, lng)} hint={month} />
            <Stat label={t("owner_extra.franchisor_home.royalties")} value={formatUsd(summary.royalties_last_month, lng)} hint={month} />
            <Stat label={t("owner_extra.franchisor_home.marketing_fund")} value={formatUsd(summary.marketing_fund_last_month, lng)} hint={month} />
            <Stat
              label={t("owner_extra.franchisor_home.open_tickets")}
              value={summary.open_tickets}
              hint={summary.reports_due > 0 ? t("owner_extra.franchisor_home.reports_due", { count: summary.reports_due }) : undefined}
            />
            <Stat
              label={t("owner_extra.franchisor_home.manual_version")}
              value={summary.manual_version ?? t("owner_extra.franchisor_home.no_manual")}
              hint={
                <Link to="/franquiciadora" className="text-link hover:underline">
                  {t("owner_extra.franchisor_home.go_manual")}
                </Link>
              }
            />
          </div>

          <Panel title={t("owner_extra.franchisor_home.attention")} aside={attention.length > 0 ? t("owner_extra.franchisor_home.attention_count", { count: attention.length }) : undefined}>
            {attention.length === 0 ? (
              <p className="mx-4 mb-4 rounded-[4px] border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("owner_extra.franchisor_home.attention_empty")}</p>
            ) : (
              <>
                <ul className="divide-y divide-border border-t border-border">
                  {attention.slice(0, MAX_ITEMS).map((item) => (
                    <li key={item.franchise.id}>
                      <Link to="/franquicias/$franchiseId" params={{ franchiseId: item.franchise.id }} className="block px-4 py-3 hover:bg-muted">
                        <p className="text-sm font-medium">{item.franchise.name}</p>
                        <p className="text-sm text-muted-foreground">{reasonText(item)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
                {attention.length > MAX_ITEMS && (
                  <Link to="/franquicias" className="block border-t border-border px-4 py-2.5 text-sm text-link hover:bg-muted">
                    {t("owner_extra.common.see_all", { count: attention.length })}
                  </Link>
                )}
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
