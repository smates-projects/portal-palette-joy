import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { localeTag } from "@/lib/format";
import { useDiscardLead, useLeads, useMoveLead, useSendMou, useSendNda, useUsers } from "@/lib/api/hooks";
import { LEAD_STAGES, type LeadStage, type LeadWithComputed } from "@/lib/api/types";
import {
  INDUSTRIES,
  REVENUES,
  buildPipelineCounters,
  filterLeads,
  primaryActionFor,
  resolveLeadMove,
  type LeadQuick,
  type LeadsSearch,
} from "@/lib/leads/pipeline";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadBoard, LeadTable } from "./LeadViews";
import { LeadDetail } from "./LeadDetail";
import { DiscardLeadDialog } from "./LeadDialogs";
import { AddBusinessDialog } from "./AddBusinessDialog";
import { SimulateEntry } from "./SimulateEntry";

type SearchPatch = { [K in keyof LeadsSearch]?: LeadsSearch[K] | undefined };
type MoveTarget = "evaluated" | "meeting" | "documents" | "accepted";
const ALL = "__all";

export function PipelinePage({ search }: { search: LeadsSearch }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const leadsQ = useLeads();
  const usersQ = useUsers();
  const move = useMoveLead();
  const discard = useDiscardLead();
  const sendNda = useSendNda();
  const sendMou = useSendMou();
  const [discardFor, setDiscardFor] = useState<LeadWithComputed | null>(null);
  const [adding, setAdding] = useState(false);

  const setSearch = (patch: SearchPatch) => {
    const next: Record<string, unknown> = { ...search, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    void navigate({ to: "/embudo", search: next as LeadsSearch, replace: true });
  };
  const consultantName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const consultants = (usersQ.data ?? []).filter((u) => u.role === "sm_team");
  const stageName = (s: LeadStage) => t(`pipeline.stages.${s}`);
  const fail = () => toast.error(t("pipeline.t_error"));

  const doMove = (lead: LeadWithComputed, to: MoveTarget, msg?: string) => {
    const from = lead.stage;
    move.mutate({ id: lead.id, to }, {
      onSuccess: () =>
        toast.success(msg ?? t(from === "discarded" ? "pipeline.t_restored" : "pipeline.t_moved", { name: lead.business.name, to: stageName(to) }), {
          action: from !== "discarded" && from !== "in_program"
            ? { label: t("pipeline.undo"), onClick: () => move.mutate({ id: lead.id, to: from as MoveTarget }, { onError: fail }) }
            : undefined,
        }),
      onError: fail,
    });
  };

  const onDrop = (lead: LeadWithComputed, to: LeadStage) => {
    const m = resolveLeadMove(lead.stage, to);
    if (!m.ok) {
      if (m.reason !== "same") toast.error(t(`pipeline.move.no_${m.reason}`, { name: lead.business.name, to: stageName(to) }));
      return;
    }
    if (m.action === "discard") setDiscardFor(lead);
    else doMove(lead, to as MoveTarget);
  };

  const onPrimary = (lead: LeadWithComputed) => {
    const action = primaryActionFor(lead);
    if (action === "view_program") {
      if (lead.business_id) void navigate({ to: "/red", search: { biz: lead.business_id } });
      return;
    }
    if (action === "send_nda")
      return sendNda.mutate(lead.id, { onSuccess: () => toast.success(t("pipeline.t_nda_sent", { name: lead.business.name })), onError: fail });
    if (action === "send_mou")
      return sendMou.mutate(lead.id, { onSuccess: () => toast.success(t("pipeline.t_mou_sent", { name: lead.business.name })), onError: fail });
    if (action === "restore") return doMove(lead, "evaluated");
    if (action === "schedule") {
      // Open synchronously from the click so the browser does not block the new tab.
      window.open(lead.booking_url, "_blank", "noopener,noreferrer");
      return doMove(lead, "meeting", t("pipeline.t_scheduled", { name: lead.business.name }));
    }
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.for_role")}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("pipeline.heading")}</h1>
      </div>
      {/* Businesses that did not come through the assessment (referrals, events). */}
      <button onClick={() => setAdding(true)} className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-muted">
        {t("pipeline.manual.add")}
      </button>
    </div>
  );

  if (leadsQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("pipeline.error_title")}</p>
          <button onClick={() => void leadsQ.refetch()} className="mt-3 text-link hover:underline">{t("pipeline.retry")}</button>
        </div>
      </div>
    );
  if (leadsQ.isLoading || usersQ.isLoading)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <Skeleton className="mt-6 h-[76px] rounded-md" />
        <div className="mt-4 flex gap-3">{LEAD_STAGES.map((s) => <Skeleton key={s} className="h-72 w-64 rounded-md" />)}</div>
      </div>
    );

  const all = leadsQ.data ?? [];
  const counters = buildPipelineCounters(all);
  const rows = filterLeads(all, search);
  const view = search.view ?? "board";
  const hasFilters = !!(search.stage || search.consultant || search.band || search.industry || search.revenue || search.quick);
  const selected = all.find((l) => l.id === search.lead);
  const nf = new Intl.NumberFormat(localeTag(i18n.language));

  const counter = (key: "week" | "uncontacted" | "in_review" | "review_overdue" | "accepted_no_investor" | "signed_month", value: number, patch: SearchPatch, danger = false) => {
    const active = search.quick === patch.quick;
    return (
      <button
        key={key}
        onClick={() => setSearch(active ? { quick: undefined, stage: undefined } : { quick: undefined, stage: undefined, ...patch, view: "table" })}
        aria-pressed={active}
        className={cn("px-4 py-3 text-left transition-colors hover:bg-accent/40", active && "bg-accent/60")}
      >
        <div className="flex items-baseline gap-2">
          <span className={cn("font-display text-2xl font-semibold tabular-nums", value === 0 ? "text-muted-foreground/40" : danger ? "text-status-danger-fg" : "text-foreground")}>{nf.format(value)}</span>
          <span className="text-xs font-medium">{t(`pipeline.counters.${key}`)}</span>
        </div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {header}

      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-4 lg:grid-cols-7 sm:divide-x sm:divide-border">
        {counter("week", counters.week, { quick: "week" as LeadQuick })}
        {counter("uncontacted", counters.uncontacted, { quick: "uncontacted" as LeadQuick }, true)}
        {counter("in_review", counters.in_review, { quick: "in_review" as LeadQuick })}
        {counter("review_overdue", counters.review_overdue, { quick: "review_overdue" as LeadQuick }, true)}
        {counter("accepted_no_investor", counters.accepted_no_investor, { quick: "no_investor" as LeadQuick })}
        {counter("signed_month", counters.signed_month, { quick: "signed_month" as LeadQuick })}
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{t("pipeline.counters.conversion")}</p>
          <p className="mt-0.5 font-display text-sm font-semibold tabular-nums">
            {counters.conversion_pct === null
              ? t("pipeline.counters.conversion_none")
              : t("pipeline.counters.conversion_value", { pct: counters.conversion_pct, signed: counters.signed_month, total: counters.month_assessments })}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button key={v} onClick={() => setSearch({ view: v })} aria-pressed={view === v}
              className={cn("rounded-[4px] px-3 py-1 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t(`pipeline.view_${v}`)}
            </button>
          ))}
        </div>
        <Filter label={t("pipeline.stage")} value={search.stage} all={t("pipeline.filters.all_stages")} onChange={(v) => setSearch({ stage: v as LeadStage | undefined })}
          options={[...LEAD_STAGES, "discarded" as const].map((s) => ({ value: s, label: stageName(s) }))} />
        <Filter label={t("pipeline.consultant")} value={search.consultant} all={t("pipeline.filters.all_consultants")} onChange={(v) => setSearch({ consultant: v })}
          options={consultants.map((u) => ({ value: u.id, label: u.full_name }))} />
        <Filter label={t("pipeline.band_label")} value={search.band} all={t("pipeline.filters.all_bands")} onChange={(v) => setSearch({ band: v as LeadsSearch["band"] })}
          options={(["high", "mid", "low", "track"] as const).map((b) => ({ value: b, label: t(`pipeline.bands.${b}`) }))} />
        <Filter label={t("pipeline.industry")} value={search.industry} all={t("pipeline.filters.all_industries")} onChange={(v) => setSearch({ industry: v as LeadsSearch["industry"] })}
          options={INDUSTRIES.map((i) => ({ value: i, label: t(`pipeline.industries.${i}`) }))} />
        <Filter label={t("pipeline.revenue")} value={search.revenue} all={t("pipeline.filters.all_revenues")} onChange={(v) => setSearch({ revenue: v as LeadsSearch["revenue"] })}
          options={REVENUES.map((r) => ({ value: r, label: t(`pipeline.revenue_ranges.${r}`) }))} />
        {search.quick && (
          <span className="inline-flex h-8 items-center rounded-md border border-ring bg-accent/60 px-2.5 text-sm">{t(`pipeline.filters.quick.${search.quick}`)}</span>
        )}
        {hasFilters && (
          <button onClick={() => setSearch({ stage: undefined, consultant: undefined, band: undefined, industry: undefined, revenue: undefined, quick: undefined })} className="text-sm text-link hover:underline">
            {t("pipeline.filters.clear")}
          </button>
        )}
        <SimulateEntry leads={all} selectedId={search.lead} onOpen={(id) => setSearch({ lead: id, focus: undefined })} />
      </div>

      <div className="mt-4">
        {all.length === 0 ? (
          <Empty title={t("pipeline.empty_all_title")} body={t("pipeline.empty_all_body")} />
        ) : rows.length === 0 ? (
          <Empty title={t("pipeline.empty_title")} body={t("pipeline.empty_body")} />
        ) : view === "board" ? (
          <LeadBoard leads={rows} selectedId={search.lead} consultantName={consultantName} onOpen={(id) => setSearch({ lead: id, focus: undefined })} onDrop={onDrop} />
        ) : (
          <LeadTable leads={rows} selectedId={search.lead} consultantName={consultantName} onOpen={(id) => setSearch({ lead: id, focus: undefined })} />
        )}
      </div>

      <Sheet open={!!search.lead} onOpenChange={(o) => !o && setSearch({ lead: undefined, focus: undefined })}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.business.name ?? t("pipeline.detail.open_full")}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.contact.name ?? ""}</SheetDescription>
          {search.lead && (
            <LeadDetail
              leadId={search.lead}
              onClose={() => setSearch({ lead: undefined, focus: undefined })}
              onPrimary={onPrimary}
              onDiscard={setDiscardFor}
              pending={move.isPending || sendNda.isPending || sendMou.isPending}
              focus={search.focus}
            />
          )}
        </SheetContent>
      </Sheet>

      {adding && <AddBusinessDialog onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setSearch({ lead: id, view: "board", stage: undefined, quick: undefined }); }} />}
      {discardFor && (
        <DiscardLeadDialog
          name={discardFor.business.name}
          pending={discard.isPending}
          onClose={() => setDiscardFor(null)}
          onConfirm={(reason) =>
            discard.mutate({ id: discardFor.id, reason }, {
              onSuccess: () => { toast.success(t("pipeline.t_discarded", { name: discardFor.business.name })); setDiscardFor(null); },
              onError: fail,
            })
          }
        />
      )}
    </div>
  );
}

function Filter(props: { label: string; value: string | undefined; all: string; options: { value: string; label: string }[]; onChange: (v: string | undefined) => void }) {
  return (
    <Select value={props.value ?? ALL} onValueChange={(v) => props.onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={props.label} className={cn("h-8 w-auto min-w-36 gap-2 bg-surface text-sm", props.value && "border-ring text-foreground")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{props.all}</SelectItem>
        {props.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-8 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}
