import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { localeTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Small building blocks shared by the owner and franchisor screens. Same look as the owner home:
// white surface, visible 1px border, 4px radius, brand tokens only.

export const inputCls =
  "h-9 w-full rounded-[4px] border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
export const textareaCls =
  "w-full resize-none rounded-[4px] border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
export const primaryButtonCls =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonCls =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

/** Parses "2026-09" at noon; null when the value is empty or malformed (e.g. a chart tooltip with no payload). */
const parseIsoMonth = (isoMonth: string): Date | null => {
  const date = new Date(`${isoMonth}-01T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "2026-09" as "septiembre de 2026" (or "September 2026"); empty string for an invalid month. */
export const formatMonth = (isoMonth: string, lng: string) => {
  const date = parseIsoMonth(isoMonth);
  return date ? new Intl.DateTimeFormat(localeTag(lng), { month: "long", year: "numeric" }).format(date) : "";
};

/** "2026-09" as "sep." for chart axes; empty string for an invalid month. */
export const formatMonthShort = (isoMonth: string, lng: string) => {
  const date = parseIsoMonth(isoMonth);
  return date ? new Intl.DateTimeFormat(localeTag(lng), { month: "short" }).format(date) : "";
};

export function PageHeader({ question, children }: { question: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <header>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("owner_extra.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{question}</h1>
      {children}
    </header>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mt-6 rounded-[4px] border border-border bg-surface p-6 text-sm">
      <p className="font-medium">{t("owner_extra.common.error")}</p>
      <button onClick={onRetry} className="mt-2 text-link hover:underline">
        {t("owner_extra.common.retry")}
      </button>
    </div>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-6 space-y-4" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-[4px]" />
      ))}
    </div>
  );
}

/** Dashed box that says what will appear here and what to do next. */
export function EmptyState({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="mt-6 rounded-[4px] border border-dashed border-border bg-surface p-8">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[4px] border border-border bg-surface", className)}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** One figure with its label. Figures use the display font and tabular numbers. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[4px] border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {/* A div, not a p: the hint can be a block element such as a progress bar. */}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export type Tone = "neutral" | "info" | "warning" | "danger" | "success";

const TONE: Record<Tone, string> = {
  neutral: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  info: "border-status-info-border bg-status-info-bg text-status-info-fg",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
};

/** Same badge as task statuses: 4px radius, tint, darker text and a visible border of the same hue. */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", TONE[tone])}>
      {children}
    </span>
  );
}

/** Thin progress bar in gold (the accent colour), with a visible border. */
export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 overflow-hidden rounded-[2px] border border-border bg-muted"
    >
      <div className="h-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
