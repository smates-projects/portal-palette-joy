import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Lock, Video } from "lucide-react";
import { todayIso } from "@/lib/clock";
import { localeTag } from "@/lib/format";
import { useCalendarEvents, useCurrentUser, useLeadMeetings, useMeetings, useMyMeetings, usePortalMeeting } from "@/lib/api/hooks";
import type { PortalMeeting, TaskWithComputed } from "@/lib/api/types";
import type { LeadMeetingItem } from "@/lib/api/entry-types";
import {
  CAL_MODES, WEEK_END_HOUR, WEEK_HOUR_PX, WEEK_START_HOUR, buildCalendarItems, localDay, monthGrid, placeWeekItems, shiftAnchor, visibleRange, weekDays, type CalItem, type CalMode,
} from "@/lib/tasks/calendar";
import { MeetingPanel } from "@/components/calendar/MeetingPanel";
import { cn } from "@/lib/utils";
import { AreaLegend, areaAccentStyle } from "@/components/AreaTag";
import { AREAS } from "@/lib/tasks/owner";

const MONTH_MAX = 3;

/**
 * SM Global's data source (see lib/calendar/use-global-calendar): the same calendar, fed with her meetings instead
 * of the team's tasks. Only the data changes; the toolbar, grid, chips, legend and panel stay the same.
 */
export interface MeetingsOnlyScope {
  leadMeetings: LeadMeetingItem[];
  portalFilter: (m: PortalMeeting) => boolean;
  /** Her Google events, read only: only in her own calendar. */
  showGoogle: boolean;
  /** Still reading the leads: the empty state waits. */
  loading?: boolean | undefined;
  /** Shown above the grid when the visible weeks have nothing. */
  renderEmpty: (mode: CalMode) => ReactNode;
}

export function TaskCalendar(props: {
  rows: TaskWithComputed[];
  businessName: (id: string) => string;
  onOpen: (id: string) => void;
  /** Portal meeting shown in the side panel (?meeting= from the bell). */
  focusMeetingId?: string | undefined;
  onFocusMeeting: (id: string | null) => void;
  /** SM Global's Calendario: its meetings scoped by "Viendo" instead of the tasks. */
  meetingsOnly?: MeetingsOnlyScope | undefined;
}) {
  const { t, i18n } = useTranslation();
  const locale = localeTag(i18n.language);
  const scoped = props.meetingsOnly;
  const [mode, setMode] = useState<CalMode>("month");
  const [anchor, setAnchor] = useState(todayIso());
  const meetingsQ = useMeetings();
  const eventsQ = useCalendarEvents();
  const navigate = useNavigate();
  // Entry meetings the owners booked with this consultant (SM team only; Global brings its own).
  const role = useCurrentUser().data?.role;
  const leadMeetingsQ = useLeadMeetings(!scoped && role === "sm_team");
  const days = mode === "month" ? monthGrid(anchor) : weekDays(anchor);
  const range = visibleRange(days);
  // Calendar v2: the portal meetings of every kind in the visible weeks.
  const portalQ = useMyMeetings(range.from, range.to);
  // Opened from the bell: jump once to the focused meeting's day.
  const focusQ = usePortalMeeting(props.focusMeetingId);
  const [anchoredFor, setAnchoredFor] = useState<string | null>(null);
  if (focusQ.data && anchoredFor !== focusQ.data.id) {
    setAnchoredFor(focusQ.data.id);
    setAnchor(localDay(focusQ.data.starts_at));
  }

  const items = useMemo(
    () =>
      scoped
        ? buildCalendarItems(
            [],
            [],
            scoped.showGoogle ? eventsQ.data ?? [] : [],
            scoped.leadMeetings,
            (portalQ.data ?? []).filter(scoped.portalFilter),
          )
        : buildCalendarItems(props.rows, meetingsQ.data ?? [], eventsQ.data ?? [], leadMeetingsQ.data ?? [], portalQ.data ?? []),
    [scoped, props.rows, meetingsQ.data, eventsQ.data, leadMeetingsQ.data, portalQ.data],
  );
  const visibleCount = days.reduce((n, d) => n + (items.get(d)?.length ?? 0), 0);
  const loaded = !portalQ.isLoading && !(scoped?.loading ?? false);
  const fmt = (o: Intl.DateTimeFormatOptions, iso: string) =>
    new Intl.DateTimeFormat(locale, o).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const title =
    mode === "month"
      ? cap(fmt({ month: "long", year: "numeric" }, anchor))
      : t("tasks.calendar.week_range", { from: fmt({ day: "numeric", month: "short" }, days[0]!), to: fmt({ day: "numeric", month: "short", year: "numeric" }, days[6]!) });
  const time = (iso: string) => fmt({ hour: "2-digit", minute: "2-digit" }, iso);
  // Week time grid: one row per hour between WEEK_START_HOUR and WEEK_END_HOUR.
  const hours = Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, i) => WEEK_START_HOUR + i);
  const gridHeight = (WEEK_END_HOUR - WEEK_START_HOUR) * WEEK_HOUR_PX;
  const hourLabel = (h: number) => fmt({ hour: "2-digit", minute: "2-digit" }, `${anchor}T${String(h).padStart(2, "0")}:00:00`);
  const itemKey = (it: CalItem) =>
    `${it.kind}-${it.kind === "due" ? it.task.id : it.kind === "meeting" || it.kind === "portal" ? it.meeting.id : it.kind === "lead" ? it.item.lead_id : it.event.id}`;

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
    if (it.kind === "lead")
      return (
        <button
          onClick={() => void navigate({ to: "/embudo", search: { lead: it.item.lead_id } })}
          title={`${t("entry.calendar.title", { name: it.item.business_name })} · ${time(it.at)} · ${it.item.meeting.meet_url}`}
          className={cn(base, "border border-primary bg-accent/60 text-foreground hover:brightness-95")}
        >
          <Video className="h-2.5 w-2.5 shrink-0" />
          <span className="shrink-0 whitespace-nowrap tabular-nums">{time(it.at)}</span>
          <span className="truncate">{compact ? it.item.business_name : t("entry.calendar.title", { name: it.item.business_name })}</span>
        </button>
      );
    if (it.kind === "portal") {
      const m = it.meeting;
      return (
        <button
          onClick={() => props.onFocusMeeting(m.id)}
          title={`${m.topic} · ${time(it.at)} · ${t(`calendar.status.${m.status}`)}${m.google_synced ? ` · ${t("calendar.google_mark")}` : ""}`}
          className={cn(
            base,
            "border border-primary bg-surface text-foreground hover:bg-accent",
            m.status === "proposed" && "border-dashed",
            m.status === "cancelled" && "border-border text-muted-foreground line-through",
            props.focusMeetingId === m.id && "ring-2 ring-ring",
          )}
        >
          {m.meet_url ? <Video className="h-2.5 w-2.5 shrink-0" /> : null}
          <span className="shrink-0 whitespace-nowrap tabular-nums">{time(it.at)}</span>
          <span className="truncate">{m.topic}</span>
        </button>
      );
    }
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
        title={`${t("tasks.calendar.due")} ${it.task.code} ${it.task.name} · ${props.businessName(it.task.business_id)}`}
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

  /** A timed block of the week grid: fills its slot, hour on top and title below. */
  const WeekBlock = ({ it }: { it: Exclude<CalItem, { kind: "due" }> }) => {
    const base = "flex h-full w-full min-w-0 flex-col justify-start overflow-hidden rounded-[4px] border px-1.5 py-0.5 text-left text-[11px] leading-tight";
    const timeRow = <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums opacity-80">{time(it.at)}</span>;
    if (it.kind === "google")
      return (
        <div
          title={`${it.event.title} · ${time(it.at)} · ${t("tasks.calendar.google_readonly")}`}
          className={cn(base, "cursor-default border-border bg-muted text-muted-foreground")}
        >
          <span className="flex items-center gap-1">{timeRow}<Lock className="h-2.5 w-2.5 shrink-0" /></span>
          <span className="truncate font-medium">{it.event.title}</span>
        </div>
      );
    if (it.kind === "lead")
      return (
        <button
          onClick={() => void navigate({ to: "/embudo", search: { lead: it.item.lead_id } })}
          title={`${t("entry.calendar.title", { name: it.item.business_name })} · ${time(it.at)} · ${it.item.meeting.meet_url}`}
          className={cn(base, "border-primary bg-accent/60 text-foreground hover:brightness-95")}
        >
          <span className="flex items-center gap-1">{timeRow}<Video className="h-2.5 w-2.5 shrink-0" /></span>
          <span className="truncate font-medium">{t("entry.calendar.title", { name: it.item.business_name })}</span>
        </button>
      );
    if (it.kind === "portal") {
      const m = it.meeting;
      return (
        <button
          onClick={() => props.onFocusMeeting(m.id)}
          title={`${m.topic} · ${time(it.at)} · ${t(`calendar.status.${m.status}`)}${m.google_synced ? ` · ${t("calendar.google_mark")}` : ""}`}
          className={cn(
            base,
            "border-primary bg-surface text-foreground hover:bg-accent",
            m.status === "proposed" && "border-dashed",
            m.status === "cancelled" && "border-border text-muted-foreground line-through",
            props.focusMeetingId === m.id && "ring-2 ring-ring",
          )}
        >
          {timeRow}
          <span className="truncate font-medium">{m.topic}</span>
        </button>
      );
    }
    return (
      <button
        onClick={() => props.onOpen(it.task.id)}
        title={`${it.meeting.topic} · ${time(it.at)} · ${t(`tasks.calendar.meeting_${it.meeting.status}`)} · ${it.task.code} ${props.businessName(it.task.business_id)}`}
        className={cn(base, "border-border text-foreground hover:brightness-95", it.meeting.status === "proposed" && "border-dashed")}
        style={areaAccentStyle(it.task.area)}
      >
        {timeRow}
        <span className="truncate font-medium">{it.task.code} · {it.meeting.topic}</span>
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(todayIso())}
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
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-primary bg-surface" />{t("calendar.legend_portal")}</span>
            {((scoped ? scoped.leadMeetings.length : leadMeetingsQ.data?.length) ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] border border-primary bg-accent/60" />{t("entry.calendar.legend")}</span>
            )}
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
      {scoped && loaded && visibleCount === 0 && scoped.renderEmpty(mode)}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface">
        <div className={cn("grid border-b border-border", mode === "week" ? "grid-cols-[4.25rem_repeat(7,minmax(0,1fr))]" : "grid-cols-7")}>
          {mode === "week" && <div />}
          {days.slice(0, 7).map((d) => (
            <div key={d} className={cn("px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground", mode === "week" && "border-l border-border text-center")}>
              {mode === "month" ? fmt({ weekday: "short" }, d) : (
                <span className={cn(d === todayIso() && "text-primary")}>
                  {fmt({ weekday: "short" }, d)} <span className="font-semibold tabular-nums">{fmt({ day: "numeric" }, d)}</span>
                </span>
              )}
            </div>
          ))}
        </div>
        {mode === "week" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            {/* All-day strip: the due dates of the week, which have no hour. */}
            <div className="grid grid-cols-[4.25rem_repeat(7,minmax(0,1fr))] border-b border-border">
              <div className="px-1.5 py-1 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("tasks.calendar.all_day")}</div>
              {days.map((d) => (
                <div key={d} className={cn("flex min-h-9 min-w-0 flex-col gap-0.5 border-l border-border p-1", d === todayIso() && "bg-accent/40")}>
                  {(items.get(d) ?? []).filter((i) => i.kind === "due").map((it) => (
                    <Item key={itemKey(it)} it={it} compact />
                  ))}
                </div>
              ))}
            </div>
            {/* Time grid: hour gutter plus one column per day, blocks positioned by their start time. */}
            <div className="grid grid-cols-[4.25rem_repeat(7,minmax(0,1fr))]">
              <div className="relative" style={{ height: gridHeight }}>
                {hours.slice(1).map((h) => (
                  <span key={h} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground" style={{ top: (h - WEEK_START_HOUR) * WEEK_HOUR_PX }}>
                    {hourLabel(h)}
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={cn("relative min-w-0 border-l border-border", d === todayIso() && "bg-accent/30")} style={{ height: gridHeight }}>
                  {hours.slice(1).map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-border/70" style={{ top: (h - WEEK_START_HOUR) * WEEK_HOUR_PX }} />
                  ))}
                  {placeWeekItems(items.get(d) ?? []).timed.map((p) => (
                    <div key={itemKey(p.item)} className="absolute px-0.5" style={{ top: p.top, height: p.height, left: `${(p.lane / p.lanes) * 100}%`, width: `${100 / p.lanes}%` }}>
                      <WeekBlock it={p.item} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-[minmax(min-content,1fr)] overflow-auto">{/* Rows share the height but never shrink below their chips, so "+N más" never spills into the next week. */}
            {days.map((d) => {
              const list = items.get(d) ?? [];
              const outside = d.slice(0, 7) !== anchor.slice(0, 7);
              const shown = list.slice(0, MONTH_MAX);
              return (
                <div key={d} className={cn("flex min-h-24 min-w-0 flex-col gap-0.5 border-b border-r border-border p-1 [&:nth-child(7n)]:border-r-0 [&>*]:shrink-0", outside && "bg-muted/40")}>
                  <span
                    className={cn(
                      "mb-0.5 self-start rounded-[4px] px-1 text-[11px] tabular-nums",
                      d === todayIso() ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-muted-foreground/60" : "text-muted-foreground",
                    )}
                  >
                    {fmt({ day: "numeric" }, d)}
                  </span>
                  {shown.map((it) => (
                    <Item key={itemKey(it)} it={it} compact />
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
        )}
      </div>
      <MeetingPanel meetingId={props.focusMeetingId ?? null} onClose={() => props.onFocusMeeting(null)} />
    </div>
  );
}

