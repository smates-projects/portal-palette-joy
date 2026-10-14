import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkFunnel } from "@/lib/api/hooks";
import { LEAD_STAGES, type LeadStage } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { STAGE_BAR } from "@/components/pipeline/LeadBadges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBox, ErrorBox, GlobalHeader } from "../shared";

const ALL = "__all";
const STAGES: LeadStage[] = [...LEAD_STAGES, "discarded"];

/**
 * Embudo of the whole network, read only. SM Global sees how many leads each office has in each stage;
 * it never moves a lead (the office does). The data layer returns counts per stage and office, not single leads.
 */
export function GlobalFunnelPage() {
  const { t } = useTranslation();
  const funnelQ = useNetworkFunnel();
  const [officeId, setOfficeId] = useState<string>(ALL);
  const header = <GlobalHeader question={t("global.funnel.question")} />;

  if (funnelQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => void funnelQ.refetch()} /></div>
      </div>
    );
  if (funnelQ.isLoading || !funnelQ.data)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 flex gap-3">{STAGES.map((s) => <Skeleton key={s} className="h-56 w-56 rounded-md" />)}</div>
      </div>
    );

  const { stages, by_office } = funnelQ.data;
  const selected = by_office.find((o) => o.office_id === officeId);
  const countOf = (stage: LeadStage) => (selected ? selected.stages : stages).find((s) => s.stage === stage)?.count ?? 0;
  const total = STAGES.reduce((n, s) => n + countOf(s), 0);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {header}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Select value={officeId} onValueChange={setOfficeId}>
          <SelectTrigger aria-label={t("global.funnel.office")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", selected && "border-ring")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("global.funnel.all_offices")}</SelectItem>
            {by_office.map((o) => <SelectItem key={o.office_id} value={o.office_id}>{o.office_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("global.funnel.total", { count: total })}</span>
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("global.funnel.read_only")}</p>
      </div>

      <div className="mt-4">
        {total === 0 ? (
          <EmptyBox title={t("global.funnel.empty_title")} body={t("global.funnel.empty_body")} />
        ) : (
          <div className="flex min-h-0 gap-3 overflow-x-auto pb-2">
            {STAGES.map((stage) => (
              <section key={stage} className={cn("flex w-56 shrink-0 flex-col rounded-md border bg-muted/50", stage === "discarded" ? "border-dashed border-border" : "border-border")}>
                <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className={cn("h-2 w-2 rounded-full", STAGE_BAR[stage])} />
                  <h2 className={cn("text-sm font-semibold", stage === "discarded" && "text-muted-foreground")}>{t(`pipeline.stages.${stage}`)}</h2>
                  <span className="ml-auto font-display text-lg font-semibold tabular-nums">{countOf(stage)}</span>
                </header>
                <ul className="flex-1 divide-y divide-border bg-surface">
                  {(selected ? [selected] : by_office).map((o) => {
                    const n = o.stages.find((s) => s.stage === stage)?.count ?? 0;
                    return (
                      <li key={o.office_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className={cn("truncate", n === 0 && "text-muted-foreground")}>{o.office_name}</span>
                        <span className={cn("font-display tabular-nums", n === 0 && "text-muted-foreground/40")}>{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
