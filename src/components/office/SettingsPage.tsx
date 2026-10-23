import { useTranslation } from "react-i18next";
import { useCurrentUser, useOrganizations, useRules } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DOT } from "./shared";
import { ZonesSection } from "@/components/global/rules/EntryRules";

/** Configuración (SM): office details and SM Global rules, read-only. */
export function SettingsPage() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const orgsQ = useOrganizations();
  const office = orgsQ.data?.find((o) => o.kind === "sm" && o.id === me?.organization_id);
  // Live rules from the platform (SM Global edits them): loading and error states, never front defaults.
  const rulesQ = useRules();
  const live = rulesQ.data;
  const Row = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}{hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}</dd>
    </div>
  );
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sm.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("pages.settings.subtitle")}</h1>

      <section className="mt-6 rounded-md border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t("office.cfg.office_title")}</h2>
        {orgsQ.isError ? (
          <div className="p-4 text-sm">
            <p className="font-medium">{t("tasks.error_title")}</p>
            <button onClick={() => void orgsQ.refetch()} className="mt-2 text-link hover:underline">{t("tasks.retry")}</button>
          </div>
        ) : orgsQ.isLoading || !office ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : (
          <dl className="divide-y divide-border">
            <Row label={t("office.cfg.name")}>{office.name}</Row>
            <Row label={t("office.cfg.city")}>{office.city ?? t("app.no_data")}</Row>
            {office.email && <Row label={t("office.cfg.email")}>{office.email}</Row>}
            <Row label={t("office.cfg.booking")} hint={t("office.cfg.booking_hint")}>
              {office.default_booking_url ? (
                <a href={office.default_booking_url} target="_blank" rel="noreferrer" className="break-all text-link hover:underline">{office.default_booking_url}</a>
              ) : t("office.cfg.booking_none")}
            </Row>
          </dl>
        )}
      </section>

      <section className="mt-6 rounded-md border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t("office.cfg.rules_title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("office.cfg.rules_note")}</p>
        </div>
        {rulesQ.isError ? (
          <div className="p-4 text-sm">
            <p className="font-medium">{t("tasks.error_title")}</p>
            <button onClick={() => void rulesQ.refetch()} className="mt-2 text-link hover:underline">{t("tasks.retry")}</button>
          </div>
        ) : !live ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : (
        <dl className="divide-y divide-border">
          <Row label={t("office.cfg.goal")} hint={t("office.cfg.goal_hint")}>
            <span className="font-display text-lg font-semibold tabular-nums">{live.franchisability_goal}%</span>
          </Row>
          <Row label={t("office.cfg.required")} hint={t("office.cfg.required_hint")}>
            {live.required_task_codes.length ? (
              <span className="flex flex-wrap gap-1.5">
                {live.required_task_codes.map((c) => <span key={c} className="rounded-[4px] border border-border px-1.5 py-0.5 font-display text-xs font-semibold tabular-nums">{c}</span>)}
              </span>
            ) : t("office.cfg.required_empty")}
          </Row>
          <Row label={t("office.cfg.health_rule")} hint={t("office.cfg.health_hint")}>
            <ul className="space-y-1">
              {(["red", "amber", "green", "grey"] as const).map((h) => (
                <li key={h} className="flex items-start gap-2"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[h])} />{t(`office.cfg.health.${h}`, { days: live.area_amber_days })}</li>
              ))}
            </ul>
          </Row>
        </dl>
        )}
      </section>
      {/* Which leads reach this office (SM Global sets the zones). */}
      <ZonesSection readOnly officeId={me?.organization_id ?? undefined} />
    </div>
  );
}
