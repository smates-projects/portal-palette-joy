import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mail, MapPin, Phone, X } from "lucide-react";
import { useAddLeadNote, useLeadDetail, useUsers } from "@/lib/api/hooks";
import type { LeadEvent, LeadWithComputed } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { primaryActionFor } from "@/lib/leads/pipeline";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { BandBadge, BlockBadge, StageBadge } from "./LeadBadges";

export function LeadDetail(props: {
  leadId: string;
  onClose: () => void;
  onPrimary: (lead: LeadWithComputed) => void;
  onDiscard: (lead: LeadWithComputed) => void;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadDetail(props.leadId);
  const usersQ = useUsers();
  const addNote = useAddLeadNote();
  const [note, setNote] = useState("");
  const userName = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");

  if (q.isLoading)
    return <div className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  if (q.isError || !q.data)
    return (
      <div className="p-6 text-sm">
        <p className="font-medium">{q.isError ? t("pipeline.error_title") : t("pipeline.detail.not_found")}</p>
        {q.isError && <button onClick={() => void q.refetch()} className="mt-3 text-link hover:underline">{t("pipeline.retry")}</button>}
      </div>
    );

  const { lead, events } = q.data;
  const action = primaryActionFor(lead.stage);
  const consultant = usersQ.data?.find((u) => u.id === lead.consultant_user_id);
  const fromOffice = action === "schedule" && consultant && !consultant.booking_url;
  const canDiscard = lead.stage !== "in_program" && lead.stage !== "discarded";

  const describe = (e: LeadEvent) => {
    const actor = userName(e.actor_user_id);
    const stage = (s: string | null) => (s ? t(`pipeline.stages.${s}`) : "");
    return t(`pipeline.events.${e.kind}`, { actor, from: stage(e.from), to: stage(e.to), date: e.signed_on ? formatDate(e.signed_on, lng) : "" });
  };
  const submitNote = () => {
    if (!note.trim()) return;
    addNote.mutate({ id: lead.id, body: note }, {
      onSuccess: () => { setNote(""); toast.success(t("pipeline.t_note")); },
      onError: () => toast.error(t("pipeline.t_error")),
    });
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* 1. Header */}
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={lead.stage} />
              <span className="text-xs text-muted-foreground">{t("pipeline.consultant")}: {consultant?.full_name}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{lead.business.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lead.contact.name}
              {lead.contact.hispanic_owner && <> · {t("pipeline.detail.hispanic")}</>}
            </p>
          </div>
          <button onClick={props.onClose} aria-label={t("pipeline.detail.close")} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <a href={`mailto:${lead.contact.email}`} className="inline-flex items-center gap-1 text-link hover:underline"><Mail className="h-3.5 w-3.5" />{lead.contact.email}</a>
          <a href={`tel:${lead.contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-link hover:underline"><Phone className="h-3.5 w-3.5" />{lead.contact.phone}</a>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.contact.city}, {lead.contact.state}</span>
        </div>
        {lead.stage === "discarded" && lead.discard_reason && (
          <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">{t("pipeline.detail.discard_reason", { reason: lead.discard_reason })}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={() => props.onPrimary(lead)} disabled={props.pending}>{t(`pipeline.actions.${action}`)}</PrimaryButton>
          {canDiscard && (
            <button onClick={() => props.onDiscard(lead)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("pipeline.actions.discard")}</button>
          )}
        </div>
        {fromOffice && <p className="mt-2 text-xs text-muted-foreground">{t("pipeline.detail.booking_from_office", { name: consultant.full_name })}</p>}
      </header>

      <div className="flex-1 space-y-6 px-6 py-5">
        {/* 2. Assessment result as the owner saw it */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.result_title")}</h3>
          <div className="mt-2 rounded-md border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-semibold leading-snug">{t(`pipeline.detail.headline.${lead.result.band}`)}</p>
              <div className="text-right">
                <span className="block font-display text-2xl font-semibold tabular-nums">{lead.result.score}</span>
                <BandBadge band={lead.result.band} />
              </div>
            </div>
            {!lead.result.eligible_program && (
              <div className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
                <p className="font-medium">{t("pipeline.detail.not_eligible")}</p>
                <ul className="mt-1 list-disc pl-4">
                  {lead.result.eligibility_gaps.map((g) => <li key={g}>{t(`pipeline.detail.gaps.${g}`)}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-4 text-xs font-medium text-muted-foreground">{t("pipeline.detail.blocks_title")}</p>
            <ul className="mt-1.5 divide-y divide-border">
              {lead.result.blocks.map((b) => (
                <li key={b.key} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{t(`pipeline.blocks.${b.key}`)}</span>
                  <BlockBadge status={b.status} />
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.strengths")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{lead.result.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("pipeline.detail.priorities")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">{lead.result.priorities.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("pipeline.detail.submitted_at", { date: formatDate(lead.submitted_at, lng) })}</p>
          </div>
        </section>

        {/* 3. Know-how */}
        {lead.know_how_example && (
          <section className="rounded-md border-l-2 border-gold bg-muted/60 px-4 py-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.know_how")}</h3>
            <p className="mt-1.5 text-sm leading-relaxed">“{lead.know_how_example}”</p>
          </section>
        )}

        {/* 4. Business data in ranges */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.business_title")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-4 text-sm">
            <Item label={t("pipeline.industry")} value={t(`pipeline.industries.${lead.business.industry}`)} />
            <Item label={t("pipeline.detail.activity")} value={lead.business.activity} />
            <Item label={t("pipeline.revenue")} value={t(`pipeline.revenue_ranges.${lead.business.revenue_range}`)} />
            <Item label={t("pipeline.detail.margin")} value={t(`pipeline.margin_ranges.${lead.business.margin_range}`)} />
            <Item label={t("pipeline.detail.team")} value={t(`pipeline.team_ranges.${lead.business.team_range}`)} />
            <Item label={t("pipeline.detail.years")} value={t(`pipeline.years_ranges.${lead.business.years_range}`)} />
            <Item label={t("pipeline.detail.active_clients")} value={t(lead.business.has_active_clients ? "pipeline.detail.yes" : "pipeline.detail.no")} />
          </dl>
        </section>

        {/* 5. Activity */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.activity_title")}</h3>
          <ol className="mt-2 space-y-3">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <p>{describe(e)}</p>
                {e.body && <p className="mt-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{e.body}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.created_at, lng)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 space-y-2">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("pipeline.detail.note_placeholder")}
              className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <button
              onClick={submitNote}
              disabled={!note.trim() || addNote.isPending}
              className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {t("pipeline.detail.note_add")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
