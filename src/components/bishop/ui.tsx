import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Namespaces of the two role folders that share these building blocks (Bishop and franchisee screens). */
export type RoleNs = "bishop" | "franchisee";

/** Page frame: role line and the question of the screen as heading, like every other screen. */
export function Screen({ ns, screen, children }: { ns: RoleNs; screen: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`${ns}.for_role`)}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(`${ns}.${screen}.question`)}</h1>
      {children}
    </div>
  );
}

/** White block with a visible border and an optional title row (action on the right). */
export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-border bg-surface", className)}>
      {title && (
        <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** One figure with its label and a short line under it. */
export function Metric({ label, value, sub, badge }: { label: string; value: ReactNode; sub?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        {badge}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
  info: "bg-status-info-bg text-status-info-fg border-status-info-border",
  success: "bg-status-success-bg text-status-success-fg border-status-success-border",
  warning: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  danger: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
} as const;
export type Tone = keyof typeof TONES;

/** Small label with a tint, a darker text and a visible border of the same hue (4px radius, never a pill). */
export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", TONES[tone])}>
      {children}
    </span>
  );
}

/** Marks every split number that is not final yet. */
export function ProvisionalTag() {
  const { t } = useTranslation();
  return <Tag tone="warning">{t("bishop.provisional")}</Tag>;
}

/** Thin gold bar for a percentage (progress, compliance). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ErrorBlock({ title, retryLabel, onRetry }: { title: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
      <p className="font-medium">{title}</p>
      <button onClick={onRetry} className="mt-2 text-link hover:underline">{retryLabel}</button>
    </div>
  );
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-6 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}

export function LoadingBlocks({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-6 space-y-4" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-md" />
      ))}
    </div>
  );
}

/** Primary action button, same look as the other role screens. */
export const primaryButton =
  "inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50";
/** Secondary action: visible border, no fill. */
export const secondaryButton =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 font-display text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50";
