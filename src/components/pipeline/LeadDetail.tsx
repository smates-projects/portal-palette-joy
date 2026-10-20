import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mail, MapPin, Phone, X } from "lucide-react";
import {
  useAddLeadNote, useApproveDocuments, useBusinessFunds, useConfirmProgramStart, useCurrentUser, useLeadDetail, useLeadIntake, useRecordFundPayment,
  useRejectDocuments, useRemoveFundPayment, useRules, useSendTripartite, useSetMeetingOutcome, useUsers,
} from "@/lib/api/hooks";
import { entryRules, oaSendBlock } from "@/lib/leads/entry-flow";
import { meetingIdOf } from "@/lib/leads/meetings";
import { leadOwnerOf, scheduleRoute } from "@/lib/leads/scheduling";
import type { LeadMeeting, MeetingOutcome } from "@/lib/api/types";
import { validateFundPayment } from "@/lib/leads/funds";
import { FundsPanel } from "@/components/funds/FundsPanel";
import { PaymentDialog, type PaymentFormValue } from "@/components/funds/parts";
import { StartProgramDialog } from "@/components/funds/StartProgramDialog";
import { InvestorsSection } from "./InvestorsSection";
import { isDocsAdmin } from "@/lib/leads/onboarding";
import { IntakeChecklist, RejectDocsDialog } from "./IntakeChecklist";
import type { LeadEvent, LeadWithComputed } from "@/lib/api/types";
import { firstName, formatDate, formatDateTime } from "@/lib/format";
import { ValidationCard } from "./ValidationCard";
import { primaryActionFor } from "@/lib/leads/pipeline";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { StageBadge } from "./LeadBadges";
import { ManualLeadSection } from "./ManualLeadSection";
import { AssessmentResult, KnowHow } from "./AssessmentResult";
import { EntryTimeline, MeetingCard, MeetingNoteDialog, SummaryEmail } from "./EntrySections";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";

/**
 * Detail of one lead. With `readOnly` (SM Global) there are no actions and no note box: it only shows what the
 * office knows. Without it, `onPrimary`, `onDiscard` and `pending` are required in practice.
 */
export function LeadDetail(props: {
  leadId: string;
  onClose: () => void;
  readOnly?: boolean;
  onPrimary?: (lead: LeadWithComputed) => void;
  onDiscard?: (lead: LeadWithComputed) => void;
  pending?: boolean;
  /** "meeting": opened from the bell ("Resultado de la reunión pendiente"), the meeting card in focus. */
  focus?: "meeting" | undefined;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadDetail(props.leadId);
  const usersQ = useUsers();
  const addNote = useAddLeadNote();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const meQ = useCurrentUser();
  const approve = useApproveDocuments();
  const reject = useRejectDocuments();
  const sendTripartite = useSendTripartite();
  const record = useRecordFundPayment();
  const remove = useRemoveFundPayment();
  const start = useConfirmProgramStart();
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [noting, setNoting] = useState<LeadMeeting | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const outcome = useSetMeetingOutcome();
  const rules = entryRules(useRules().data);
  const businessIdForFunds = q.data?.lead.funds ? q.data.lead.business_id ?? undefined : undefined;
  const fundsQ = useBusinessFunds(businessIdForFunds);
  const userName = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");
  // The entry contracts (cached with the checklist): with an Acuerdo de Vinculación the OA is created by its rule.
  const intakeQ = useLeadIntake(q.data?.lead.intake ? props.leadId : undefined);

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
  const action = primaryActionFor(lead);
  // The owner's account exists from the booking (or "Enviar NDA") on.
  const leadOwner = leadOwnerOf(lead, usersQ.data);
  const scheduleGuests = [leadOwner, usersQ.data?.find((u) => u.id === lead.consultant_user_id)]
    .filter((u): u is NonNullable<typeof u> => !!u && u.id !== meQ.data?.id)
    .map((u) => ({ user_id: u.id, name: u.full_name }));
  const admin = isDocsAdmin(meQ.data, lead.office_id);
  const approval = lead.intake?.approval;
  // Why the primary action is disabled (shown under it), or null when it can be used.
  const blockedHint =
    action === "wait_investor" || action === "wait_signatures" ? "" :
    action === "approve_docs" && !admin ? t("intake.admin_only") :
    action === "approve_docs" && approval && !approval.ok
      ? t(approval.reason === "contracts" ? "intake.missing_contracts" : "intake.missing_docs", { list: approval.missing.join(", ") })
      : action === "send_tripartite" && intakeQ.data?.contracts.some((c) => c.kind === "binding")
        ? t(lead.validation?.status === "closed" ? "entry_contracts.lead.oa_after_binding" : "entry_contracts.lead.oa_needs_validation")
      : action === "send_tripartite" && oaSendBlock(lead, rules) === "expansion_meeting_required"
        ? t("entry.oa.needs_expansion")
        : action === "meeting_outcome" ? ""
          : null;
  const fail = (e?: unknown) =>
    toast.error(e instanceof Error && ["outcome_already_set", "expansion_meeting_required", "invalid_transition"].includes(e.message)
      ? t(`entry.errors.${e.message}`) : t("pipeline.t_error"));
  /** "Se hizo" asks for the note first; the other two answers go at once. */
  const answer = (m: LeadMeeting, value: MeetingOutcome, note?: string) => {
    const meetingId = meetingIdOf(m);
    // Never a silent no-op: without the meeting's id the API cannot take the answer, so say so.
    if (!meetingId) {
      setNoting(null);
      toast.error(t("entry.errors.meeting_id_missing"));
      return;
    }
    outcome.mutate({ leadId: lead.id, meetingId, input: { outcome: value, note: note ?? null } }, {
      onSuccess: () => { setNoting(null); toast.success(t(`entry.outcome.t_${value}${m.kind === "expansion" ? "_expansion" : ""}`, { name: lead.business.name })); },
      onError: fail,
    });
  };
  const onOutcome = (m: LeadMeeting, value: MeetingOutcome) => {
    if (!meetingIdOf(m)) return answer(m, value);
    return value === "held" ? setNoting(m) : answer(m, value);
  };
  const runPrimary = () => {
    if (action === "review_docs") return document.getElementById("intake-docs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (action === "approve_docs")
      return approve.mutate(lead.id, { onSuccess: () => toast.success(t("pipeline.t_docs_approved", { name: lead.business.name })), onError: fail });
    if (action === "send_tripartite")
      return sendTripartite.mutate(lead.id, { onSuccess: () => toast.success(t("pipeline.t_tripartite_sent", { name: lead.business.name })), onError: fail });
    if (action === "record_funds") return setRecording(true);
    if (action === "start_program") return setStarting(true);
    if (action === "join_meet") {
      if (lead.meeting) window.open(lead.meeting.meet_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "meeting_outcome") return document.getElementById("lead-meeting")?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Calendar v2: a lead whose owner already has an account is scheduled with the portal's dialog; without an
    // account the booking link keeps doing it (the person books on the consultant's calendar).
    const route = scheduleRoute(action, !!leadOwner);
    if (route === "dialog") return setScheduling(true);
    if (route === "booking_link" && action === "rebook") {
      // Open synchronously from the click so the browser does not block the new tab.
      if (lead.booking_url) window.open(lead.booking_url, "_blank", "noopener,noreferrer");
      return;
    }
    props.onPrimary?.(lead);
  };
  const remaining = fundsQ.data ? Math.max(0, fundsQ.data.total - fundsQ.data.received) : 0;
  const recordFunds = (input: PaymentFormValue) => {
    if (!lead.business_id) return;
    record.mutate({ businessId: lead.business_id, input }, {
      onSuccess: (f) => {
        setRecording(false);
        const paymentId = f.payments.at(-1)?.id;
        toast.success(t(f.status === "received" ? "funds.t_recorded_complete" : "funds.t_recorded"), {
          action: paymentId && lead.business_id
            ? { label: t("funds.undo"), onClick: () => remove.mutate({ businessId: lead.business_id!, paymentId }, { onError: fail }) }
            : undefined,
        });
        // Funds complete: the start of the program is the next step, so its dialog opens right away.
        if (f.status === "received") setStarting(true);
      },
      onError: fail,
    });
  };
  const confirmStart = (day1: string) =>
    start.mutate({ id: lead.id, day1 }, {
      onSuccess: (r) => { setStarting(false); toast.success(t("funds.start.t_started", { name: lead.business.name, count: r.task_count })); },
      onError: fail,
    });
  const showGlobalApprove = props.readOnly && action === "approve_docs" && admin;
  const consultant = usersQ.data?.find((u) => u.id === lead.consultant_user_id);
  const fromOffice = action === "schedule" && consultant && !consultant.booking_url;
  const canDiscard = lead.stage !== "in_program" && lead.stage !== "discarded" && lead.stage !== "documents";

  const describe = (e: LeadEvent) => {
    const actor = userName(e.actor_user_id);
    const stage = (s: string | null) => (s ? t(`pipeline.stages.${s}`) : "");
    return t(`pipeline.events.${e.kind}`, {
      actor, owner: lead.contact.name, from: stage(e.from), to: stage(e.to), date: e.signed_on ? formatDate(e.signed_on, lng) : "",
      outcome: e.outcome ? t(`entry.outcome.${e.outcome}`) : "",
    });
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
 · {t(`pipeline.hispanic.${lead.contact.hispanic_owner}`)}
            </p>
            {/* The SM advisor whose assessment link the owner used. */}
            {lead.completed_by_advisor && (
              <p className="mt-1 text-xs text-muted-foreground">{t("entry_contracts.lead.completed_by", { name: firstName(lead.completed_by_advisor.name) })}</p>
            )}
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
        {props.readOnly && !showGlobalApprove ? (
          <p className="mt-4 rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("pipeline.detail.read_only")}</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={runPrimary} disabled={(props.pending ?? false) || approve.isPending || sendTripartite.isPending || record.isPending || start.isPending || outcome.isPending || (blockedHint !== null && action !== "meeting_outcome")}>
                {t(`pipeline.actions.${action}`, { count: lead.intake?.to_review ?? 0 })}
              </PrimaryButton>
              {canDiscard && !props.readOnly && (
                <button onClick={() => props.onDiscard?.(lead)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("pipeline.actions.discard")}</button>
              )}
              {lead.stage === "documents" && !props.readOnly && (
                <button onClick={() => setRejecting(true)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">{t("intake.reject")}</button>
              )}
              {leadOwner && !props.readOnly && action !== "schedule" && action !== "rebook" && lead.stage !== "discarded" && (
                <button onClick={() => setScheduling(true)} className="text-sm text-link hover:underline">{t("calendar.schedule")}</button>
              )}
            </div>
            {blockedHint && <p className="mt-2 text-xs text-muted-foreground">{blockedHint}</p>}
            {action === "record_funds" && lead.funds?.to_confirm && <p className="mt-2 text-xs text-status-warning-fg">{t("funds.to_confirm_hint")}</p>}
            {action === "start_program" && <p className="mt-2 text-xs text-muted-foreground">{t("funds.start.ready_hint")}</p>}
            {fromOffice && <p className="mt-2 text-xs text-muted-foreground">{t("pipeline.detail.booking_from_office", { name: consultant.full_name })}</p>}
          </>
        )}
      </header>
      {leadOwner && (
        <ScheduleMeetingDialog
          open={scheduling}
          onOpenChange={setScheduling}
          context={{ kind: "lead", lead_id: lead.id }}
          participants={scheduleGuests}
          defaultTopic={lead.business.name}
        />
      )}

      <div className="flex-1 space-y-6 px-6 py-5">
        {/* 1a. Automatic entry: the four phases, the booked meeting and the summary email */}
        {lead.source !== "manual" && <EntryTimeline lead={lead} />}
        <MeetingCard lead={lead} consultantName={consultant?.full_name ?? ""} readOnly={!!props.readOnly} focused={props.focus === "meeting"} pending={outcome.isPending} onOutcome={onOutcome} />
        {/* 1b. Entry checklist (from NDA + MOU on) */}
        {lead.intake && <IntakeChecklist leadId={lead.id} readOnly={!!props.readOnly} validation={lead.validation} />}
        {/* After the documents: the definitive percentages, in parallel with the presentation to the Bishops. */}
        {(lead.stage === "accepted" || (lead.stage === "in_program" && lead.validation)) && (
          <ValidationCard key={`${lead.id}-${lead.validation?.status ?? "none"}`} lead={lead} readOnly={!!props.readOnly || lead.stage !== "accepted"} canClose={admin} />
        )}
        {/* Who SM presented it to and who took it; still a record once the program started (read only there). */}
        {(lead.stage === "documents" || lead.stage === "accepted" || lead.stage === "in_program") && lead.intake && (
          <InvestorsSection leadId={lead.id} businessName={lead.business.name} readOnly={!!props.readOnly} canPresent={lead.stage === "accepted"} />
        )}
        {/* 1c. Bishop funds, once the three signed the tripartite contract (SM only: money) */}
        {lead.funds && lead.business_id && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("funds.funds_title")}</h3>
            <FundsPanel businessId={lead.business_id} mode={props.readOnly ? "read" : "sm"} />
          </section>
        )}
        {/* 1d. Business added by hand: origin and the assessment still to come */}
        {lead.source === "manual" && <ManualLeadSection lead={lead} readOnly={!!props.readOnly} />}
        {/* 2. Assessment result as the owner saw it */}
        {lead.result && <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.result_title")}</h3>
          <div className="mt-2"><AssessmentResult result={lead.result} submittedAt={lead.submitted_at} /></div>
        </section>}

        {/* 2b. The summary email the person got */}
        <SummaryEmail lead={lead} />

        {/* 3. Know-how */}
        {lead.know_how_example && <KnowHow text={lead.know_how_example} />}

        {/* 4. Business data in ranges */}
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.business_title")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-4 text-sm">
            <Item
              label={t("pipeline.industry")}
              value={lead.business.industry === "other_related" && lead.business.activity_other
                ? `${t("pipeline.industries.other_related")}: ${lead.business.activity_other}`
                : t(`pipeline.industries.${lead.business.industry}`)}
            />
            <Item label={t("pipeline.detail.activity")} value={lead.business.activity} />
            <Item label={t("pipeline.revenue")} value={t(`pipeline.revenue_ranges.${lead.business.revenue_range}`)} />
            <Item label={t("pipeline.detail.margin")} value={t(`pipeline.margin_ranges.${lead.business.margin_range ?? "unknown"}`)} />
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
          {!props.readOnly && (
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
          )}
        </section>
      </div>
      {recording && (
        <PaymentDialog
          title={t("funds.record_title", { name: lead.business.name })}
          body={t("funds.record_body")}
          confirm={t("funds.record_confirm")}
          withAmount
          defaultAmount={remaining}
          pending={record.isPending}
          validate={(v) => validateFundPayment(v, remaining)}
          onClose={() => setRecording(false)}
          onSubmit={recordFunds}
        />
      )}
      {starting && lead.funds?.ready_to_start && lead.funds.proposed_day1 && (
        <StartProgramDialog name={lead.business.name} proposed={lead.funds.proposed_day1} pending={start.isPending} onClose={() => setStarting(false)} onConfirm={confirmStart} />
      )}
      {noting && (
        <MeetingNoteDialog
          name={lead.business.name}
          expansion={noting.kind === "expansion"}
          pending={outcome.isPending}
          onClose={() => setNoting(null)}
          onConfirm={(body) => answer(noting, "held", body)}
        />
      )}
      {rejecting && (
        <RejectDocsDialog
          name={lead.business.name}
          pending={reject.isPending}
          onClose={() => setRejecting(false)}
          onConfirm={(reason) => reject.mutate({ id: lead.id, reason }, { onSuccess: () => { setRejecting(false); toast.success(t("intake.t_rejected", { name: lead.business.name })); }, onError: fail })}
        />
      )}
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
