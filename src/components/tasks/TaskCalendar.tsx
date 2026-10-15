import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { TODAY } from "@/config/app";
import { localeTag } from "@/lib/format";
import { useCalendarEvents, useMeetings } from "@/lib/api/hooks";
import type { TaskWithComputed } from "@/lib/api/types";
import { CAL_MODES, buildCalendarItems, monthGrid, shiftAnchor, weekDays, type CalItem, type CalMode } from "@/lib/tasks/calendar";
import { cn } from "@/lib/utils";
import { AreaLegend, areaAccentStyle } from "@/components/AreaTag";
import { AREAS } from "@/lib/tasks/owner";

const MONTH_MAX = 3;

export function TaskCalendar(props: {
  rows: TaskWithComputed[];
  businessName: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = localeTag(i18n.language);
  const [mode, setMode] = useState<CalMode>("month");
  const [anchor, setAnchor] = useState(TODAY);
  const meetingsQ = useMeetings();
  const eventsQ = useCalendarEvents();

  const items = useMemo(
    () => buildCalendarItems(props.rows, meetingsQ.data ?? [], eventsQ.data ?? []),
    [props.rows, meetingsQ.data, eventsQ.data],
  );
  const days = mode === "month" ? monthGrid(anchor) : weekDays(anchor);
  const fmt = (o: Intl.DateTimeFormatOptions, iso: string) =>
    new Intl.DateTimeFormat(locale, o).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const title =
    mode === "month"
      ? cap(fmt({ month: "long", year: "numeric" }, anchor))
      : `${fmt({ day: "numeric", month: "short" }, days[0]!)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }, days[6]!)}`;
  const time = (iso: string) => fmt({ hour: "2-digit", minute: "2-digit" }, iso);

  const Item = ({ it, compact }: { it: CalItem; compact: boolean }) => {
    const base = "flex w-full min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 text-left text-[11px] leading-5";
    if (it.kind === "google")
      return (
        <div
          title={`${it.event.title} · ${time(it.at)} · ${t("tasks.calendar.google_readonly")}`}
          className={cn(base, "cursor-default border border-border bg-muted text-muted-foreground")}
        >
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span className="shrink-0 whitespace-nowrap tabular-nums">{time(it.at)}</span>
          <span className="truncate">{compact ? it.event.title : `${t("tasks.calendar.google_label")} · ${it.event.title}`}</span>
        </div>
      );
    if (it.kind === "meeting") {
      const proposed = it.meeting.status === "proposed";
      return (
        <button
          onClick={() => props.onOpen(it.task.id)}
          title={`${it.meeting.topic} · ${time(it.at)} · ${t(`tasks.calendar.meeting_${it.meeting.status}`)} · ${it.task.code} ${props.businessName(it.task.business_id)}`}
          className={cn(base, "border border-border text-foreground hover:brightness-95", proposed && "border-dashed")}
          style={areaAccentStyle(it.task.area)}
        >
          <span className="shrink-0 whitespace-nowrap tabular-nums">{time(it.at)}</span>
          <span className="truncate">{compact ? `${it.task.area} · ${it.meeting.topic}` : `${it.task.code} · ${it.meeting.topic}`}</span>
        </button>
      );
    }
    const overdue = it.task.is_overdue;
    return (
      <button
        onClick={() => props.onOpen(it.task.id)}
        title={`${t("tasks.calendar.due")}: ${it.task.code} ${it.task.name} · ${props.businessName(it.task.business_id)}`}
        className={cn(
          base,
          "border border-border text-foreground hover:brightness-95",
          overdue && "ring-1 ring-status-danger-fg",
        )}
        style={areaAccentStyle(it.task.area)}
      >
        <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">{it.task.code}</span>
        <span className="truncate text-muted-foreground">{compact ? props.businessName(it.task.business_id) : it.task.name}</span>
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(TODAY)}
            className="h-7 rounded-md border border-border bg-surface px-2.5 text-xs hover:bg-accent"
          >
            {t("tasks.calendar.today")}
          </button>
          <button aria-label={t("tasks.calendar.prev")} onClick={() => setAnchor(shiftAnchor(anchor, mode, -1))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button aria-label={t("tasks.calendar.next")} onClick={() => setAnchor(shiftAnchor(anchor, mode, 1))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-border bg-surface" />{t("tasks.calendar.legend_confirmed")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-dashed border-border bg-surface" />{t("tasks.calendar.legend_proposed")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-border bg-muted" />{t("tasks.calendar.legend_google")}</span>
          </div>
          <div role="radiogroup" aria-label={t("tasks.calendar.mode")} className="flex rounded-md border border-border bg-surface p-0.5">
            {CAL_MODES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-7 rounded-[4px] px-2.5 text-xs transition-colors", mode === m ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t(`tasks.calendar.mode_${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AreaLegend areas={AREAS} className="pb-2" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border">
          {days.slice(0, 7).map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {mode === "month" ? fmt({ weekday: "short" }, d) : (
                <span className={cn(d === TODAY && "text-primary")}>
                  {fmt({ weekday: "short" }, d)} <span className="font-semibold tabular-nums">{fmt({ day: "numeric" }, d)}</span>
                </span>
              )}
            </div>
          ))}
        </div>
        <div className={cn("grid min-h-0 flex-1 grid-cols-7 overflow-auto", mode === "month" ? "auto-rows-[minmax(min-content,1fr)]" : "")}>{/* Rows share the height but never shrink below their chips, so "+N más" never spills into the next week. */}
          {days.map((d) => {
            const list = items.get(d) ?? [];
            const outside = mode === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
            const shown = mode === "month" ? list.slice(0, MONTH_MAX) : list;
            return (
              <div key={d} className={cn("flex min-h-24 min-w-0 flex-col gap-0.5 border-b border-r border-border p-1 [&:nth-child(7n)]:border-r-0 [&>*]:shrink-0", outside && "bg-muted/40")}>
                {mode === "month" && (
                  <span
                    className={cn(
                      "mb-0.5 self-start rounded-[4px] px-1 text-[11px] tabular-nums",
                      d === TODAY ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {fmt({ day: "numeric" }, d)}
                  </span>
                )}
                {shown.map((it) => (
                  <Item key={`${it.kind}-${it.kind === "due" ? it.task.id : it.kind === "meeting" ? it.meeting.id : it.event.id}`} it={it} compact={mode === "month"} />
                ))}
                {list.length > shown.length && (
                  <button
                    onClick={() => { setMode("week"); setAnchor(d); }}
                    className="self-start px-1 text-[11px] text-link hover:underline"
                  >
                    {t("tasks.calendar.more", { count: list.length - shown.length })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

