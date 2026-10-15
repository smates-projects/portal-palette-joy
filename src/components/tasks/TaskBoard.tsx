import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TODAY } from "@/config/app";
import { useApproveTask, useCurrentUser, useStartTask, useUnstartTask } from "@/lib/api/hooks";
import type { TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate, formatRelativeDate } from "@/lib/format";
import { BOARD_COLUMNS, resolveBoardMove } from "@/lib/tasks/board";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";
import { AreaSquare } from "@/components/AreaTag";
import { areaColorVar } from "@/lib/tasks/area-color";
import { StatusBadge, TASK_STATUS_LOOK } from "@/components/StatusBadge";

export function TaskBoard(props: {
  rows: TaskWithComputed[];
  selectedId: string | undefined;
  businessName: (id: string) => string;
  codeById: (id: string) => string;
  onOpen: (id: string) => void;
  onSubmit: (id: string) => void;
  /** Owner: dropping on "Cambios pedidos" opens the request-changes dialog. */
  onRequestChanges?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const me = useCurrentUser();
  const start = useStartTask();
  const unstart = useUnstartTask();
  const approve = useApproveTask();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<VisibleTaskStatus | null>(null);

  const drop = (to: VisibleTaskStatus, id: string | null = dragId) => {
    const task = props.rows.find((r) => r.id === id);
    setDragId(null);
    setOver(null);
    if (!task || !me.data) return;
    const move = resolveBoardMove(task, to, me.data.role);
    if (!move.ok) {
      if (move.reason !== "same")
        toast.error(
          t(`tasks.board.no_${move.reason}`, {
            code: task.code,
            to: t(`status.${to}`),
            by: task.depends_on_task_ids.map(props.codeById).join(", "),
          }),
        );
      return;
    }
    const fail = () => toast.error(t("taskDetail.t_error"));
    if (move.action === "start")
      start.mutate(task.id, {
        onSuccess: () =>
          toast.success(t("taskDetail.t_started", { code: task.code }), {
            action: { label: t("profile.undo"), onClick: () => unstart.mutate(task.id, { onError: fail }) },
          }),
        onError: fail,
      });
    else if (move.action === "unstart")
      unstart.mutate(task.id, {
        onSuccess: () =>
          toast.success(t("tasks.board.t_unstarted", { code: task.code }), {
            action: { label: t("profile.undo"), onClick: () => start.mutate(task.id, { onError: fail }) },
          }),
        onError: fail,
      });
    else if (move.action === "approve")
      approve.mutate(task.id, { onSuccess: () => toast.success(t("owner.t_approved_short", { code: task.code })), onError: fail });
    else if (move.action === "request_changes") props.onRequestChanges?.(task.id);
    else props.onSubmit(task.id);
  };

  return (
    <div className="grid min-h-0 flex-1 auto-cols-[minmax(188px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {BOARD_COLUMNS.map((col) => {
        const items = props.rows.filter((r) => r.status === col);
        return (
          <section
            key={col}
            aria-label={t(`status.${col}`)}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col ? null : o));
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(col);
            }}
            className={cn(
              "flex min-h-0 flex-col rounded-md border border-border bg-muted/40 transition-colors",
              over === col && "border-ring bg-accent/50",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn("h-2 w-2 rounded-[2px]", TASK_STATUS_LOOK[col].solid)} />
              <h3 className="truncate text-xs font-semibold">{t(`tasks.board.col_${col}`)}</h3>
              <span className="ml-auto font-display text-xs tabular-nums text-muted-foreground">{items.length}</span>
            </header>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {items.length === 0 && (
                <li className="rounded-[4px] border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("tasks.board.empty_column")}
                </li>
              )}
              {items.map((task) => (
                <li
                  key={task.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(task.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", task.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => props.onOpen(task.id)}
                  aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
                  aria-description={t("tasks.board.keyboard_hint")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onOpen(task.id); return; }
                    // Keyboard alternative to dragging: Shift + arrow moves to the next/previous column.
                    if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
                      e.preventDefault();
                      const to = BOARD_COLUMNS[BOARD_COLUMNS.indexOf(col) + (e.key === "ArrowRight" ? 1 : -1)];
                      if (to) drop(to, task.id);
                    }
                  }}
                  tabIndex={0}
                  style={{ borderLeftColor: areaColorVar(task.area), borderLeftWidth: 4 }}
                  className={cn(
                    "cursor-grab rounded-[4px] border border-border bg-surface px-3 py-2.5 outline-none transition-[border-color,opacity] hover:border-ring focus-visible:border-ring active:cursor-grabbing",
                    props.selectedId === task.id && "border-ring",
                    dragId === task.id && "opacity-40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-display text-xs font-semibold tabular-nums">
                      <AreaSquare area={task.area} />
                      {task.code}
                    </span>
                    <span
                      className={cn("text-xs tabular-nums", task.is_overdue ? "text-status-danger-fg" : "text-muted-foreground")}
                      title={formatDate(task.due_date, lng)}
                    >
                      {task.is_overdue
                        ? t("tasks.overdue_days", { count: daysBetween(task.due_date, TODAY) })
                        : formatRelativeDate(task.due_date, lng)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug">{task.name}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{props.businessName(task.business_id)}</span>
                    {task.is_blocked && task.status !== "accepted" && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-status-danger-fg">
                        <StatusBadge status="blocked" className="text-[10px]" />
                        {task.depends_on_task_ids.map(props.codeById).join(", ")}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
