import { useTranslation } from "react-i18next";
import type { SnapshotResult } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { BandBadge, BlockBadge } from "./LeadBadges";

/**
 * The assessment result as the owner saw it: headline, score, the seven blocks, strengths and priorities. Shared by
 * the lead detail and the ficha del negocio (there, the copy kept when the lead entered the program).
 */
export function AssessmentResult({ result, submittedAt }: {
  result: SnapshotResult;
  submittedAt: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="rounded-md border border-border p-4">
      {result.band && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold leading-snug">{t(`pipeline.detail.headline.${result.band}`)}</p>
          <div className="text-right">
            {result.score !== null && <span className="block font-display text-2xl font-semibold tabular-nums">{result.score}</span>}
            <BandBadge band={result.band} />
          </div>
        </div>
      )}
      {!result.eligible_program && (
        <div className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
          <p className="font-medium">{t("pipeline.detail.not_eligible")}</p>
          <ul className="mt-1 list-disc pl-4">
            {result.eligibility_gaps.map((g) => <li key={g}>{t(`pipeline.detail.gaps.${g}`)}</li>)}
          </ul>
        </div>
      )}
      <p className="mt-4 text-xs font-medium text-muted-foreground">{t("pipeline.detail.blocks_title")}</p>
      <ul className="mt-1.5 divide-y divide-border">
        {result.blocks.map((b) => (
          <li key={b.key} className="flex items-center justify-between py-1.5 text-sm">
            <span>{t(`pipeline.blocks.${b.key}`)}</span>
            <BlockBadge status={b.status} />
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.strengths")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.priorities")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{result.priorities.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("pipeline.detail.submitted_at", { date: formatDate(submittedAt, i18n.language) })}</p>
    </div>
  );
}

/** "Lo que el dueño dice que hace mejor", highlighted with the gold side bar. */
export function KnowHow({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-md border-l-2 border-gold bg-muted/60 px-4 py-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.know_how")}</h3>
      <p className="mt-1.5 text-sm leading-relaxed">“{text}”</p>
    </section>
  );
}
