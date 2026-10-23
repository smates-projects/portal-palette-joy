import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useBusinesses, useCurrentUser, useLeads, useLimits, useOrganizations, useTasks } from "@/lib/api/hooks";
import { ClockLabel } from "@/components/pipeline/IntakeChecklist";
import type { TaskWithComputed } from "@/lib/api/types";
import { buildAttention, buildSmSummary, isDueToday, type SmSummary } from "@/lib/tasks/sm";
import { isStaleSubmission, overdueLabel } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { LeadMeetingsToday } from "./LeadMeetingsToday";
import type { TasksSearch } from "@/lib/tasks/table";

const CARDS: { key: keyof SmSummary; search: TasksSearch; match: (t: TaskWithComputed) => boolean }[] = [
  { key: "due_today", search: { due: "today" }, match: (t) => isDueToday(t) },
  { key: "overdue", search: { due: "overdue" }, match: (t) => t.is_overdue },
  { key: "stale", search: { stale: "1" }, match: (t) => isStaleSubmission(t) },
  { key: "blocked", search: { blocked: "1" }, match: (t) => t.is_blocked && t.status !== "accepted" },
];
const MAX_ITEMS = 5;

/** Inicio for the SM team: tasks this person supervises, inside their office. */
export function SmHomePage({ taskId }: { taskId?: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useCurrentUser().data;
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const orgsQ = useOrganizations();
  const staleDays = useLimits()?.stale_task_days;

  const all = tasksQ.data ?? [];
  const mine = all.filter((x) => x.supervisor_user_id === me?.id);
  const summary = buildSmSummary(mine);
  const attention = buildAttention(mine, all);
  const bizName = (id: string) => bizQ.data?.find((b) => b.id === id)?.name ?? "";
  const firmLabel = (id: string) => {
    const o = orgsQ.data?.find((x) => x.id === id);
    return o ? t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "none"}`) }) : "";
  };
  const openTask = (id: string | undefined) => void navigate({ to: "/", search: id ? { task: id } : {}, replace: true });
  const selected = all.find((x) => x.id === taskId);

  /** "2 en Vossler, 1 en Enyermy Clean Pro" */
  const context = (items: TaskWithComputed[]) => {
    const by = new Map<string, number>();
    items.forEach((x) => by.set(x.business_id, (by.get(x.business_id) ?? 0) + 1));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => t("sm.in_business", { count: n, name: bizName(id) })).join(", ");
  };

  const reasonText = (a: (typeof attention)[number]) =>
    a.reason === "overdue"
      ? overdueLabel(t, a.days)
      : a.reason === "stale"
        ? t("sm.reason_stale", { count: a.days })
        : t("sm.reason_long_block", { codes: a.blockers.map((b) => b.code).join(", ") });

  const loading = tasksQ.isLoading || bizQ.isLoading;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sm.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("sm.home_heading")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("sm.home_scope")}</p>

      {tasksQ.isError ? (
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("tasks.error_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("tasks.error_body")}</p>
          <button onClick={() => tasksQ.refetch()} className="mt-3 text-link hover:underline">{t("tasks.retry")}</button>
        </div>
      ) : (
        <>
          {loading ? (
            <Skeleton className="mt-6 h-[76px] rounded-md" />
          ) : (
            <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-4 sm:divide-x sm:divide-border">
              {CARDS.map((c) => {
                const count = summary[c.key];
                const off = count === 0;
                const alert = !off && c.key === "overdue";
                return (
                  <Link
                    key={c.key}
                    to="/tareas"
                    search={c.search}
                    className={cn(
                      "relative px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
                      alert && "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-status-danger-fg",
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={cn("font-display text-2xl font-semibold tabular-nums", off ? "text-muted-foreground/40" : alert ? "text-status-danger-fg" : "text-foreground")}>
                        {count}
                      </span>
                      <span className={cn("text-xs font-medium", off ? "text-muted-foreground/60" : "text-foreground")}>{t(`sm.cards.${c.key}`, { days: staleDays ?? "" })}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{off ? t("sm.cards.none") : context(mine.filter(c.match))}</p>
                  </Link>
                );
              })}
            </div>
          )}

          <LeadMeetingsToday />
          <DocReviews />
          <section className="mt-6 rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{t("sm.attention_title")}</h2>
              {!loading && <span className="text-xs text-muted-foreground">{t("sm.attention_count", { count: attention.length })}</span>}
            </div>
            {loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : attention.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("sm.attention_empty")}</p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {attention.slice(0, MAX_ITEMS).map((a) => (
                    <li key={a.task.id}>
                      <button onClick={() => openTask(a.task.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/60">
                        <span className="w-12 shrink-0 font-display text-xs font-semibold tabular-nums">{a.task.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{a.task.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {bizName(a.task.business_id)} · {firmLabel(a.task.organization_id)}
                          </span>
                        </span>
                        <span className={cn("shrink-0 text-xs", a.reason === "stale" ? "text-status-warning-fg" : "text-status-danger-fg")}>{reasonText(a)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {attention.length > MAX_ITEMS && (
                  <Link to="/tareas" search={{ attention: "1" }} className="block border-t border-border px-4 py-2.5 text-sm text-link hover:underline">
                    {t("sm.see_all", { count: attention.length })}
                  </Link>
                )}
              </>
            )}
          </section>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && openTask(undefined)}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.code}</SheetDescription>
          {selected && <TaskDetail key={selected.id} taskId={selected.id} mode="panel" onClose={() => openTask(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Document reviews of the office: Strategic Mates team work, shown like a task with a deadline. */
function DocReviews() {
  const { t } = useTranslation();
  const leadsQ = useLeads();
  const reviews = (leadsQ.data ?? []).filter((l) => l.stage === "documents" && l.intake);
  if (reviews.length === 0) return null;
  const order = { red: 0, amber: 1, ok: 2 } as const;
  reviews.sort((a, b) => order[a.intake!.clock.tone] - order[b.intake!.clock.tone] || b.intake!.clock.day - a.intake!.clock.day);
  return (
    <section className="mt-6 rounded-md border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t("intake.home_title")}</h2>
      <ul className="divide-y divide-border">
        {reviews.slice(0, MAX_ITEMS).map((l) => {
          const c = l.intake!.clock;
          const key = c.status === "paused" ? "intake.home_item_paused" : c.status === "waiting_upload" ? "intake.home_item_waiting" : "intake.home_item";
          return (
            <li key={l.id}>
              <Link to="/embudo" search={{ lead: l.id }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/60">
                <span className="min-w-0 flex-1">{t(key, { name: l.business.name, day: c.day, total: c.total })}</span>
                <ClockLabel clock={c} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
