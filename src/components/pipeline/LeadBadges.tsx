import { useTranslation } from "react-i18next";
import type { BlockStatus, LeadBand, LeadResult, LeadSource, LeadStage } from "@/lib/api/types";
import { opennessKey } from "@/lib/leads/readiness";
import { cn } from "@/lib/utils";

const base = "inline-flex items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none";

const BAND: Record<LeadBand, string> = {
  high: "bg-status-success-bg text-status-success-fg border-status-success-border",
  mid: "bg-status-info-bg text-status-info-fg border-status-info-border",
  low: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  track: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
};
const BLOCK: Record<BlockStatus, string> = {
  strong: BAND.high,
  medium: BAND.mid,
  weak: BAND.low,
  unknown: "bg-surface text-muted-foreground border-dashed border-status-neutral-border",
};
export const STAGE_BAR: Record<LeadStage, string> = {
  evaluated: "bg-status-neutral-border",
  meeting: "bg-status-info-border",
  documents: "bg-status-info-fg",
  accepted: "bg-primary",
  in_program: "bg-status-success-border",
  discarded: "bg-status-neutral-border",
};

export function BandBadge({ band, score, className }: { band: LeadBand; score?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn(base, BAND[band], className)}>
      {score !== undefined && <span className="mr-1 font-display tabular-nums">{score}</span>}
      {t(`pipeline.bands.${band}`)}
    </span>
  );
}

export function StageBadge({ stage }: { stage: LeadStage }) {
  const { t } = useTranslation();
  return (
    <span className={cn(base, "gap-1.5 border-border bg-surface text-foreground", stage === "discarded" && "text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_BAR[stage])} />
      {t(`pipeline.stages.${stage}`)}
    </span>
  );
}

/** Business added by hand: "Sin assessment" until SM sends it, then "Assessment pendiente". */
export function AssessmentBadge({ lead }: { lead: { source?: LeadSource | undefined; assessment_sent_at?: string | null | undefined } }) {
  const { t } = useTranslation();
  return (
    <span className={cn(base, "border-dashed border-status-neutral-border bg-surface text-muted-foreground")}>
      {t(lead.assessment_sent_at ? "pipeline.manual.assessment_pending" : "pipeline.manual.no_assessment")}
    </span>
  );
}

/**
 * The owner's closing answer as a quiet line for the SM team ("Quiere entender el proceso primero"): the meeting
 * happens anyway, the consultant just knows how convinced the owner is. Nothing for leads without it.
 */
export function OpennessNote({
  result,
  className,
}: {
  result: Pick<LeadResult, "openness"> | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const key = opennessKey(result);
  if (!key) return null;
  return <p className={cn("text-xs text-muted-foreground", className)}>{t(key)}</p>;
}

export function BlockBadge({ status }: { status: BlockStatus }) {
  const { t } = useTranslation();
  return <span className={cn(base, BLOCK[status])}>{t(`pipeline.block_status.${status}`)}</span>;
}
