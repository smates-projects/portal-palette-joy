import { useTranslation } from "react-i18next";
import { FEES } from "@/config/economics";
import { useFranchiseeHome, useFranchiseeTeam } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, Screen, Tag } from "@/components/bishop/ui";

/** Data of the franchise unit as the franchisor has it, the terms the unit works under, and its team. */
export function FranchiseeBusinessPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const homeQ = useFranchiseeHome();
  const teamQ = useFranchiseeTeam();

  if (homeQ.isError)
    return (
      <Screen ns="franchisee" screen="business">
        <ErrorBlock title={t("franchisee.error")} retryLabel={t("franchisee.retry")} onRetry={() => void homeQ.refetch()} />
      </Screen>
    );
  if (homeQ.isLoading || !homeQ.data)
    return (
      <Screen ns="franchisee" screen="business">
        <LoadingBlocks rows={2} />
      </Screen>
    );

  const { franchise, franchisor_name: franchisor, manual_version: manualVersion } = homeQ.data;
  const unitData: { label: string; value: string }[] = [
    { label: t("franchisee.business.unit_name"), value: franchise.name },
    { label: t("franchisee.business.franchisor"), value: franchisor },
    { label: t("franchisee.business.franchisee"), value: franchise.franchisee_name },
    { label: t("franchisee.business.location"), value: `${franchise.city}, ${franchise.state}` },
    {
      label: t(franchise.status === "opening" ? "franchisee.business.opening_planned" : "franchisee.business.opening_date"),
      value: formatDate(franchise.opening_date, lng),
    },
    { label: t("franchisee.business.manual_version"), value: manualVersion },
  ];
  const terms: { label: string; value: string }[] = [
    { label: t("franchisee.business.royalty"), value: `${Math.round(FEES.royalty_rate * 100)}%` },
    { label: t("franchisee.business.marketing"), value: `${Math.round(FEES.marketing_fund_rate * 100)}%` },
  ];

  return (
    <Screen ns="franchisee" screen="business">
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-4">
          <Panel title={t("franchisee.business.unit_title")} action={<Tag tone={franchise.status === "operating" ? "success" : "info"}>{t(`franchisee.business.status_${franchise.status}`)}</Tag>}>
            <dl className="divide-y divide-border border-t border-border text-sm">
              {unitData.map((row) => (
                <div key={row.label} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {/* Team */}
          <Panel title={t("franchisee.business.team_title")}>
            {teamQ.isError ? (
              <p className="mx-4 mb-4 text-sm">{t("franchisee.error")} <button onClick={() => void teamQ.refetch()} className="text-link hover:underline">{t("franchisee.retry")}</button></p>
            ) : teamQ.isLoading ? (
              <p className="mx-4 mb-4 text-sm text-muted-foreground">{t("franchisee.loading")}</p>
            ) : (teamQ.data ?? []).length === 0 ? (
              <div className="px-4 pb-4"><EmptyBlock title={t("franchisee.business.team_empty_title")} body={t("franchisee.business.team_empty_body")} /></div>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {teamQ.data!.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.role}</p>
                    </div>
                    {m.email && <span className="text-sm text-muted-foreground">{m.email}</span>}
                    <Tag tone={m.state === "active" ? "success" : "warning"}>{t(`franchisee.business.member_${m.state}`)}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title={t("franchisee.business.terms_title")} className="self-start">
          <dl className="divide-y divide-border border-t border-border text-sm">
            {terms.map((row) => (
              <div key={row.label} className="flex justify-between gap-2 px-4 py-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-display font-semibold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{t("franchisee.business.terms_note", { franchisor })}</p>
        </Panel>
      </div>
    </Screen>
  );
}
