import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LEAD_STAGES, type LeadStage, type LeadWithComputed } from "@/lib/api/types";
import { STALE_STAGE_DAYS, byNewThenTime, byTimeInStage, daysSince } from "@/lib/leads/pipeline";
import { entryPhase, isNewLead, unbookedDays } from "@/lib/leads/entry";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssessmentBadge, BandBadge, STAGE_BAR, StageBadge } from "./LeadBadges";

/**
 * Entry sub-state inside Evaluado and Reunión: "Nuevo", "Esperando reserva" (amber "Sin reservar hace N días"
 * 2 days after the assessment), "Reunión el …", "Reunión hecha".
 */
export function EntryState({ lead }: { lead: LeadWithComputed }) {
  const { t, i18n } = useTranslation();
  // Added by hand: the assessment badge already tells where it is; the automatic phases do not apply.
  if ((lead.stage !== "evaluated" && lead.stage !== "meeting") || lead.source === "manual") return null;
  const phase = entryPhase(lead);
  const unbooked = unbookedDays(lead);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {isNewLead(lead) && (
        <span className="rounded-[4px] border border-status-info-border bg-status-info-bg px-1.5 py-0.5 font-medium leading-none text-status-info-fg">{t("entry.new")}</span>
      )}
      {unbooked !== null ? (
        <span className="text-status-warning-fg">{t("entry.unbooked", { count: unbooked })}</span>
      ) : (phase === "meeting_scheduled" || phase === "summary_sent") && lead.meeting ? (
        <span className="text-muted-foreground">{t("entry.meeting_on", { date: formatDateTime(lead.meeting.starts_at, i18n.language) })}</span>
      ) : phase === "assessment" ? (
        <span className="text-muted-foreground">{t("entry.awaiting_booking")}</span>
      ) : (
        <span className="text-muted-foreground">{t(`entry.phases.${phase}`)}</span>
      )}
    </span>
  );
}

interface ViewProps {
  leads: LeadWithComputed[];
  selectedId: string | undefined;
  consultantName: (id: string) => string;
  onOpen: (id: string) => void;
}

function DaysInStage({ lead }: { lead: LeadWithComputed }) {
  const { t } = useTranslation();
  const d = daysSince(lead.stage_entered_at);
  const stale = d > STALE_STAGE_DAYS && lead.stage !== "in_program" && lead.stage !== "discarded";
  return <span className={cn("tabular-nums", stale ? "font-medium text-status-danger-fg" : "text-muted-foreground")}>{t("pipeline.days", { count: d })}</span>;
}

function LeadCard({ lead, selected, consultantName, readOnly, onOpen, onDragStart, onKeyMove }: { lead: LeadWithComputed; selected: boolean; consultantName: string; readOnly: boolean; onOpen: () => void; onDragStart: () => void; onKeyMove: (dir: 1 | -1) => void }) {
  const { t } = useTranslation();
  // Read only (SM Global): the card opens the lead but never moves.
  const draggable = !readOnly && lead.stage !== "in_program";
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onClick={onOpen}
      {...(readOnly ? {} : { "aria-keyshortcuts": "Shift+ArrowLeft Shift+ArrowRight", "aria-description": t("pipeline.keyboard_hint") })}
      onKeyDown={(e) => {
        // Keyboard alternative to dragging.
        if (!readOnly && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); onKeyMove(e.key === "ArrowRight" ? 1 : -1); }
      }}
      className={cn(
        "block w-full rounded-md border bg-surface p-3 text-left text-sm transition-colors hover:border-ring",
        selected ? "border-ring ring-2 ring-ring/20" : "border-border",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug">{lead.business.name}</span>
        {lead.result ? <BandBadge band={lead.result.band} score={lead.result.score} /> : <AssessmentBadge lead={lead} />}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{lead.contact.name} · {lead.contact.city}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t(`pipeline.industries.${lead.business.industry}`)} · {t(`pipeline.revenue_ranges.${lead.business.revenue_range}`)}
      </p>
      <EntryState lead={lead} />
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
        <span className="truncate text-muted-foreground">{consultantName}</span>
        <DaysInStage lead={lead} />
      </div>
    </button>
  );
}

/**
 * Board by stage. With `readOnly` (SM Global) cards cannot be dragged or moved with the keyboard and the columns
 * accept no drops; `onDrop` is then not needed.
 */
export function LeadBoard(props: ViewProps & { onDrop?: (lead: LeadWithComputed, to: LeadStage) => void; readOnly?: boolean }) {
  const { t } = useTranslation();
  const readOnly = !!props.readOnly;
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const drop = (to: LeadStage) => {
    const lead = props.leads.find((l) => l.id === dragId);
    setDragId(null);
    setOver(null);
    if (lead) props.onDrop?.(lead, to);
  };
  const zone = (stage: LeadStage) =>
    readOnly
      ? {}
      : {
          onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); setOver(stage); } },
          onDragLeave: () => setOver((o) => (o === stage ? null : o)),
          onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(stage); },
        };
  const keyMove = (lead: LeadWithComputed, dir: 1 | -1) => {
    const order: LeadStage[] = [...LEAD_STAGES, "discarded"];
    const to = order[order.indexOf(lead.stage) + dir];
    if (to) props.onDrop?.(lead, to);
  };
  const discarded = props.leads.filter((l) => l.stage === "discarded").sort(byTimeInStage);
  // Fade on the right edge while there are columns past the visible width.
  const scroller = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const measure = () => {
    const el = scroller.current;
    if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return (
    <div className="relative">
    <div ref={scroller} onScroll={measure} className="scrollbar-visible flex max-h-[calc(100vh-15rem)] min-h-0 items-start gap-3 overflow-auto pb-2">
      {LEAD_STAGES.map((stage) => {
        const items = props.leads.filter((l) => l.stage === stage).sort(byNewThenTime());
        return (
          <section key={stage} {...zone(stage)} className={cn("flex w-64 shrink-0 flex-col rounded-md border bg-muted/50", over === stage ? "border-ring bg-accent/40" : "border-border")}>
            <header className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className={cn("h-2 w-2 rounded-full", STAGE_BAR[stage])} />
              <h2 className="text-sm font-semibold">{t(`pipeline.stages.${stage}`)}</h2>
              <span className="ml-auto font-display text-xs tabular-nums text-muted-foreground">{items.length}</span>
            </header>
            <div className="flex-1 space-y-2 p-2">
              {items.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t("pipeline.column_empty")}</p>
              ) : (
                items.map((l) => (
                  <LeadCard key={l.id} lead={l} selected={props.selectedId === l.id} consultantName={props.consultantName(l.consultant_user_id)} readOnly={readOnly} onOpen={() => props.onOpen(l.id)} onDragStart={() => setDragId(l.id)} onKeyMove={(d) => keyMove(l, d)} />
                ))
              )}
            </div>
          </section>
        );
      })}
      {showDiscarded ? (
        <section {...zone("discarded")} className={cn("flex w-64 shrink-0 flex-col rounded-md border border-dashed bg-surface", over === "discarded" ? "border-ring bg-accent/40" : "border-border")}>
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("pipeline.discarded_column", { count: discarded.length })}</h2>
            <button onClick={() => setShowDiscarded(false)} className="ml-auto inline-flex items-center gap-0.5 text-xs text-link hover:underline">
              <ChevronLeft className="h-3.5 w-3.5" />{t("pipeline.discarded_hide")}
            </button>
          </header>
          <div className="flex-1 space-y-2 p-2 opacity-80">
            {discarded.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t("pipeline.column_empty")}</p>
            ) : (
              discarded.map((l) => (
                <LeadCard key={l.id} lead={l} selected={props.selectedId === l.id} consultantName={props.consultantName(l.consultant_user_id)} readOnly={readOnly} onOpen={() => props.onOpen(l.id)} onDragStart={() => setDragId(l.id)} onKeyMove={(d) => keyMove(l, d)} />
              ))
            )}
          </div>
        </section>
      ) : (
        <button
          {...zone("discarded")}
          onClick={() => setShowDiscarded(true)}
          aria-label={t("pipeline.discarded_show")}
          className={cn("flex w-11 shrink-0 flex-col items-center gap-2 rounded-md border border-dashed py-3 text-xs text-muted-foreground hover:bg-muted", over === "discarded" ? "border-ring bg-accent/40" : "border-border")}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="[writing-mode:vertical-rl]">{t("pipeline.discarded_column", { count: discarded.length })}</span>
        </button>
      )}
    </div>
    <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity", moreRight ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

export function LeadTable(props: ViewProps) {
  const { t } = useTranslation();
  const rows = [...props.leads].sort((a, b) => {
    const ia = a.stage === "discarded" ? 99 : LEAD_STAGES.indexOf(a.stage);
    const ib = b.stage === "discarded" ? 99 : LEAD_STAGES.indexOf(b.stage);
    return ia - ib || byNewThenTime()(a, b);
  });
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
          <tr>
            {["business", "city", "industry", "revenue", "score", "stage", "consultant", "days_in_stage"].map((k) => (
              <th key={k} className="whitespace-nowrap px-3 py-2 text-left font-medium">{t(`pipeline.${k}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((l) => (
            <tr key={l.id} tabIndex={0} onClick={() => props.onOpen(l.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onOpen(l.id); } }} className={cn("cursor-pointer outline-none hover:bg-accent/40 focus-visible:bg-accent", props.selectedId === l.id && "bg-accent/60")}>
              <td className="px-3 py-2.5">
                <span className="block font-medium">{l.business.name}</span>
                <span className="block text-xs text-muted-foreground">{l.contact.name}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{l.contact.city}, {l.contact.state}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{t(`pipeline.industries.${l.business.industry}`)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{t(`pipeline.revenue_ranges.${l.business.revenue_range}`)}</td>
              <td className="px-3 py-2.5">{l.result ? <BandBadge band={l.result.band} score={l.result.score} /> : <AssessmentBadge lead={l} />}</td>
              <td className="px-3 py-2.5"><StageBadge stage={l.stage} /><EntryState lead={l} /></td>
              <td className="whitespace-nowrap px-3 py-2.5">{props.consultantName(l.consultant_user_id)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs"><DaysInStage lead={l} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
