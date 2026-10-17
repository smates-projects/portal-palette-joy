import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, FileUp, Flag, PackageCheck } from "lucide-react";
import { PROGRAM_LENGTH_DAYS, TODAY } from "@/config/app";
import {
  useAnswerOwnerRequest, useApproveTask, useBusinesses, useConfirmMeeting, useCurrentUser, useFranchisability, useMeetings,
  useOpenOwnerRequests, useOrganizations, useTasks, useUsers, useVersions,
} from "@/lib/api/hooks";
import type { OwnerRequest } from "@/lib/api/types";
import { firstName, formatDate, formatDateTime } from "@/lib/format";
import { buildAreaProgress, buildOwnerInbox, gateState, type Health, type InboxItem } from "@/lib/tasks/owner";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import { AnswerRequestDialog } from "@/components/tasks/detail/dialogs";

const MAX_ITEMS = 5;
const HEALTH_DOT: Record<Health, string> = {
  red: "bg-status-danger-fg",
  amber: "bg-status-warning-fg",
  green: "bg-status-success-fg",
  grey: "bg-status-neutral-border",
};

import { AreaSquare } from "@/components/AreaTag";
import { ExistingWorkNote } from "@/components/business/BusinessFile";
import { areaColorVar } from "@/lib/tasks/area-color";

export function OwnerHomePage({ taskId }: { taskId?: string | undefined }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const navigate = useNavigate();
  const me = useCurrentUser();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const reqQ = useOpenOwnerRequests();
  const meetQ = useMeetings();
  const versionsQ = useVersions();
  const usersQ = useUsers();
  const orgsQ = useOrganizations();
  const business = bizQ.data?.find((b) => b.id === me.data?.business_id);
  const franQ = useFranchisability(business?.id);
  const approve = useApproveTask();
  const answer = useAnswerOwnerRequest();
  const confirm = useConfirmMeeting();
  const [expanded, setExpanded] = useState(false);
  const [answering, setAnswering] = useState<{ request: OwnerRequest; code: string } | null>(null);

  const tasks = tasksQ.data ?? [];
  const selected = tasks.find((x) => x.id === taskId);
  const openTask = (id: string | undefined) => void navigate({ to: "/", search: id ? { task: id } : {}, replace: true });
  const userFirst = (id: string) => firstName(usersQ.data?.find((u) => u.id === id)?.full_name ?? "");
  const orgName = (id: string) => orgsQ.data?.find((o) => o.id === id)?.name ?? "";
  /** Firm name always with what it does: "Delta Contadores (finanzas y fiscal)". */
  const firmLabel = (id: string) => {
    const o = orgsQ.data?.find((x) => x.id === id);
    return o ? t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) }) : "";
  };
  const fail = () => toast.error(t("taskDetail.t_error"));

  const loading = tasksQ.isLoading || bizQ.isLoading || reqQ.isLoading || meetQ.isLoading || versionsQ.isLoading;
  const error = tasksQ.isError || bizQ.isError || reqQ.isError || meetQ.isError;
  const inbox = me.data ? buildOwnerInbox(tasks, reqQ.data ?? [], meetQ.data ?? [], me.data.id) : [];
  const shown = expanded ? inbox : inbox.slice(0, MAX_ITEMS);
  const areas = buildAreaProgress(tasks, versionsQ.data ?? []);
  const day = business?.program_day ?? 0;

  const when = (iso: string) => {
    const d = daysBetween(TODAY, iso);
    if (d < 0) return t("home.overdue_by", { count: -d });
    if (d === 0) return t("home.due_today");
    if (d === 1) return t("home.due_tomorrow");
    return t("home.due_in", { count: d });
  };

  const row = (it: InboxItem) => {
    const what =
      it.kind === "approve"
        ? t("owner.inbox_approve", { firm: firmLabel(it.task.organization_id) })
        : it.kind === "request"
          ? t("owner.inbox_request", { name: userFirst(it.request.requested_by_user_id), firm: firmLabel(it.task.organization_id) })
          : t("owner.inbox_meeting", { name: userFirst(it.meeting.proposed_by_user_id), date: formatDateTime(it.meeting.starts_at, lng) });
    const detail = it.kind === "request" ? it.request.question : it.kind === "meeting" ? it.meeting.topic : it.task.name;
    const Icon = it.kind === "approve" ? PackageCheck : it.kind === "request" ? FileUp : CalendarCheck;
    const action =
      it.kind === "approve" ? (
        <ActionButton
          disabled={approve.isPending}
          onClick={() => approve.mutate(it.task.id, { onSuccess: () => toast.success(t("owner.t_approved", { code: it.task.code, firm: orgName(it.task.organization_id) })), onError: fail })}
        >
          {t("owner.action_approve")}
        </ActionButton>
      ) : it.kind === "request" ? (
        <ActionButton onClick={() => setAnswering({ request: it.request, code: it.task.code })}>{t("owner.action_upload")}</ActionButton>
      ) : (
        <ActionButton
          disabled={confirm.isPending}
          onClick={() => confirm.mutate(it.meeting.id, { onSuccess: () => toast.success(t("owner.t_meeting_confirmed", { name: userFirst(it.meeting.proposed_by_user_id) })), onError: fail })}
        >
          {t("owner.action_confirm_meeting")}
        </ActionButton>
      );
    const late = it.kind !== "meeting" && it.date < TODAY;
    return (
      <li key={it.key} className="flex items-center gap-3 px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <button onClick={() => openTask(it.task.id)} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium">{what}</p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-display tabular-nums text-foreground"><AreaSquare area={it.task.area} />{it.task.code}</span> · {detail}
          </p>
        </button>
        {it.kind !== "meeting" && (
          <span className={cn("hidden shrink-0 text-xs tabular-nums sm:block", late ? "text-status-danger-fg" : "text-muted-foreground")} title={formatDate(it.date, lng)}>
            {when(it.date)}
          </span>
        )}
        <div className="shrink-0">{action}</div>
      </li>
    );
  };

  const fran = franQ.data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("owner.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("owner.home_heading")}</h1>

      {error ? (
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("owner.error")}</p>
          <button onClick={() => { void tasksQ.refetch(); void reqQ.refetch(); void meetQ.refetch(); }} className="mt-2 text-link hover:underline">{t("owner.retry")}</button>
        </div>
      ) : loading ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4"><Skeleton className="h-64 rounded-md" /><Skeleton className="h-40 rounded-md" /></div>
          <Skeleton className="h-64 rounded-md" />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            {/* 1. Your move */}
            <section className="rounded-md border border-border bg-surface">
              <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
                <h2 className="text-sm font-semibold">{t("owner.your_move")}</h2>
                {inbox.length > 0 && <span className="text-xs text-muted-foreground">{t("owner.your_move_count", { count: inbox.length })}</span>}
              </div>
              {inbox.length === 0 ? (
                <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("owner.your_move_empty")}</p>
              ) : (
                <>
                  <ul className="divide-y divide-border border-t border-border">{shown.map(row)}</ul>
                  {inbox.length > MAX_ITEMS && (
                    <button onClick={() => setExpanded((x) => !x)} className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:bg-muted">
                      {expanded ? t("owner.show_less") : t("owner.see_all", { count: inbox.length })}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* 2. Program strip */}
            <section className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">{t("owner.program")}</h2>
                <span className="font-display text-sm tabular-nums">{t("owner.day_of", { day, total: PROGRAM_LENGTH_DAYS })}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-gold" style={{ width: `${Math.min(100, (day / PROGRAM_LENGTH_DAYS) * 100)}%` }} />
              </div>
              {/* 1px gaps over the border color draw the cell borders, so the strip can wrap on narrow screens. */}
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4 lg:grid-cols-[minmax(92px,0.9fr)_repeat(6,minmax(0,1fr))_minmax(92px,0.9fr)]">
                <Gate state={gateState(day, "diagnosis")} title={t("owner.gate_diagnosis")} sub={t(`owner.gate_diagnosis_${gateState(day, "diagnosis")}`)} />
                {areas.map((a) => (
                  <button
                    key={a.area}
                    onClick={() => void navigate({ to: "/tareas", search: { area: a.area } })}
                    title={t(`owner.health_${a.health}`)}
                    className="relative min-w-0 bg-surface px-2.5 py-2.5 text-left hover:bg-muted"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: areaColorVar(a.area) }} />
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT[a.health])} />
                      <span className="font-display">{a.area}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-medium">{t(`areas.${a.area}`)}</span>
                    {a.total > 0 ? (
                      <>
                        <span className="mt-1 block font-display text-lg font-semibold tabular-nums">{a.pct}%</span>
                        <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full bg-gold" style={{ width: `${a.pct}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="mt-1 block text-[11px] text-muted-foreground">{t("owner.area_no_tasks")}</span>
                    )}
                  </button>
                ))}
                <Gate state={gateState(day, "closing")} title={t("owner.gate_closing")} sub={t(`owner.gate_closing_${gateState(day, "closing")}`)} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {(["green", "amber", "red", "grey"] as const).map((h) => (
                  <span key={h} className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[h])} />{t(`owner.health_${h}`)}</span>
                ))}
              </div>
            </section>
          </div>

          {/* 3. Franchisability */}
          <aside className="h-fit rounded-md border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{t("owner.fran_title")}</h2>
            {franQ.isLoading || !fran ? (
              <Skeleton className="mt-3 h-32" />
            ) : (
              <>
                <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{fran.franchisability_pct}%</p>
                <div className="relative mt-3 h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${fran.franchisability_pct}%` }} />
                  <span className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${fran.franchisability_goal}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                  <span>{t("owner.fran_detail")}</span>
                  <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />{t("owner.fran_goal", { goal: fran.franchisability_goal })}</span>
                </div>
                <div className={cn(
                  "mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  fran.is_ready ? "border-status-success-border bg-status-success-bg text-status-success-fg" : "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
                )}>
                  {fran.is_ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-status-warning-fg" />}
                  <div className="space-y-0.5">
                    {fran.is_ready ? (
                      <p className="font-medium">{t("owner.fran_ready")}</p>
                    ) : (
                      <>
                        <p className="font-medium">{t("owner.fran_not_ready")}</p>
                        {fran.franchisability_pct < fran.franchisability_goal && (
                          <p>{t("owner.fran_points", { count: fran.franchisability_goal - fran.franchisability_pct })}</p>
                        )}
                        {fran.missing_required.length > 0 && (
                          <p>{t("owner.fran_missing", { count: fran.missing_required.length, codes: fran.missing_required.join(", ") })}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t("owner.fran_rule")}</p>
                <ExistingWorkNote tasks={tasks} />
              </>
            )}
          </aside>
        </div>
      )}

      <AnswerRequestDialog
        open={!!answering}
        onOpenChange={(o) => !o && setAnswering(null)}
        question={answering?.request.question ?? ""}
        defaultFileName={`${answering?.code ?? ""}_${(business?.name ?? "").replace(/\s+/g, "_")}_respuesta.pdf`}
        pending={answer.isPending}
        onSubmit={(v) =>
          answering &&
          answer.mutate(
            { requestId: answering.request.id, ...v },
            { onSuccess: () => { toast.success(t("owner.t_uploaded", { name: userFirst(answering.request.requested_by_user_id) })); setAnswering(null); }, onError: fail },
          )
        }
      />

      <Sheet open={!!selected} onOpenChange={(o) => !o && openTask(undefined)}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.name}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.code}</SheetDescription>
          {selected && <TaskDetail key={selected.id} taskId={selected.id} mode="panel" onClose={() => openTask(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActionButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="inline-flex h-8 items-center rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

function Gate({ state, title, sub }: { state: "done" | "current" | "upcoming"; title: string; sub: string }) {
  return (
    <div className="min-w-0 bg-muted px-2.5 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-status-success-fg" /> : <span className={cn("h-2 w-2 rounded-full", state === "current" ? "bg-gold" : "bg-status-neutral-border")} />}
        {title}
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{sub}</span>
    </div>
  );
}
