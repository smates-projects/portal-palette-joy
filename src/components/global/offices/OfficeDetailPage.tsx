import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useOffice, useRules } from "@/lib/api/hooks";
import { expectedFranchisePct } from "@/lib/tasks/office";
import { AREAS } from "@/lib/tasks/owner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { officeHealth } from "../logic";
import { BusinessSheet, DisabledAction, EmptyBox, ErrorBox, GlobalHeader, HealthBadge, OfficeStatusBadge } from "../shared";
import { OfficeNetwork } from "./OfficeNetwork";

/** Ficha de una oficina: data, manager and team, firms by area, businesses and its Red (read only). */
export function OfficeDetailPage({ officeId }: { officeId: string }) {
  const { t, i18n } = useTranslation();
  const officeQ = useOffice(officeId);
  const rulesQ = useRules();
  const [showNetwork, setShowNetwork] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const header = <GlobalHeader question={t("global.office.question")} />;
  const back = (
    <Link to="/oficinas" className="mb-3 inline-flex items-center gap-1 text-sm text-link hover:underline">
      <ArrowLeft className="h-4 w-4" />{t("global.office.back")}
    </Link>
  );

  if (officeQ.isError || rulesQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {back}{header}
        <div className="mt-6"><ErrorBox onRetry={() => { void officeQ.refetch(); void rulesQ.refetch(); }} /></div>
      </div>
    );
  if (officeQ.isLoading || rulesQ.isLoading)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {back}{header}
        <Skeleton className="mt-6 h-32 rounded-md" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><Skeleton className="h-56 rounded-md" /><Skeleton className="h-56 rounded-md" /></div>
      </div>
    );
  if (!officeQ.data)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {back}{header}
        <div className="mt-6"><EmptyBox title={t("global.office.not_found_title")} body={t("global.office.not_found_body")} /></div>
      </div>
    );

  const { office, manager, stats, businesses, firms, team } = officeQ.data;
  const goal = rulesQ.data?.franchisability_goal ?? 0;
  const facts: { label: string; value: string }[] = [
    { label: t("global.office.city"), value: office.city ?? t("global.office.none") },
    { label: t("global.office.opened"), value: office.opened_at ? formatDate(office.opened_at, i18n.language) : t("global.offices.no_date") },
    { label: t("global.office.email"), value: office.email ?? t("global.office.none") },
    { label: t("global.office.phone"), value: office.phone ?? t("global.office.none") },
    { label: t("global.office.booking"), value: office.default_booking_url ?? t("global.office.none") },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {header}
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className="font-semibold">{office.name}</span>
            {office.status && <OfficeStatusBadge status={office.status} />}
            {stats.programs > 0 && <HealthBadge health={officeHealth(stats.health)} />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowNetwork((v) => !v)}
            aria-pressed={showNetwork}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            {showNetwork ? t("global.office.hide_network") : t("global.office.see_network")}
          </button>
          {/* The data layer has no pause-office call yet. */}
          <DisabledAction label={t("global.office.pause")} />
        </div>
      </div>

      {showNetwork && <div className="mt-6"><OfficeNetwork officeId={office.id} onOpenBusiness={setBusinessId} /></div>}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        {/* Data */}
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t("global.office.data_title")}</h2></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 truncate font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Manager and team */}
        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t("global.office.team_title")}</h2></div>
          <div className="border-b border-border px-4 py-3 text-sm">
            <p className="text-xs text-muted-foreground">{t("global.office.manager")}</p>
            <p className="mt-0.5 font-medium">{manager ? `${manager.full_name}${manager.title ? `, ${manager.title}` : ""}` : t("global.offices.no_manager")}</p>
          </div>
          {team.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("global.office.team_empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {team.map((u) => (
                <li key={u.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{u.full_name}</span>
                  {u.title && <span className="text-muted-foreground"> · {u.title}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Firms by area: an area without a firm is flagged */}
      <section className="mt-4 rounded-md border border-border bg-surface">
        <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t("global.office.firms_title")}</h2></div>
        <ul className="divide-y divide-border">
          {AREAS.map((area) => {
            const inArea = firms.filter((f) => f.area === area);
            return (
              <li key={area} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[200px_1fr]">
                <span><span className="font-display text-xs font-semibold">{area}</span> {t(`areas.${area}`)}</span>
                {inArea.length === 0 ? (
                  <span><span className="inline-flex rounded-[4px] border border-status-warning-border bg-status-warning-bg px-1.5 py-0.5 text-xs font-medium text-status-warning-fg">{t("global.office.no_firm")}</span></span>
                ) : (
                  <span>{inArea.map((f) => t("owner.firm_label", { name: f.name, what: t(`firmWhat.${area}`) })).join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Businesses */}
      <section className="mt-4 rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("global.office.businesses_title")}</h2>
          <span className="text-xs text-muted-foreground">{t("global.office.businesses_count", { count: businesses.length })}</span>
        </div>
        {businesses.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("global.office.businesses_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  {["business", "program", "franchisability", "health"].map((k) => (
                    <th key={k} className="whitespace-nowrap px-4 py-2 text-left font-medium">{t(`global.office.col_${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {businesses.map((b) => {
                  const program = b.status === "in_program";
                  return (
                    <tr
                      key={b.business_id}
                      tabIndex={0}
                      onClick={() => setBusinessId(b.business_id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBusinessId(b.business_id); } }}
                      className={cn("cursor-pointer outline-none hover:bg-accent/40 focus-visible:bg-accent")}
                    >
                      <td className="px-4 py-2.5 font-medium">{b.name}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                        {program ? t("global.structure.day", { day: b.program_day }) : t("global.structure.franchises_count", { count: b.franchises })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-display tabular-nums">
                        {program ? t("global.structure.franchisability", { pct: b.franchisability_pct, expected: expectedFranchisePct(b.program_day, goal) }) : t("global.office.franchisor")}
                      </td>
                      <td className="px-4 py-2.5">{program ? <HealthBadge health={b.health} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <BusinessSheet businessId={businessId} onClose={() => setBusinessId(null)} />
    </div>
  );
}
