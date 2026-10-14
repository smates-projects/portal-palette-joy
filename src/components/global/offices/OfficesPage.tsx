import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/format";
import { useOffices } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { officeHealth } from "../logic";
import { DisabledAction, EmptyBox, ErrorBox, GlobalHeader, HealthBadge, OfficeStatusBadge } from "../shared";

const COLUMNS = ["city", "manager", "status", "opened", "programs", "leads", "conversion", "firms", "health"] as const;

/** Oficinas: the network of SM offices, one row each. A click opens the office. */
export function OfficesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const officesQ = useOffices();
  const header = <GlobalHeader question={t("global.offices.question")} />;
  const open = (officeId: string) => void navigate({ to: "/oficinas/$officeId", params: { officeId } });

  if (officesQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => void officesQ.refetch()} /></div>
      </div>
    );

  const offices = officesQ.data ?? [];
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>{header}</div>
        {/* The data layer has no create-office call yet. */}
        <DisabledAction label={t("global.offices.new")} />
      </div>

      <div className="mt-6">
        {officesQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
        ) : offices.length === 0 ? (
          <EmptyBox title={t("global.offices.empty_title")} body={t("global.offices.empty_body")} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{t("global.offices.col_office")}</th>
                  {COLUMNS.map((c) => (
                    <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">{t(`global.offices.col_${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offices.map(({ office, manager, stats }) => (
                  <tr
                    key={office.id}
                    tabIndex={0}
                    onClick={() => open(office.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(office.id); } }}
                    className="cursor-pointer outline-none hover:bg-accent/40 focus-visible:bg-accent"
                  >
                    <td className="px-3 py-2.5 font-medium">{office.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{office.city}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{manager?.full_name ?? t("global.offices.no_manager")}</td>
                    <td className="px-3 py-2.5">{office.status ? <OfficeStatusBadge status={office.status} /> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{office.opened_at ? formatDate(office.opened_at, i18n.language) : t("global.offices.no_date")}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.programs}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.open_leads}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{t("global.offices.no_data")}</td>
                    <td className="px-3 py-2.5 font-display tabular-nums">{stats.partner_firms}</td>
                    <td className="px-3 py-2.5">{stats.programs > 0 ? <HealthBadge health={officeHealth(stats.health)} /> : <span className="text-xs text-muted-foreground">{t("global.offices.no_programs")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
