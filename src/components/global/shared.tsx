import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { TODAY } from "@/config/app";
import { useBusinesses, useOrganizations, useRules, useTasks, useVersions } from "@/lib/api/hooks";
import type { OfficeStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import type { Health } from "@/lib/tasks/owner";
import { BusinessFile } from "@/components/business/BusinessFile";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { cn } from "@/lib/utils";
import { DOT } from "@/components/office/shared";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { FundsAndDistribution } from "@/components/funds/FundsAndDistribution";
import { MAX_HOME_ITEMS } from "./logic";

const BADGE: Record<Health, string> = {
  red: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
  amber: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  green: "bg-status-success-bg text-status-success-fg border-status-success-border",
  grey: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
};

/** Business light as text with a visible border: the same words on every Global screen. */
export function HealthBadge({ health }: { health: Health }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", BADGE[health])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[health])} />
      {t(`global.health.${health}`)}
    </span>
  );
}

const STATUS_BADGE: Record<OfficeStatus, string> = {
  opening: "bg-status-info-bg text-status-info-fg border-status-info-border",
  operating: "bg-status-success-bg text-status-success-fg border-status-success-border",
  paused: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
};

/** En apertura, Operando or Pausada. */
export function OfficeStatusBadge({ status }: { status: OfficeStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", STATUS_BADGE[status])}>
      {t(`global.offices.status.${status}`)}
    </span>
  );
}

/** Screen heading: the role line and the question of the screen. */
export function GlobalHeader({ question }: { question: string }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("global.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{question}</h1>
    </>
  );
}

export function ErrorBox({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-surface p-6 text-sm">
      <p className="font-medium">{t("global.error_title")}</p>
      <p className="mt-1 text-muted-foreground">{t("global.error_body")}</p>
      <button onClick={onRetry} className="mt-3 text-link hover:underline">{t("global.retry")}</button>
    </div>
  );
}

export function EmptyBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-8 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}

export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}</div>
);

/** Read-only summary of a business for SM Global. Global looks, it never edits tasks or leads. */
export function BusinessSheet({ businessId, onClose }: { businessId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const bizQ = useBusinesses();
  const tasksQ = useTasks();
  const versionsQ = useVersions();
  const orgsQ = useOrganizations();
  const rulesQ = useRules();
  const business = businessId ? bizQ.data?.find((b) => b.id === businessId) : undefined;
  const loading = bizQ.isLoading || tasksQ.isLoading || versionsQ.isLoading || rulesQ.isLoading;
  const failed = bizQ.isError || tasksQ.isError || versionsQ.isError || rulesQ.isError;
  const retry = () => { void bizQ.refetch(); void tasksQ.refetch(); void versionsQ.refetch(); void rulesQ.refetch(); };

  const body = () => {
    if (failed)
      return <div className="p-6"><ErrorBox onRetry={retry} /></div>;
    if (loading)
      return <div className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-32" /></div>;
    if (!business)
      return <p className="p-6 text-sm text-muted-foreground">{t("global.business.not_found")}</p>;

    const tasks = (tasksQ.data ?? []).filter((x) => x.status !== "cancelled");
    const row = buildNetworkMatrix(tasks, versionsQ.data ?? [], [business], TODAY, rulesQ.data?.area_amber_days)[0];
    const inProgram = business.status === "in_program";
    const office = orgsQ.data?.find((o) => o.id === business.office_id)?.name ?? "";

    return (
      <div className="flex min-h-full flex-col">
        <header className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold leading-snug">{business.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {inProgram ? t("global.structure.day", { day: business.program_day }) : t("global.business.franchisor")}
              </p>
            </div>
            <button onClick={onClose} aria-label={t("global.close")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {inProgram && row && <div className="mt-3"><HealthBadge health={row.health} /></div>}
          <p className="mt-3 rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("global.business.read_only")}</p>
        </header>

        {/* Ficha del negocio (same five parts the office sees), read only. */}
        <div className="px-6 py-4">
          <p className="mb-4 text-xs text-muted-foreground">{t("global.business.office")}: <span className="font-medium text-foreground">{office}</span></p>
          <BusinessFile businessId={business.id} variant="sm" />
        </div>

        {/* Bishop funds and distribution to the firms: SM Global reads, never edits. */}
        {inProgram && (
          <div className="border-t border-border px-6 py-4">
            <FundsAndDistribution businessId={business.id} mode="read" />
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={!!businessId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
        <SheetTitle className="sr-only">{business?.name ?? t("global.business.title")}</SheetTitle>
        <SheetDescription className="sr-only">{t("global.business.read_only")}</SheetDescription>
        {businessId && body()}
      </SheetContent>
    </Sheet>
  );
}

export interface HistoryEntry {
  id: string;
  /** ISO date time of the change. */
  when: string;
  author: string;
  title: string;
  /** One line per field changed: "Nombre: antes a ahora". */
  lines: string[];
  note: string | null;
}

/** Change history with date and author, newest first. Shows 5 and then "Ver todo". */
export function HistoryList({ title, entries, empty }: { title: string; entries: HistoryEntry[]; empty: string }) {
  const { t, i18n } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, MAX_HOME_ITEMS);
  return (
    <section className="mt-6 rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{t("global.history.count", { count: entries.length })}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.when, i18n.language)} · {e.author}</p>
                {e.lines.map((line) => <p key={line} className="mt-1 text-xs">{line}</p>)}
                {e.note && <p className="mt-1 text-xs text-muted-foreground">{t("global.history.note", { note: e.note })}</p>}
              </li>
            ))}
          </ul>
          {entries.length > MAX_HOME_ITEMS && (
            <button onClick={() => setAll((v) => !v)} className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:underline">
              {all ? t("global.home.see_less") : t("sm.see_all", { count: entries.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
