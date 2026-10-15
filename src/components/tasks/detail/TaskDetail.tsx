import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Ban, CalendarCheck, MoreHorizontal, Pencil, CalendarClock, CheckCircle2, Circle, FileText, Lock, Maximize2, MessageSquare, PanelRight, Plus, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { TODAY } from "@/config/app";
import {
  useAddComment, useAddOwnerRequest, useAnswerOwnerRequest, useApproveTask, useBusinesses, useConfirmMeeting, useCurrentUser,
  useOrganizations, useProposeMeeting, useRequestChanges, useSetOwnerRequestResolved, useStartTask,
  useSubmitVersion, useTaskDetail, useTasks, useUsers,
} from "@/lib/api/hooks";
import type { TaskComment, TaskEvent, User, VisibleTaskStatus } from "@/lib/api/types";
import { firstName, formatDate, formatDateTime, formatShortDate } from "@/lib/format";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CancelTasksDialog, EditTasksDialog } from "@/components/tasks/sm/SmTaskActions";
import { describeChange } from "@/lib/tasks/changes";
import { Skeleton } from "@/components/ui/skeleton";
import { MentionInput, MentionText } from "./mentions";
import {
  AnswerRequestDialog, MeetingDialog, OwnerRequestDialog, PrimaryButton, RequestChangesDialog, SecondaryButton, SubmitDeliverableDialog,
} from "./dialogs";
import type { OwnerRequest } from "@/lib/api/types";
import { AreaTag } from "@/components/AreaTag";
import { areaColorVar } from "@/lib/tasks/area-color";

export type DetailMode = "panel" | "page";


/** The one task detail. Rendered inside the side panel or as the /tareas/:id page. */
export function TaskDetail({ taskId, mode, onClose, openSubmit = false, openChanges = false }: { taskId: string; mode: DetailMode; onClose?: () => void; openSubmit?: boolean; openChanges?: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const navigate = useNavigate();
  const detailQ = useTaskDetail(taskId);
  const tasksQ = useTasks();
  const usersQ = useUsers();
  const bizQ = useBusinesses();

  const start = useStartTask();
  const submit = useSubmitVersion();
  const addComment = useAddComment();
  const addRequest = useAddOwnerRequest();
  const setResolved = useSetOwnerRequestResolved();
  const propose = useProposeMeeting();
  const me = useCurrentUser();
  const orgsQ = useOrganizations();
  const approve = useApproveTask();
  const requestChanges = useRequestChanges();
  const answer = useAnswerOwnerRequest();
  const confirmMeeting = useConfirmMeeting();
  const isOwner = me.data?.role === "business_owner";
  const isSm = me.data?.role === "sm_team";
  const isFirm = me.data?.role === "partner_firm";
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(openChanges);
  const [answering, setAnswering] = useState<OwnerRequest | null>(null);

  const [submitOpen, setSubmitOpen] = useState(openSubmit);
  const [requestOpen, setRequestOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);

  const openTask = (id: string) =>
    mode === "page"
      ? navigate({ to: "/tareas/$taskId", params: { taskId: id } })
      : navigate({ to: "/tareas", search: (prev: Record<string, unknown>) => ({ ...prev, task: id }) });
  const toggleMode = () =>
    mode === "panel"
      ? navigate({ to: "/tareas/$taskId", params: { taskId } })
      : navigate({ to: "/tareas", search: { task: taskId } });

  const toolbar = (
    <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-2.5">
      {mode === "page" ? (
        <Link to="/tareas" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("taskDetail.back_to_tasks")}
        </Link>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleMode}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {mode === "panel" ? <Maximize2 className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
          {mode === "panel" ? t("taskDetail.open_full_page") : t("taskDetail.open_panel")}
        </button>
        {onClose && (
          <button onClick={onClose} aria-label={t("taskDetail.close")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  if (detailQ.isLoading || usersQ.isLoading || bizQ.isLoading) {
    return (
      <div>
        {toolbar}
        <div className="space-y-4 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  if (detailQ.isError) {
    return (
      <div>
        {toolbar}
        <div className="p-6 text-center">
          <p className="font-semibold">{t("taskDetail.load_error")}</p>
          <div className="mt-4"><PrimaryButton onClick={() => void detailQ.refetch()}>{t("taskDetail.retry")}</PrimaryButton></div>
        </div>
      </div>
    );
  }
  const detail = detailQ.data;
  if (!detail) {
    return (
      <div>
        {toolbar}
        <div className="p-10 text-center">
          <p className="font-semibold">{t("taskDetail.not_found_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("taskDetail.not_found_body")}</p>
        </div>
      </div>
    );
  }

  const { task, versions, comments, owner_requests, meetings, events } = detail;
  const users = usersQ.data ?? [];
  const userName = (id: string) => users.find((u) => u.id === id)?.full_name ?? "";
  const business = bizQ.data?.find((b) => b.id === task.business_id);
  const owner = users.find((u) => u.id === business?.owner_user_id);
  const ownerFirst = owner ? firstName(owner.full_name) : "";
  const people = users.filter(
    (u) => u.id === owner?.id || u.role === "sm_team" || u.organization_id === task.organization_id,
  );
  const deps = task.depends_on_task_ids
    .map((id) => tasksQ.data?.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x && x.status !== "accepted");
  const firstDep = deps[0];
  const openRequests = owner_requests.filter((r) => r.status === "open");
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
  const latestChanges = [...comments]
    .filter((c) => c.kind === "changes_requested")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const approvedEvent = [...events].reverse().find((e) => e.kind === "approved");
  const dueDays = daysBetween(TODAY, task.due_date);
  const dueDate = formatShortDate(task.due_date, lng);
  const status = task.status as VisibleTaskStatus;

  const fail = () => toast.error(t("taskDetail.t_error"));
  const org = orgsQ.data?.find((o) => o.id === task.organization_id);
  const firmName = org ? t("owner.firm_label", { name: org.name, what: t(`firmWhat.${org.area ?? "B1"}`) }) : "";

  // ----- Header: one primary action according to status -----
  let primary: ReactNode = null;
  const cancelled = task.status === "cancelled";
  const cancelEvent = [...events].reverse().find((e) => e.kind === "cancelled");
  if (cancelled) {
    primary = (
      <StateNote icon={<Ban className="h-4 w-4" />}>
        {t("sm.note_cancelled", {
          name: cancelEvent ? firstName(userName(cancelEvent.actor_user_id)) : "",
          reason: cancelEvent?.change?.reason ?? "",
        })}
      </StateNote>
    );
  } else if (isSm) {
    // SM runs execution: edit (reassign, due date, step) or cancel. Status moves stay with firm and owner.
    primary = (
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          {t("sm.action_edit")}
        </PrimaryButton>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("sm.more_actions")} className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface hover:bg-muted">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t("sm.action_reassign")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t("sm.action_change_due")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCancelOpen(true)} className="text-status-danger-fg">{t("sm.action_cancel_task")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  } else if (isOwner) {
    primary =
      status === "submitted" ? (
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(task.id, { onSuccess: () => toast.success(t("owner.t_approved", { code: task.code, firm: org?.name ?? "" })), onError: fail })
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("owner.action_approve")}
          </PrimaryButton>
          <SecondaryButton onClick={() => setChangesOpen(true)}>{t("owner.action_request_changes")}</SecondaryButton>
        </div>
      ) : status === "accepted" ? (
        <StateNote tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
          {t("owner.note_accepted", { date: approvedEvent ? formatShortDate(approvedEvent.created_at.slice(0, 10), lng) : "" })}
        </StateNote>
      ) : (
        <StateNote icon={task.is_blocked ? <Lock className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}>
          {task.is_blocked && firstDep
            ? t("owner.note_blocked", { code: firstDep.code })
            : t(`owner.note_${status}`, { firm: org?.name ?? "" })}
        </StateNote>
      );
  } else if (task.is_blocked && firstDep && (status === "pending" || status === "in_progress")) {
    primary = (
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton disabled>
          <Lock className="h-3.5 w-3.5" />
          {t("taskDetail.blocked_by", { code: firstDep.code })}
        </PrimaryButton>
        <button onClick={() => openTask(firstDep.id)} className="text-sm text-link hover:underline">
          {t("taskDetail.open_dep", { code: firstDep.code })}
        </button>
      </div>
    );
  } else if (status === "pending") {
    primary = (
      <PrimaryButton
        disabled={start.isPending}
        onClick={() => start.mutate(task.id, { onSuccess: () => toast.success(t("taskDetail.t_started", { code: task.code })), onError: fail })}
      >
        {t("taskDetail.action_start")}
      </PrimaryButton>
    );
  } else if (status === "in_progress" || status === "changes_requested") {
    primary = (
      <PrimaryButton onClick={() => setSubmitOpen(true)}>
        {status === "in_progress" ? t("taskDetail.action_submit") : t("taskDetail.action_resubmit")}
      </PrimaryButton>
    );
  } else if (status === "submitted") {
    primary = <StateNote icon={<CalendarClock className="h-4 w-4" />}>{t("taskDetail.waiting_approval", { name: ownerFirst })}</StateNote>;
  } else if (status === "accepted") {
    primary = (
      <StateNote tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
        {t("taskDetail.approved_by", {
          name: approvedEvent ? firstName(userName(approvedEvent.actor_user_id)) : ownerFirst,
          date: approvedEvent ? formatShortDate(approvedEvent.created_at.slice(0, 10), lng) : "",
        })}
      </StateNote>
    );
  }

  const nextLine = cancelled
    ? t("sm.next_cancelled")
    : isSm
      ? t("sm.next_line", { firm: firmName, person: userName(task.assignee_user_id), date: dueDate })
      : isOwner
    ? status === "submitted"
      ? t("owner.next_submitted")
      : status === "accepted"
        ? t("taskDetail.next_accepted")
        : t("owner.next_other", { date: dueDate })
    : task.is_blocked && firstDep && (status === "pending" || status === "in_progress")
      ? t("taskDetail.next_blocked", { name: ownerFirst, code: firstDep.code })
      : status === "pending"
        ? t("taskDetail.next_pending", { date: dueDate })
        : status === "in_progress"
          ? t("taskDetail.next_in_progress", { date: dueDate })
          : status === "changes_requested"
            ? t("taskDetail.next_changes", { name: ownerFirst, date: dueDate })
            : status === "submitted"
              ? t("taskDetail.next_submitted", { name: ownerFirst })
              : t("taskDetail.next_accepted");

  const dueLabel =
    status === "accepted" || cancelled
      ? null
      : dueDays < 0
        ? t("taskDetail.overdue_by", { count: -dueDays })
        : dueDays === 0
          ? t("taskDetail.due_today")
          : t("taskDetail.due_in", { count: dueDays });

  // ----- Activity: events + general comments in one timeline -----
  type Item = { at: string; event?: TaskEvent; comment?: TaskComment };
  const timeline: Item[] = [
    ...events.map((e) => ({ at: e.created_at, event: e })),
    ...comments.filter((c) => c.kind === "comment" && !c.file_id).map((c) => ({ at: c.created_at, comment: c })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className={cn(mode === "page" && "rounded-md border border-border bg-surface")}>
      {toolbar}
      <div className={cn("space-y-8 px-6 py-6", mode === "page" && "px-8")}>
        {/* 1. Header */}
        <header className="relative pl-3">
          <span className="absolute inset-y-0 left-0 w-[3px] rounded" style={{ backgroundColor: areaColorVar(task.area) }} />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-display font-semibold text-foreground">{task.code}</span>
            <span>·</span>
            <span>{business?.name}</span>
            <span>·</span>
            <AreaTag area={task.area} variant="name" />
            <span>·</span>
            <span>{t(`steps.${task.step}`)}</span>
          </p>
          <h2 className="mt-1.5 text-xl font-semibold leading-snug tracking-tight">{task.name}</h2>
          <div className="mt-3 flex flex-col items-start gap-1.5 text-sm">
            <StatusBadge status={cancelled ? "cancelled" : status} />
            {openRequests.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(`task-requests-${task.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="inline-flex items-center rounded-[4px] border border-status-warning-border bg-status-warning-bg px-1.5 py-0.5 text-xs font-medium text-status-warning-fg transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("taskDetail.waiting_owner", { count: openRequests.length })}
              </button>
            )}
            <span className={cn("tabular-nums", task.is_overdue ? "text-status-danger-fg" : "text-muted-foreground")} title={formatDate(task.due_date, lng)}>
              {t("taskDetail.due", { date: dueDate })}
              {dueLabel && ` · ${dueLabel}`}
            </span>
          </div>
          <div className="mt-4">{primary}</div>
          <p className="mt-3 text-sm text-foreground">{nextLine}</p>
        </header>

        {/* 2. What needs to be done */}
        <Section title={t("taskDetail.s_what")}>
          <p className="text-sm text-muted-foreground">
            {t("taskDetail.what_intro", { area: t(`areas.${task.area}`), step: t(`steps.${task.step}`).toLowerCase() })}
          </p>
          <div className="mt-3 rounded-md border border-accent bg-accent/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">{t(isOwner ? "owner.criteria_title" : "taskDetail.criteria_title")}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{task.acceptance_criteria}</p>
            {isSm && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t("sm.catalog_note")}</p>}
          </div>
        </Section>

        {/* 3. Deliverables */}
        <Section title={t("taskDetail.s_deliverables")}>
          {sortedVersions.length === 0 ? (
            <Empty>{t("taskDetail.no_versions", { name: ownerFirst })}</Empty>
          ) : (
            <ol className="space-y-3">
              {sortedVersions.map((v) => {
                const review = comments.find((c) => c.id === v.review_comment_id);
                return (
                  <li key={v.id} className="rounded-md border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold">v{v.version}</span>
                        <span className="text-xs text-muted-foreground" title={formatDateTime(v.submitted_at, lng)}>
                          {userName(v.submitted_by_user_id)} · {formatShortDate(v.submitted_at.slice(0, 10), lng)}
                        </span>
                      </div>
                      <VersionBadge status={v.status} ownerFirst={ownerFirst} />
                    </div>
                    <div className="space-y-3 px-4 py-3">
                      {v.note && <p className="text-sm">{v.note}</p>}
                      {review && (
                        <blockquote className="rounded-md border-l-2 border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm">
                          <span className="font-medium text-status-warning-fg">{firstName(userName(review.author_user_id))}: </span>
                          “{review.body}”
                        </blockquote>
                      )}
                      <ul className="space-y-2">
                        {v.files.map((f) => (
                          <FileRow
                            key={f.id}
                            name={f.name}
                            sizeKb={f.size_kb}
                            comments={comments.filter((c) => c.file_id === f.id)}
                            people={people}
                            userName={userName}
                            lng={lng}
                            pending={addComment.isPending}
                            onComment={(body, done) =>
                              addComment.mutate(
                                { id: task.id, body, file_id: f.id },
                                { onSuccess: () => { toast.success(t("taskDetail.t_comment")); done(); }, onError: fail },
                              )
                            }
                          />
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        {/* 4. Requests to the owner */}
        <Section
          id={`task-requests-${task.id}`}
          title={t("taskDetail.s_requests")}
          action={!isFirm || cancelled ? undefined : <SecondaryButton onClick={() => setRequestOpen(true)}><Plus className="h-3.5 w-3.5" />{t("taskDetail.ask_owner")}</SecondaryButton>}
        >
          {owner_requests.length === 0 ? (
            <Empty>{t("taskDetail.requests_empty")}</Empty>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {[...owner_requests].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved")).map((r) => {
                const resolved = r.status === "resolved";
                const toggle = (to: boolean) =>
                  setResolved.mutate(
                    { requestId: r.id, resolved: to },
                    {
                      onSuccess: () =>
                        toast.success(to ? t("taskDetail.t_resolved") : t("taskDetail.t_reopened"), {
                          action: { label: t("taskDetail.undo"), onClick: () => setResolved.mutate({ requestId: r.id, resolved: !to }) },
                        }),
                      onError: fail,
                    },
                  );
                return (
                  <li key={r.id} className="flex gap-3 px-4 py-3">
                    {resolved ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success-fg" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", resolved && "text-muted-foreground line-through")}>{r.question}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {resolved && r.resolved_at
                          ? t("taskDetail.resolved_on", { date: formatShortDate(r.resolved_at.slice(0, 10), lng) })
                          : t("taskDetail.request_due", { date: formatShortDate(r.due_date, lng) })}
                      </p>
                      {r.answer && (
                        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
                          <span className="text-xs font-medium text-muted-foreground">{t("taskDetail.owner_answer", { name: ownerFirst })}: </span>
                          {r.answer}
                        </p>
                      )}
                    </div>
                    {isOwner ? (
                      !resolved && <SecondaryButton onClick={() => setAnswering(r)}>{t("owner.action_upload")}</SecondaryButton>
                    ) : isSm ? null : (
                      <button onClick={() => toggle(!resolved)} className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-link hover:bg-muted">
                        {resolved ? t("taskDetail.reopen") : t("taskDetail.mark_resolved")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* 5. Meetings */}
        <Section
          title={t("taskDetail.s_meetings")}
          action={!isFirm || cancelled ? undefined : <SecondaryButton onClick={() => setMeetingOpen(true)}><Plus className="h-3.5 w-3.5" />{t("taskDetail.propose_meeting")}</SecondaryButton>}
        >
          {meetings.length === 0 ? (
            <Empty>{t("taskDetail.meetings_empty", { name: ownerFirst })}</Empty>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {[...meetings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  {m.status === "confirmed" ? <CalendarCheck className="mt-0.5 h-4 w-4 text-status-success-fg" /> : <CalendarClock className="mt-0.5 h-4 w-4 text-status-warning-fg" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.topic}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(m.starts_at, lng)} · {t("taskDetail.minutes", { count: m.duration_minutes })}
                    </p>
                    {m.status === "confirmed" && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-link"><Video className="h-3 w-3" />{t("taskDetail.m_calendar")}</p>
                    )}
                    {m.status === "proposed" && !isOwner && <p className="mt-1 text-xs text-muted-foreground">{t("taskDetail.m_proposed_hint", { name: ownerFirst })}</p>}
                    {m.status === "proposed" && isOwner && m.proposed_by_user_id !== me.data?.id && (
                      <div className="mt-2">
                        <SecondaryButton
                          onClick={() =>
                            confirmMeeting.mutate(m.id, {
                              onSuccess: () => toast.success(t("owner.t_meeting_confirmed", { name: firstName(userName(m.proposed_by_user_id)) })),
                              onError: fail,
                            })
                          }
                        >
                          <CalendarCheck className="h-3.5 w-3.5" />
                          {t("owner.action_confirm_meeting")}
                        </SecondaryButton>
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-[4px] border px-1.5 py-0.5 text-xs font-medium",
                      m.status === "confirmed"
                        ? "border-status-success-border bg-status-success-bg text-status-success-fg"
                        : m.status === "proposed"
                          ? "border-status-warning-border bg-status-warning-bg text-status-warning-fg"
                          : "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
                    )}
                  >
                    {t(m.status === "confirmed" ? "taskDetail.m_confirmed" : m.status === "proposed" ? "taskDetail.m_proposed" : "taskDetail.m_cancelled")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 6. Activity */}
        <Section title={t("taskDetail.s_activity")}>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {timeline.map((item) => (
              <li key={item.event?.id ?? item.comment?.id} className="relative">
                <span className={cn("absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-surface", item.comment ? "bg-link" : "bg-muted-foreground/60")} />
                {item.event ? (
                  <EventLine event={item.event} comments={comments} userName={userName} lng={lng} />
                ) : item.comment ? (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{userName(item.comment.author_user_id)}</span> · {formatDateTime(item.comment.created_at, lng)}
                    </p>
                    <p className="mt-1 text-sm"><MentionText body={item.comment.body} people={people} /></p>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <CommentBox
            people={people}
            pending={addComment.isPending}
            onSubmit={(body, done) =>
              addComment.mutate({ id: task.id, body, file_id: null }, { onSuccess: () => { toast.success(t("taskDetail.t_comment")); done(); }, onError: fail })
            }
          />
        </Section>
      </div>

      {isSm && editOpen && <EditTasksDialog open onOpenChange={setEditOpen} tasks={[task]} mode="all" />}
      {isSm && <CancelTasksDialog open={cancelOpen} onOpenChange={setCancelOpen} tasks={[task]} />}
      <SubmitDeliverableDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        nextVersion={task.current_version + 1}
        isResubmit={status === "changes_requested"}
        defaultFileName={`${task.code}_${(business?.name ?? "").replace(/\s+/g, "_")}_v${task.current_version + 1}.pdf`}
        ownerName={ownerFirst}
        changesQuote={status === "changes_requested" ? latestChanges?.body ?? null : null}
        pending={submit.isPending}
        onSubmit={(v) =>
          submit.mutate(
            { id: task.id, ...v },
            {
              onSuccess: (ver) => {
                setSubmitOpen(false);
                toast.success(t("taskDetail.t_submitted", { version: ver.version, code: task.code, name: ownerFirst }));
              },
              onError: fail,
            },
          )
        }
      />
      <RequestChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        firmName={firmName}
        pending={requestChanges.isPending}
        onSubmit={(note) =>
          requestChanges.mutate(
            { id: task.id, note },
            { onSuccess: () => { setChangesOpen(false); toast.success(t("owner.t_changes", { code: task.code, firm: org?.name ?? "" })); }, onError: fail },
          )
        }
      />
      <AnswerRequestDialog
        open={!!answering}
        onOpenChange={(o) => !o && setAnswering(null)}
        question={answering?.question ?? ""}
        defaultFileName={`${task.code}_${(business?.name ?? "").replace(/\s+/g, "_")}_respuesta.pdf`}
        pending={answer.isPending}
        onSubmit={(v) =>
          answering &&
          answer.mutate(
            { requestId: answering.id, ...v },
            { onSuccess: () => { setAnswering(null); toast.success(t("owner.t_uploaded", { name: firstName(userName(answering.requested_by_user_id)) })); }, onError: fail },
          )
        }
      />
      <OwnerRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        pending={addRequest.isPending}
        onSubmit={(v) =>
          addRequest.mutate({ id: task.id, ...v }, { onSuccess: () => { setRequestOpen(false); toast.success(t("taskDetail.t_request", { name: ownerFirst })); }, onError: fail })
        }
      />
      <MeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        pending={propose.isPending}
        onSubmit={(v) =>
          propose.mutate({ id: task.id, ...v }, { onSuccess: () => { setMeetingOpen(false); toast.success(t("taskDetail.t_meeting", { name: ownerFirst })); }, onError: fail })
        }
      />
    </div>
  );
}

function Section({ id, title, action, children }: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>;
}

function StateNote({ children, icon, tone }: { children: ReactNode; icon: ReactNode; tone?: "success" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
        tone === "success"
          ? "border-status-success-border bg-status-success-bg text-status-success-fg"
          : "border-status-review-border bg-status-review-bg text-status-review-fg",
      )}
    >
      {icon}
      {children}
    </p>
  );
}

function VersionBadge({ status, ownerFirst }: { status: string; ownerFirst: string }) {
  const { t } = useTranslation();
  const map = {
    submitted: ["border-status-review-border bg-status-review-bg text-status-review-fg", t("taskDetail.v_submitted")],
    changes_requested: ["border-status-warning-border bg-status-warning-bg text-status-warning-fg", t("taskDetail.v_changes", { name: ownerFirst })],
    accepted: ["border-status-success-border bg-status-success-bg text-status-success-fg", t("taskDetail.v_accepted")],
  } as const;
  const [cls, label] = map[status as keyof typeof map];
  return <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

function EventLine({ event, comments, userName, lng }: { event: TaskEvent; comments: TaskComment[]; userName: (id: string) => string; lng: string }) {
  const { t } = useTranslation();
  const name = userName(event.actor_user_id);
  const { i18n } = useTranslation();
  if (event.change) {
    return (
      <div>
        <p className="text-sm">
          {describeChange(event.change, firstName(name), t, i18n.language)}
          <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(event.created_at, lng)}</span>
        </p>
        {event.change.reason && (
          <blockquote className="mt-1.5 rounded-md border-l-2 border-border bg-muted px-3 py-2 text-sm">“{event.change.reason}”</blockquote>
        )}
      </div>
    );
  }
  const keys: Record<string, string> = { assigned: "e_assigned", started: "e_started", submitted: "e_submitted", changes_requested: "e_changes", approved: "e_approved" };
  const key = keys[event.kind];
  const quote = event.comment_id ? comments.find((c) => c.id === event.comment_id) : null;
  return (
    <div>
      <p className="text-sm">
        {t(`taskDetail.${key}`, { name, version: event.version })}
        <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(event.created_at, lng)}</span>
      </p>
      {quote && (
        <blockquote className="mt-1.5 rounded-md border-l-2 border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm">“{quote.body}”</blockquote>
      )}
    </div>
  );
}

function FileRow(props: {
  name: string;
  sizeKb: number;
  comments: TaskComment[];
  people: User[];
  userName: (id: string) => string;
  lng: string;
  pending: boolean;
  onComment: (body: string, done: () => void) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(props.comments.length > 0);
  const [text, setText] = useState("");
  const send = () => text.trim() && props.onComment(text.trim(), () => setText(""));
  return (
    <li className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{props.name}</span>
        <span className="font-display text-xs tabular-nums text-muted-foreground">{props.sizeKb >= 1024 ? `${(props.sizeKb / 1024).toFixed(1)} MB` : `${props.sizeKb} KB`}</span>
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-link hover:bg-muted">
          <MessageSquare className="h-3 w-3" />
          {props.comments.length ? t("taskDetail.file_comments", { count: props.comments.length }) : t("taskDetail.comment_file")}
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {props.comments.map((c) => (
            <div key={c.id}>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{props.userName(c.author_user_id)}</span> · {formatDateTime(c.created_at, props.lng)}
              </p>
              <p className="mt-0.5 text-sm"><MentionText body={c.body} people={props.people} /></p>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MentionInput
                value={text}
                onChange={setText}
                people={props.people}
                rows={1}
                label={t("taskDetail.comment_file")}
                placeholder={t("taskDetail.comment_placeholder")}
                mentionLabel={t("taskDetail.mention_people")}
                onSubmit={send}
              />
            </div>
            <SecondaryButton onClick={send}>{t("taskDetail.send_comment")}</SecondaryButton>
          </div>
        </div>
      )}
    </li>
  );
}

function CommentBox({ people, pending, onSubmit }: { people: User[]; pending: boolean; onSubmit: (body: string, done: () => void) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const send = () => text.trim() && !pending && onSubmit(text.trim(), () => setText(""));
  return (
    <div className="mt-5 space-y-2">
      <MentionInput
        value={text}
        onChange={setText}
        people={people}
        rows={3}
        label={t("taskDetail.send_comment")}
        placeholder={t("taskDetail.comment_placeholder")}
        mentionLabel={t("taskDetail.mention_people")}
        onSubmit={send}
      />
      <div className="flex justify-end">
        <PrimaryButton disabled={!text.trim() || pending} onClick={send}>{t("taskDetail.send_comment")}</PrimaryButton>
      </div>
    </div>
  );
}
