import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TODAY } from "@/config/app";
import type { AreaCode, Business, TaskWithComputed, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import {
  MILESTONE_DAYS,
  PX_PER_DAY,
  ZOOMS,
  addDays,
  barGeometry,
  buildRoadmapRows,
  programDay,
  zoomRange,
  type Zoom,
} from "@/lib/tasks/roadmap";
import { daysBetween } from "@/lib/tasks/table";
import { cn } from "@/lib/utils";

const LABEL_W = 280;
const ROW_H = 32;
const HEAD_H = 44;

const BAR: Record<VisibleTaskStatus, string> = {
  pending: "bg-status-neutral-bg border-status-neutral-border",
  in_progress: "bg-status-info-bg border-status-info-border",
  submitted: "bg-status-review-bg border-status-review-border",
  changes_requested: "bg-status-warning-bg border-status-warning-border",
  accepted: "bg-status-success-bg border-status-success-border",
};
const AREA_DOT: Record<AreaCode, string> = {
  B1: "bg-area-b1", B2: "bg-area-b2", B3: "bg-area-b3", B4: "bg-area-b4", B5: "bg-area-b5", B6: "bg-area-b6",
};

export function TaskRoadmap(props: {
  rows: TaskWithComputed[];
  allTasks: TaskWithComputed[];
  businesses: Business[];
  selectedId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const locale = lng === "en" ? "en-US" : "es-AR";
  const [zoom, setZoom] = useState<Zoom>("month");
  const scroller = useRef<HTMLDivElement>(null);

  const ppd = PX_PER_DAY[zoom];
  const range = useMemo(() => zoomRange(zoom, props.businesses, props.allTasks), [zoom, props.businesses, props.allTasks]);
  const days = daysBetween(range.start, range.end) + 1;
  const width = days * ppd;
  const x = (iso: string) => daysBetween(range.start, iso) * ppd;
  const rows = useMemo(() => buildRoadmapRows(props.rows, props.businesses), [props.rows, props.businesses]);
  const height = rows.length * ROW_H;

  // Keep "today" in view when the zoom changes.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(TODAY) - (el.clientWidth - LABEL_W) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, range.start]);

  // Header ticks: days (week), Mondays (month), first of month (program). Top line marks month changes.
  const ticks = useMemo(() => {
    const out: { x: number; label: string; major?: string }[] = [];
    let prevMonth = "";
    for (let i = 0; i < days; i++) {
      const d = addDays(range.start, i);
      const date = new Date(`${d}T12:00:00`);
      const isMon = date.getDay() === 1;
      const isFirst = d.endsWith("-01");
      const show = zoom === "week" || (zoom === "month" && isMon) || (zoom === "program" && isFirst);
      if (!show) continue;
      const month = d.slice(0, 7);
      const major =
        zoom !== "program" && month !== prevMonth
          ? (() => {
              const m = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
              return m.charAt(0).toUpperCase() + m.slice(1);
            })()
          : undefined;
      prevMonth = month;
      const label =
        zoom === "week"
          ? new Intl.DateTimeFormat(locale, { weekday: "narrow", day: "numeric" }).format(date)
          : zoom === "month"
            ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date)
            : new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(date);
      out.push({ x: i * ppd, label, ...(major ? { major } : {}) });
    }
    return out;
  }, [days, range.start, zoom, ppd, locale]);

  // Row index by task id, for dependency arrows.
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "task" && rowOf.set(r.task.id, i));
  const codeById = (id: string) => props.allTasks.find((x) => x.id === id)?.code ?? "";
  const arrows = rows.flatMap((r, i) => {
    if (r.kind !== "task") return [];
    return r.task.depends_on_task_ids.flatMap((depId) => {
      const j = rowOf.get(depId);
      const dep = props.allTasks.find((x) => x.id === depId);
      if (j === undefined || !dep) return [];
      const g = barGeometry(dep, range.start, ppd);
      const x1 = g.left + g.width;
      const y1 = j * ROW_H + ROW_H / 2;
      const x2 = barGeometry(r.task, range.start, ppd).left;
      const y2 = i * ROW_H + ROW_H / 2;
      const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8));
      const path = `M${x1},${y1} H${mid} V${y2} H${x2 - 2}`;
      // All current dependencies block. "Recommended input" (dashed) will come with its data.
      return [{ key: `${depId}-${r.task.id}`, path, dashed: false, active: dep.status !== "accepted" }];
    });
  });

  const todayX = x(TODAY);
  const todayVisible = TODAY >= range.start && TODAY <= range.end;

  if (rows.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div role="radiogroup" aria-label={t("tasks.roadmap.zoom")} className="flex rounded-md border border-border bg-surface p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z}
              role="radio"
              aria-checked={zoom === z}
              onClick={() => setZoom(z)}
              className={cn(
                "h-7 rounded-[4px] px-2.5 text-xs transition-colors",
                zoom === z ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`tasks.roadmap.zoom_${z}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-foreground/60" />{t("tasks.roadmap.legend_blocks")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-foreground/60" />{t("tasks.roadmap.legend_input")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="bar-blocked h-2.5 w-5 rounded-[2px] border border-status-danger-border" />{t("tasks.roadmap.legend_blocked")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-gold" />{t("tasks.roadmap.legend_milestone")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-status-danger-fg" />{t("tasks.roadmap.legend_today")}</span>
        </div>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border bg-surface">
        <div className="relative" style={{ width: LABEL_W + width, height: HEAD_H + height }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-muted" style={{ height: HEAD_H, width: LABEL_W + width }}>
            <div className="sticky left-0 z-10 flex items-end border-r border-border bg-muted px-4 pb-1.5 text-xs font-medium text-muted-foreground" style={{ width: LABEL_W, minWidth: LABEL_W }}>
              {t("tasks.roadmap.task_col")}
            </div>
            <div className="relative" style={{ width }}>
              {ticks.map((tk) => (
                <div key={tk.x} className="absolute inset-y-0" style={{ left: tk.x }}>
                  {tk.major && <span className="absolute top-1 left-1 whitespace-nowrap text-[11px] font-medium text-foreground">{tk.major}</span>}
                  <span className="absolute bottom-1.5 left-1 whitespace-nowrap font-display text-[11px] tabular-nums text-muted-foreground">{tk.label}</span>
                  <span className="absolute bottom-0 h-1.5 w-px bg-border" />
                </div>
              ))}
              {todayVisible && (
                <span className="absolute bottom-0 h-2 w-[2px] -translate-x-1/2 bg-status-danger-fg" style={{ left: todayX + ppd / 2 }} />
              )}
            </div>
          </div>

          {/* Grid lines */}
          <div className="pointer-events-none absolute" style={{ left: LABEL_W, top: HEAD_H, width, height }}>
            {ticks.map((tk) => (
              <span key={tk.x} className="absolute inset-y-0 w-px bg-border/60" style={{ left: tk.x }} />
            ))}
          </div>

          {/* Rows */}
          {rows.map((r, i) => {
            const top = HEAD_H + i * ROW_H;
            if (r.kind === "business") {
              const b = r.business;
              return (
                <div key={`b-${b.id}`} className="absolute flex border-b border-border bg-muted/50" style={{ top, height: ROW_H, width: LABEL_W + width }}>
                  <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-border bg-muted px-4 text-sm font-semibold" style={{ width: LABEL_W, minWidth: LABEL_W }}>
                    <span className="truncate">{b.name}</span>
                    <span className="ml-auto shrink-0 font-display text-[11px] font-normal tabular-nums text-muted-foreground">
                      {t("home.progress_day", { day: b.program_day })}
                    </span>
                  </div>
                  <div className="relative" style={{ width }}>
                    {MILESTONE_DAYS.map((m) => {
                      const d = programDay(b, m.day);
                      if (d < range.start || d > range.end) return null;
                      const label = t(`tasks.roadmap.m_${m.key}`, { day: m.day, date: formatDate(d, lng) });
                      return (
                        <div key={m.key} className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5" style={{ left: x(d) + ppd / 2 - 5 }} title={label}>
                          <span className="h-2.5 w-2.5 rotate-45 border border-gold-dark bg-gold" />
                          {zoom !== "program" && <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t(`tasks.roadmap.m_short_${m.key}`)}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (r.kind === "area") {
              return (
                <div key={`a-${r.business_id}-${r.area}`} className="absolute flex border-b border-border" style={{ top, height: ROW_H, width: LABEL_W + width }}>
                  <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-border bg-surface px-4 pl-6 text-xs font-medium text-muted-foreground" style={{ width: LABEL_W, minWidth: LABEL_W }}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", AREA_DOT[r.area])} />
                    {r.area} · {t(`areas.${r.area}`)}
                    <span className="ml-1 font-display tabular-nums">{r.count}</span>
                  </div>
                </div>
              );
            }
            const task = r.task;
            const g = barGeometry(task, range.start, ppd);
            const blocked = task.is_blocked && task.status !== "accepted";
            const tip = [
              `${task.code} · ${task.name}`,
              `${formatDate(task.start_date, lng)} → ${formatDate(task.due_date, lng)}`,
              t(`status.${task.status}`),
              blocked ? t("tasks.blocked_by", { codes: task.depends_on_task_ids.map(codeById).join(", ") }) : "",
            ].filter(Boolean).join("\n");
            return (
              <div key={task.id} className={cn("absolute flex border-b border-border/60", props.selectedId === task.id && "bg-accent/40")} style={{ top, height: ROW_H, width: LABEL_W + width }}>
                <button
                  onClick={() => props.onOpen(task.id)}
                  className="sticky left-0 z-10 flex items-center gap-2 border-r border-border bg-surface px-4 pl-9 text-left text-xs hover:bg-muted"
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                >
                  <span className="shrink-0 font-display font-semibold tabular-nums">{task.code}</span>
                  <span className="truncate">{task.name}</span>
                </button>
                <div className="relative" style={{ width }}>
                  <button
                    onClick={() => props.onOpen(task.id)}
                    title={tip}
                    aria-label={tip}
                    className={cn(
                      "absolute top-1.5 z-[5] flex h-5 items-center overflow-hidden rounded-[4px] border px-1.5 text-left text-[11px] font-medium text-foreground transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      BAR[task.status as VisibleTaskStatus],
                      blocked && "bar-blocked border-status-danger-border",
                      task.is_overdue && "ring-1 ring-status-danger-fg",
                    )}
                    style={{ left: g.left, width: g.width }}
                  >
                    {g.width > 40 && <span className="truncate font-display tabular-nums">{task.code}</span>}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Dependency arrows */}
          <svg className="pointer-events-none absolute z-[6]" style={{ left: LABEL_W, top: HEAD_H }} width={width} height={height}>
            <defs>
              <marker id="rm-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" className="fill-foreground/60" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path
                key={a.key}
                d={a.path}
                fill="none"
                strokeWidth={1.25}
                strokeDasharray={a.dashed ? "4 3" : undefined}
                markerEnd="url(#rm-arrow)"
                className={a.active ? "stroke-foreground/60" : "stroke-foreground/25"}
              />
            ))}
          </svg>

          {/* Today */}
          {todayVisible && (
            <div className="pointer-events-none absolute z-[7] w-[2px] -translate-x-1/2 bg-status-danger-fg/70" style={{ left: LABEL_W + todayX + ppd / 2, top: HEAD_H, height }}>
              <span className="absolute -top-0 left-1 rounded-[3px] bg-status-danger-fg px-1 text-[10px] font-medium leading-4 text-primary-foreground">
                {t("tasks.roadmap.today")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
