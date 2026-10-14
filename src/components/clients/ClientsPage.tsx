import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TODAY } from "@/config/app";
import { useBusinesses, useTasks, useUsers } from "@/lib/api/hooks";
import { firstName, formatDate } from "@/lib/format";
import { buildClientSummary, type StuckLine } from "@/lib/tasks/clients";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function ClientsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const usersQ = useUsers();
  const loading = tasksQ.isLoading || bizQ.isLoading;
  const tasks = tasksQ.data ?? [];

  const stuckText = (s: StuckLine, owner: string) => {
    if (s.kind === "blocked") return t("clients.stuck_blocked", { code: s.code, by: s.by });
    if (s.kind === "waiting_owner") return t("clients.stuck_waiting", { count: s.count, name: owner });
    if (s.kind === "changes") return t("clients.stuck_changes", { code: s.code, name: owner });
    return t("clients.stuck_none");
  };
  const nextText = (iso: string) => {
    const d = daysBetween(TODAY, iso);
    return d === 0 ? t("home.due_today") : d === 1 ? t("home.due_tomorrow") : t("home.due_in", { count: d });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tasks.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("clients.heading")}</h1>

      {tasksQ.isError || bizQ.isError ? (
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("clients.error_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("tasks.error_body")}</p>
          <button onClick={() => { void tasksQ.refetch(); void bizQ.refetch(); }} className="mt-3 text-link hover:underline">
            {t("clients.retry")}
          </button>
        </div>
      ) : loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-md" />)}
        </div>
      ) : (bizQ.data ?? []).length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8 text-sm">
          <p className="font-medium">{t("clients.empty_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("clients.empty_body")}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bizQ.data!.map((b) => {
            const s = buildClientSummary(b.id, tasks);
            const owner = firstName(usersQ.data?.find((u) => u.id === b.owner_user_id)?.full_name ?? "");
            const stuck = s.stuck.kind !== "none";
            return (
              <Link
                key={b.id}
                to="/tareas"
                search={{ business: b.id }}
                className="group flex flex-col rounded-md border border-border bg-surface transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="px-5 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">{b.name}</h2>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.industry} · {b.city}, {b.state}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-xs tabular-nums text-muted-foreground">
                      {t("home.progress_day", { day: b.program_day })}
                    </span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-[2px] bg-muted">
                    <span className="block h-full bg-gold" style={{ width: `${(b.program_day / 180) * 100}%` }} />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border">
                  {([
                    ["open", s.open, ""],
                    ["overdue", s.overdue, s.overdue ? "text-status-danger-fg" : "text-muted-foreground/50"],
                    ["accepted", s.accepted, ""],
                  ] as const).map(([k, v, tone]) => (
                    <div key={k} className="px-4 py-2.5">
                      <dt className="text-[11px] text-muted-foreground">{t(`clients.${k}`)}</dt>
                      <dd className={cn("font-display text-xl font-semibold tabular-nums", tone)}>{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-1 flex-col gap-2 px-5 py-3 text-sm">
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("clients.next")}</span>
                    {s.next ? (
                      <span className="truncate text-right tabular-nums" title={formatDate(s.next.due_date, lng)}>
                        <span className="font-display font-semibold">{s.next.code}</span> · {nextText(s.next.due_date)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("clients.next_none")}</span>
                    )}
                  </p>
                  {s.stuck.kind !== "none" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (s.stuck.kind !== "none") void navigate({ to: "/tareas", search: { business: b.id, task: s.stuck.task_id } });
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-[4px] border border-status-warning-border bg-status-warning-bg px-2 py-1.5 text-left text-xs text-status-warning-fg transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span>{stuckText(s.stuck, owner)}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  ) : (
                    <p className="rounded-[4px] border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                      {stuckText(s.stuck, owner)}
                    </p>
                  )}
                </div>
                <span className="border-t border-border px-5 py-2.5 text-xs font-medium text-link group-hover:underline">
                  {t("clients.open_tasks", { name: b.name })}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
