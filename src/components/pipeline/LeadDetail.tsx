import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Mail, MapPin, Phone, X } from "lucide-react";
import {
  useAddLeadNote, useApproveDocuments, useBusinessFunds, useConfirmProgramStart, useCurrentUser, useLeadDetail, useLeadIntake, useLeadInvestors, useOrganizations,
  useReactivateLead, useRecordFundPayment, useRegisterMeeting, useRejectDocuments, useRemoveFundPayment, useRules, useSendTripartite, useSetMeetingOutcome, useTransferLead, useUsers,
} from "@/lib/api/hooks";
import { AUTO_DISCARD_MOU_NOT_SIGNED, bookingKind, canAnswerOutcome, entryRules, heldWithoutMou, oaSendBlock } from "@/lib/leads/entry-flow";
import { MouUnsignedDialog } from "./LeadDialogs";
import { RegisterMeetingDialog } from "./RegisterMeetingDialog";
import { TransferDialog, canTransfer } from "./TransferDialog";
import { meetingIdOf } from "@/lib/leads/meetings";
import { nowIso } from "@/lib/clock";
import { leadMeetingPeople, leadOwnerOf, scheduleRoute } from "@/lib/leads/scheduling";
import { isCalendarConnected } from "@/lib/calendar/scheduling";
import type { LeadMeeting, MeetingOutcome } from "@/lib/api/types";
import { validateFundPayment } from "@/lib/leads/funds";
import { FundsPanel } from "@/components/funds/FundsPanel";
import { PaymentDialog, type PaymentFormValue } from "@/components/funds/parts";
import { StartProgramDialog } from "@/components/funds/StartProgramDialog";
import { InvestorsSection } from "./InvestorsSection";
import { isDocsAdmin } from "@/lib/leads/onboarding";
import { ContractsSummaryTable, IntakeContracts, IntakeDocuments, RejectDocsDialog } from "./IntakeChecklist";
import type { LeadEvent, LeadWithComputed } from "@/lib/api/types";
import { firstName, formatDate, formatDateTime, formatTime, formatWeekdayDate } from "@/lib/format";
import { ValidationCard } from "./ValidationCard";
import { primaryActionFor } from "@/lib/leads/pipeline";
import { GROUPABLE_KINDS, collapseEvents, leadJourney, pendingBlock, type PendingBlock } from "@/lib/leads/journey";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { OpennessNote, StageBadge } from "./LeadBadges";
import { ManualLeadSection } from "./ManualLeadSection";
import { AssessmentResult, KnowHow } from "./AssessmentResult";
import { MeetingCard, MeetingNoteDialog, SummaryEmail } from "./EntrySections";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";
import { cn } from "@/lib/utils";

const sectionTitle = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const DETAIL_TABS = ["resumen", "ingreso", "documentos", "inversores", "actividad"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

/**
 * Detail of one lead. With `readOnly` (SM Global) there are no actions and no note box: it only shows what the
 * office knows. Without it, `onPrimary`, `onDiscard` and `pending` are required in practice.
 *
 * Layout: a sticky header (who it is and the actions), the eight-step journey strip, "Lo que toca hacer" with the
 * one block that needs action now, and the tabs Resumen, Ingreso, Documentos, Inversores and Actividad.
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
  // "Se hizo" with the MOU unsigned: the warning before the answer goes out.
  const [warning, setWarning] = useState<LeadMeeting | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [tab, setTab] = useState<DetailTab>("resumen");
  const outcome = useSetMeetingOutcome();
  const reactivate = useReactivateLead();
  const register = useRegisterMeeting();
  const transfer = useTransferLead();
  const orgsQ = useOrganizations();
  const rules = entryRules(useRules().data);
  const businessIdForFunds = q.data?.lead.funds ? q.data.lead.business_id ?? undefined : undefined;
  const fundsQ = useBusinessFunds(businessIdForFunds);
  const userName = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");
  // The entry contracts (cached with the checklist): with an Acuerdo de Vinculación the OA is created by its rule.
  const intakeQ = useLeadIntake(q.data?.lead.intake ? props.leadId : undefined);
  // The Bishop who accepted the lead joins its expansion meeting (shared with the Inversores section's query).
  const investorsQ = useLeadInvestors(q.data?.lead.stage === "accepted" || q.data?.lead.stage === "in_program" ? props.leadId : undefined);

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
  // With the SM user's Google Calendar connected, the portal schedules it and invites the lead's email.
  const smConnected = isCalendarConnected(meQ.data);
  const admin = isDocsAdmin(meQ.data, lead.office_id);
  const approval = lead.intake?.approval;
  // "Agendar reunión" / "Reagendar" through the booking link needs a link: without one the button waits for it.
  const bookingRoute = scheduleRoute(action, !!leadOwner, smConnected);
  const noBookingUrl = bookingRoute === "booking_link" && !lead.booking_url;
  // Why the primary action is disabled (shown under it), or null when it can be used.
  const blockedHint =
    noBookingUrl ? t("pipeline.detail.no_booking_url") :
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
  const mouSigned = !!lead.intake?.mou_signed_by_owner;
  /** "Se hizo" asks for the note first; the other two answers go at once. */
  const answer = (m: LeadMeeting, value: MeetingOutcome, note?: string) => {
    const meetingId = meetingIdOf(m);
    // Never a silent no-op: without the meeting's id the API cannot take the answer, so say so.
    if (!meetingId) {
      setNoting(null);
      setWarning(null);
      toast.error(t("entry.errors.meeting_id_missing"));
      return;
    }
    const discards = heldWithoutMou(value, m.kind, mouSigned);
    outcome.mutate({ leadId: lead.id, meetingId, input: { outcome: value, note: note ?? null } }, {
      onSuccess: (after) => {
        setNoting(null);
        setWarning(null);
        const key = discards || after.stage === "discarded" ? "entry.outcome.t_held_discarded" : `entry.outcome.t_${value}${m.kind === "expansion" ? "_expansion" : ""}`;
        toast.success(t(key, { name: lead.business.name }));
      },
      onError: fail,
    });
  };
  const onOutcome = (m: LeadMeeting, value: MeetingOutcome) => {
    if (!meetingIdOf(m)) return answer(m, value);
    // The MOU is signed together at the end of the meeting: "Se hizo" without it makes the lead leave the process.
    if (heldWithoutMou(value, m.kind, mouSigned)) return setWarning(m);
    return value === "held" ? setNoting(m) : answer(m, value);
  };
  const globalReader = meQ.data?.role === "sm_global";
  // Only SM Global brings a discarded lead back, always through reactivate (never a move); the office never sees it.
  const canReactivate = globalReader && lead.stage === "discarded";
  const onReactivate = () =>
    reactivate.mutate(lead.id, {
      onSuccess: (back) => toast.success(t("pipeline.t_reactivated", { name: lead.business.name, to: t(`pipeline.stages.${back.stage}`) })),
      onError: fail,
    });
  // "Registrar reunión": the consultant (office) or SM Global, on an evaluated lead or after a reschedule.
  const registerKind = bookingKind(lead);
  const canRegister = (registerKind === "initial" || registerKind === "rebook" || registerKind === "expansion") && (globalReader || (meQ.data?.role === "sm_team" && !props.readOnly));
  const onRegister = (input: import("@/lib/api/types").RegisterMeetingInput) =>
    register.mutate({ id: lead.id, input }, {
      onSuccess: (after) => {
        setRegistering(false);
        const m = registerKind === "expansion" ? after.expansion_meeting : after.meeting;
        const past = Date.parse(input.starts_at) <= Date.parse(nowIso());
        toast.success(t("entry.register.t_done", { name: lead.business.name, date: m ? formatDateTime(m.starts_at, lng) : "" }), past ? {
          // A meeting that already happened: mark how it went right away.
          action: { label: t("entry.register.how_did_it_go"), onClick: () => document.getElementById("lead-meeting")?.scrollIntoView({ behavior: "smooth", block: "center" }) },
        } : undefined);
      },
      onError: (e) => toast.error(e instanceof Error && ["invalid_transition", "invalid_url", "invalid_date"].includes(e.message) ? t(`entry.register.errors.${e.message}`) : t("pipeline.t_error")),
    });
  const transferable = canTransfer(meQ.data, lead.office_id) && lead.stage !== "discarded";
  const officeName = orgsQ.data?.find((o) => o.id === lead.office_id)?.name ?? "";
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
    if (bookingRoute === "dialog") return setScheduling(true);
    // Without a link nothing opens and nothing moves: the hint under the button says where to load one.
    if (bookingRoute === "booking_link" && !lead.booking_url) return;
    if (bookingRoute === "booking_link" && action === "rebook") {
      // Open synchronously from the click so the browser does not block the new tab.
      window.open(lead.booking_url!, "_blank", "noopener,noreferrer");
      return;
    }
    props.onPrimary?.(lead);
  };
  const remaining = fundsQ.data?.remaining ?? 0;
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
  const fromOffice = action === "schedule" && !!lead.booking_url && (lead.booking_url_source ? lead.booking_url_source === "office" : !!consultant && !consultant.booking_url);
  const canDiscard = lead.stage !== "in_program" && lead.stage !== "discarded" && lead.stage !== "documents";
  // A discarded lead has no primary action: the office waits, SM Global reactivates it from the header.
  const showPrimary = lead.stage !== "discarded";

  const describe = (e: LeadEvent) => {
    // The API names the actor; the office could not list SM Global's people otherwise ("Marilyn lo reactivó").
    const actor = e.actor_name || userName(e.actor_user_id) || t("pipeline.events.actor_fallback");
    const stage = (s: string | null) => (s ? t(`pipeline.stages.${s}`) : "");
    // A kind without its sentence (a retired one, or one newer than this screen) never shows its raw key.
    const key = i18n.exists(`pipeline.events.${e.kind}`) ? `pipeline.events.${e.kind}` : "pipeline.events.other";
    return t(key, {
      actor, owner: lead.contact.name, from: stage(e.from), to: stage(e.to), date: e.signed_on ? formatDate(e.signed_on, lng) : "",
      outcome: e.outcome ? t(`entry.outcome.${e.outcome}`) : "",
      // transferred: the office name travels in the body ("Derivado a SM Orlando por Marilyn").
      office: e.kind === "transferred" ? e.body ?? "" : "",
    });
  };
  const actorOf = (e: LeadEvent) => e.actor_name || userName(e.actor_user_id) || t("pipeline.events.actor_fallback");
  /** The automatic discard carries a code, not a free text: it reads in plain words. */
  const discardText = (reason: string) =>
    reason === AUTO_DISCARD_MOU_NOT_SIGNED ? t("pipeline.detail.discard_mou_not_signed") : t("pipeline.detail.discard_reason", { reason });
  const submitNote = () => {
    if (!note.trim()) return;
    addNote.mutate({ id: lead.id, body: note }, {
      onSuccess: () => { setNote(""); toast.success(t("pipeline.t_note")); },
      onError: () => toast.error(t("pipeline.t_error")),
    });
  };

  // The journey strip, "Lo que toca hacer" and the tabs.
  const journey = leadJourney(lead, intakeQ.data?.contracts ?? [], investorsQ.data);
  const validationOpen = lead.stage === "accepted" && lead.validation?.status !== "closed";
  const pending = pendingBlock(action, validationOpen);
  const nextKey = `pipeline.detail.todo.next.${action}`;
  const nextText = i18n.exists(nextKey) ? t(nextKey) : t("pipeline.detail.todo.next.generic");
  const readOnly = !!props.readOnly;

  const meetingCard = (
    <MeetingCard lead={lead} consultantName={consultant?.full_name ?? ""} readOnly={readOnly} canAnswer={(m) => canAnswerOutcome(meQ.data, lead, m)} focused={props.focus === "meeting"} pending={outcome.isPending} onOutcome={onOutcome} />
  );
  const validationCard = (lead.stage === "accepted" || (lead.stage === "in_program" && lead.validation)) ? (
    <ValidationCard key={`${lead.id}-${lead.validation?.status ?? "none"}`} lead={lead} readOnly={readOnly || lead.stage !== "accepted"} canClose={admin} />
  ) : null;
  const investorsSection = (lead.stage === "documents" || lead.stage === "accepted" || lead.stage === "in_program") && lead.intake ? (
    <InvestorsSection leadId={lead.id} businessName={lead.business.name} readOnly={readOnly} canPresent={lead.stage === "accepted"} />
  ) : null;
  const fundsSection = lead.funds && lead.business_id ? (
    <section className="space-y-2">
      <h3 className={sectionTitle}>{t("funds.funds_title")}</h3>
      <FundsPanel businessId={lead.business_id} mode={readOnly ? "read" : "sm"} />
    </section>
  ) : null;

  /** The one block that needs action now, moved under the strip while it is pending. */
  const pendingContent = (block: Exclude<PendingBlock, null>) => {
    switch (block) {
      case "meeting": return meetingCard;
      case "docs": return <IntakeDocuments leadId={lead.id} readOnly={readOnly} variant="table" />;
      case "contracts": return <IntakeContracts leadId={lead.id} readOnly={readOnly} validation={lead.validation} withHeader={false} />;
      case "validation": return validationCard;
      case "investors": return investorsSection;
      case "funds": return fundsSection;
    }
  };

  const noteBox = !readOnly && (
    <div className="space-y-2">
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
  );

  // The activity history, newest first, grouped by day.
  const newestFirst = [...events].reverse();
  const days: { day: string; events: LeadEvent[] }[] = [];
  for (const e of newestFirst) {
    const day = e.created_at.slice(0, 10);
    const last = days.at(-1);
    if (last && last.day === day) last.events.push(e);
    else days.push({ day, events: [e] });
  }

  const resultSummary = lead.result
    ? t("pipeline.detail.result_summary", {
        score: lead.result.score ?? 0,
        band: lead.result.band ? t(`pipeline.bands.${lead.result.band}`) : "",
        strengths: lead.result.strengths.length,
        priorities: lead.result.priorities.length,
      })
    : "";
  const emailSummary = lead.summary_sent_at
    ? t("pipeline.detail.email_summary", {
        subject: t("entry.email.subject", { name: firstName(lead.contact.name), date: lead.meeting ? formatDate(lead.meeting.starts_at, lng) : "" }),
        date: formatDateTime(lead.summary_sent_at, lng),
      })
    : t("pipeline.detail.email_not_sent");

  return (
    <div className="flex min-h-full flex-col">
      {/* 1. Sticky header: who it is, the stage and the actions */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={lead.stage} />
              <span className="text-xs text-muted-foreground">{t("pipeline.consultant")} {consultant?.full_name}{officeName ? ` · ${officeName}` : ""}</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{lead.business.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lead.contact.name}
               · {t(`pipeline.hispanic.${lead.contact.hispanic_owner}`)}
            </p>
            {/* The owner's closing answer to the assessment, so the consultant knows how convinced he is. */}
            <OpennessNote result={lead.result} className="mt-1" />
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
          <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">{discardText(lead.discard_reason)}</p>
        )}
        {/* SM Global brings back a discarded lead (by hand or by the API); the office cannot. */}
        {canReactivate && (
          <div className="mt-3">
            <PrimaryButton onClick={onReactivate} disabled={reactivate.isPending}>{t("pipeline.actions.reactivate")}</PrimaryButton>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("pipeline.detail.reactivate_hint", { to: t(`pipeline.stages.${lead.discarded_from ?? "evaluated"}`) })}</p>
          </div>
        )}
        {/* A meeting agreed by hand: the consultant from the embudo, SM Global from its read-only view. */}
        {canRegister && (
          <div className="mt-3">
            <button onClick={() => setRegistering(true)} className="text-sm text-link hover:underline">{t("entry.register.action")}</button>
          </div>
        )}
        {/* "Derivar a oficina": SM Global from its read-only view, the office admin from the embudo. */}
        {transferable && (
          <div className="mt-3">
            <button onClick={() => setTransferring(true)} className="text-sm text-link hover:underline">{t("pipeline.actions.transfer")}</button>
          </div>
        )}
        {props.readOnly && !showGlobalApprove ? (
          <p className="mt-4 rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("pipeline.detail.read_only")}</p>
        ) : !showPrimary ? null : (
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
            {fromOffice && <p className="mt-2 text-xs text-muted-foreground">{t("pipeline.detail.booking_from_office", { name: consultant?.full_name ?? "" })}</p>}
          </>
        )}
      </header>
      <ScheduleMeetingDialog
        open={scheduling}
        onOpenChange={setScheduling}
        context={{ kind: "lead", lead_id: lead.id }}
        participants={leadMeetingPeople(lead, leadOwner, investorsQ.data?.bishop)}
        guestEmail={lead.contact.email}
        defaultTopic={lead.business.name}
        onRegisterManually={canRegister ? () => { setScheduling(false); setRegistering(true); } : undefined}
      />

      {/* 2. The eight-step journey strip */}
      <JourneyStrip steps={journey} />

      <div className="flex-1 px-6 py-5">
        {/* 3. Lo que toca hacer: the one pending block, or a quiet line with the next automatic step */}
        {pending && pendingContent(pending) ? (
          <section aria-label={t("pipeline.detail.todo.title")} className="rounded-[4px] border border-border border-l-2 border-l-gold bg-surface p-4">
            <h3 className={sectionTitle}>{t("pipeline.detail.todo.title")}</h3>
            <div className="mt-3">{pendingContent(pending)}</div>
          </section>
        ) : (
          <div className="rounded-[4px] border border-dashed border-border px-4 py-3">
            <p className="text-sm font-medium">{t("pipeline.detail.todo.empty")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{nextText}</p>
          </div>
        )}

        {/* 4. Tabs */}
        <DetailTabs tab={tab} onChange={setTab} />
        <div role="tabpanel" id={`lead-panel-${tab}`} aria-labelledby={`lead-tab-${tab}`} className="mt-4">
          {tab === "resumen" && (
            <div className="space-y-6">
              {pending !== "meeting" && meetingCard}
              {/* Business added by hand: origin and the assessment still to come */}
              {lead.source === "manual" && <ManualLeadSection lead={lead} readOnly={readOnly} />}
              {intakeQ.data && (
                <section className="space-y-2">
                  <h3 className={sectionTitle}>{t("intake.title")}</h3>
                  <ContractsSummaryTable contracts={intakeQ.data.contracts} />
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t("pipeline.detail.docs_counter", { uploaded: intakeQ.data.summary.uploaded, total: intakeQ.data.summary.required_total, accepted: intakeQ.data.summary.accepted })}
                  </p>
                </section>
              )}
              <section>
                <h3 className={sectionTitle}>{t("pipeline.detail.business_title")}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border p-4 text-sm">
                  <Item
                    label={t("pipeline.industry")}
                    value={lead.business.industry === "other_related" && lead.business.activity_other
                      ? `${t("pipeline.industries.other_related")}, ${lead.business.activity_other}`
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
              {lead.know_how_example && <KnowHow text={lead.know_how_example} />}
              {lead.result && (
                <Collapsed label={t("pipeline.detail.result_title")} summary={resultSummary}>
                  <AssessmentResult result={lead.result} submittedAt={lead.submitted_at} />
                </Collapsed>
              )}
              <Collapsed label={t("entry.email.title")} summary={emailSummary}>
                <SummaryEmail lead={lead} copy={q.data.summary_email} />
              </Collapsed>
              {newestFirst.length > 0 && (
                <section>
                  <h3 className={sectionTitle}>{t("pipeline.detail.activity_title")}</h3>
                  <ol className="mt-2 space-y-3">
                    {newestFirst.slice(0, 3).map((e) => (
                      <li key={e.id} className="text-sm">
                        <p>{describe(e)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.created_at, lng)}</p>
                      </li>
                    ))}
                  </ol>
                  <button onClick={() => setTab("actividad")} className="mt-2 text-sm text-link hover:underline">{t("pipeline.detail.view_all_activity")}</button>
                </section>
              )}
            </div>
          )}

          {tab === "ingreso" && (
            lead.intake
              ? pending === "contracts"
                ? <MovedNote />
                : <IntakeContracts leadId={lead.id} readOnly={readOnly} validation={lead.validation} />
              : <EmptyNote text={t("pipeline.detail.no_intake")} />
          )}

          {tab === "documentos" && (
            lead.intake
              ? pending === "docs"
                ? <MovedNote />
                : <IntakeDocuments leadId={lead.id} readOnly={readOnly} variant="table" />
              : <EmptyNote text={t("pipeline.detail.no_intake")} />
          )}

          {tab === "inversores" && (
            <div className="space-y-6">
              {pending !== "validation" && validationCard}
              {pending !== "investors" && investorsSection}
              {pending !== "funds" && fundsSection}
              {!validationCard && !investorsSection && !fundsSection && <EmptyNote text={t("pipeline.detail.investors_empty")} />}
            </div>
          )}

          {tab === "actividad" && (
            <section className="space-y-4">
              {noteBox}
              <ol className="space-y-4">
                {days.map((d) => (
                  <li key={d.day}>
                    <h4 className="text-xs font-medium text-muted-foreground">{formatWeekdayDate(d.day, lng)}</h4>
                    <ol className="mt-1.5 space-y-2.5">
                      {collapseEvents(d.events).map((group) => (
                        <EventLine key={group[0]!.id} group={group} describe={describe} actorOf={actorOf} lng={lng} />
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
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
      {registering && (
        <RegisterMeetingDialog name={lead.business.name} rebook={registerKind === "rebook"} expansion={registerKind === "expansion"} pending={register.isPending} onClose={() => setRegistering(false)} onConfirm={onRegister} />
      )}
      {warning && (
        <MouUnsignedDialog
          name={lead.business.name}
          pending={outcome.isPending}
          onClose={() => setWarning(null)}
          onReschedule={() => answer(warning, "reschedule")}
          onConfirm={() => answer(warning, "held")}
        />
      )}
      {transferring && (
        <TransferDialog
          name={lead.business.name}
          currentOfficeId={lead.office_id}
          pending={transfer.isPending}
          onClose={() => setTransferring(false)}
          onConfirm={(input, labels) =>
            transfer.mutate({ id: lead.id, input }, {
              onSuccess: () => { setTransferring(false); toast.success(t("pipeline.transfer.t_done", { name: lead.business.name, office: labels.office, consultant: labels.consultant })); },
              onError: (e) => toast.error(e instanceof Error && ["admin_only", "invalid_consultant", "same_office"].includes(e.message) ? t(`pipeline.transfer.errors.${e.message}`) : t("pipeline.t_error")),
            })
          }
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

/** The eight steps of the lead in one row: date under each completed one, the current one in gold, pending in grey. */
function JourneyStrip({ steps }: { steps: ReturnType<typeof leadJourney> }) {
  const { t, i18n } = useTranslation();
  return (
    <nav aria-label={t("pipeline.detail.journey.title")} className="border-b border-border bg-surface px-6 py-3">
      <ol className="flex gap-2 overflow-x-auto">
        {steps.map((s) => (
          <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="min-w-16 flex-1">
            <span className={cn("flex items-center gap-1.5 text-[11px] font-medium", s.state === "current" ? "text-gold" : s.state === "pending" ? "text-muted-foreground" : "text-foreground")}>
              <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-[2px]", s.state === "done" ? "bg-primary" : s.state === "current" ? "bg-gold" : "bg-status-neutral-border")} />
              <span className="truncate">{t(`pipeline.detail.journey.${s.key}`)}</span>
            </span>
            <span className="mt-0.5 block pl-3.5 text-[10px] tabular-nums text-muted-foreground">{s.at ? formatDate(s.at, i18n.language) : t("pipeline.detail.journey.pending")}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The tabs of the detail, keyboard navigable with the arrow keys. */
function DetailTabs({ tab, onChange }: { tab: DetailTab; onChange: (tab: DetailTab) => void }) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = DETAIL_TABS.indexOf(tab);
    const next = DETAIL_TABS[(i + (e.key === "ArrowRight" ? 1 : DETAIL_TABS.length - 1)) % DETAIL_TABS.length];
    onChange(next);
    refs.current[DETAIL_TABS.indexOf(next)]?.focus();
  };
  return (
    <div role="tablist" aria-label={t("pipeline.detail.open_full")} onKeyDown={onKeyDown} className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
      {DETAIL_TABS.map((key, i) => (
        <button
          key={key}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          id={`lead-tab-${key}`}
          aria-selected={tab === key}
          aria-controls={`lead-panel-${key}`}
          tabIndex={tab === key ? 0 : -1}
          onClick={() => onChange(key)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === key ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t(`pipeline.detail.tabs.${key}`)}
        </button>
      ))}
    </div>
  );
}

/** A section collapsed behind a button with aria-expanded and its one-line summary. */
function Collapsed({ label, summary, children }: { label: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-md border border-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {!open && summary && <p className="px-4 pb-2.5 text-xs text-muted-foreground">{summary}</p>}
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </section>
  );
}

/** "Lo tienes arriba, en Lo que toca hacer": the tab whose block is moved up while it is pending. */
function MovedNote() {
  const { t } = useTranslation();
  return <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("pipeline.detail.todo.moved")}</p>;
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{text}</p>;
}

/**
 * One line of the activity history. Consecutive events of the same kind by the same person within five minutes
 * collapse into one line ("Marilyn Boraei aceptó 13 documentos, 10:54 p.m.") with an expander that lists them.
 */
function EventLine({ group, describe, actorOf, lng }: { group: LeadEvent[]; describe: (e: LeadEvent) => string; actorOf: (e: LeadEvent) => string; lng: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const head = group[0]!;
  if (group.length === 1)
    return (
      <li className="text-sm">
        <p>{describe(head)}</p>
        {/* The automatic discard logs a code, never shown raw. */}
        {head.body && head.kind !== "transferred" && (
          <p className="mt-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{head.kind === "discarded" && head.body === AUTO_DISCARD_MOU_NOT_SIGNED ? t("pipeline.detail.discard_mou_not_signed") : head.body}</p>
        )}
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatDateTime(head.created_at, lng)}</p>
      </li>
    );
  const text = (GROUPABLE_KINDS as readonly string[]).includes(head.kind)
    ? t(`pipeline.events.${head.kind}_many`, { actor: actorOf(head), count: group.length })
    : t("pipeline.events.and_more", { text: describe(head), count: group.length - 1 });
  return (
    <li className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <p>
          {text}
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">{formatTime(head.created_at, lng)}</span>
        </p>
        <button type="button" aria-expanded={open} aria-label={t("pipeline.detail.events_expand")} onClick={() => setOpen((o) => !o)} className="rounded-md p-0.5 text-muted-foreground hover:bg-muted">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <ol className="mt-1 space-y-1 border-l border-border pl-3 text-xs text-muted-foreground">
          {group.map((e) => (
            <li key={e.id}>{describe(e)} · <span className="tabular-nums">{formatTime(e.created_at, lng)}</span></li>
          ))}
        </ol>
      )}
    </li>
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
