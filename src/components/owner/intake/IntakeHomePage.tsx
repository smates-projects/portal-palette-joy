import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Lock, Video } from "lucide-react";
import { useContracts, useCurrentUser, useDocuments, useIntake, useRules } from "@/lib/api/hooks";
import type { Contract, LeadMeeting } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { entryRules, ndaStatus, oaWaitingUntil, ownerMeetingView, ownerSteps, type OwnerStepKey, type OwnerStepState } from "@/lib/leads/entry-flow";
import { entryMeetings } from "@/lib/leads/meetings";
import { contractDeadline } from "@/lib/leads/contract-rules";
import { isSplitFinal } from "@/lib/leads/validation";
import { missingRequiredDocuments, ownerDocumentsInOrder } from "@/lib/business/owner-documents";
import { ReviewNoteAlert } from "@/components/pipeline/ReviewNoteAlert";
import { cn } from "@/lib/utils";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { SealedCopyLinks } from "@/components/docuseal/SealedCopies";
import { ErrorState, LoadingState, PageHeader, primaryButtonCls } from "../shared";
import { ContractExplainerCard } from "./ContractExplainer";
import { useContractLanguage } from "@/components/docuseal/ContractLanguage";
import { hasContractExplainer, hasContractText } from "@/lib/contracts/language";
import { MouAcceptance } from "./MouAcceptance";

const linkCls = "text-sm text-link hover:underline";

/**
 * "Tu ingreso": what the owner still has to do before the program starts. NDA (Strategic Mates' only NDA, with the
 * window that explains it), MOU (available once the NDA is signed: what it is, the full text, the four points with
 * "Entendí"; signed together at the end of the meeting), Tu reunión, Documentos (locked until the MOU is signed); after the approval,
 * the expansion meeting and the Operating Agreement with its waiting period. One highlighted step at a time.
 * `focusStep` brings one step into view (the mou_ready notification).
 */
export function IntakeHomePage({ focusStep }: { focusStep?: OwnerStepKey | undefined } = {}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const me = useCurrentUser().data;
  const intakeQ = useIntake();
  const contractsQ = useContracts();
  const docsQ = useDocuments();
  const rulesQ = useRules();
  const [signing, setSigning] = useState<Contract | null>(null);
  const [reading, setReading] = useState<Contract | null>(null);
  // One language for every contract window of the page; the reader dialog opens in it.
  const [contractLanguage, setContractLanguage] = useContractLanguage();
  const queries = [intakeQ, contractsQ, docsQ];
  const ready = !!intakeQ.data && !contractsQ.isLoading;

  // Scroll only in the browser, once the steps are on screen.
  useEffect(() => {
    if (!focusStep || !ready) return;
    document.getElementById(`intake-step-${focusStep}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusStep, ready]);

  if (queries.some((q) => q.isError)) return <Wrap><ErrorState onRetry={() => queries.forEach((q) => void q.refetch())} /></Wrap>;
  if (queries.some((q) => q.isLoading) || !intakeQ.data) return <Wrap><LoadingState rows={3} /></Wrap>;

  const s = intakeQ.data;
  const rules = entryRules(rulesQ.data);
  const contracts = (contractsQ.data ?? []).filter((c) => c.area === "intake");
  const nda = contracts.find((c) => c.kind === "nda") ?? null;
  const mou = contracts.find((c) => c.kind === "mou") ?? null;
  const oa = contracts.find((c) => c.kind === "tripartite") ?? null;
  // The Acuerdo de Vinculación: with the rules, every business entering has the step (null until a Bishop accepts).
  const binding = contracts.find((c) => c.kind === "binding") ?? null;
  const usesBinding = !!binding || !oa;
  // What SM asked again first, with its reason, as in Documentos; the count names only the required ones (QA M1, B5).
  const docs = ownerDocumentsInOrder((docsQ.data ?? []).filter((d) => d.area === "intake"));
  const missing = missingRequiredDocuments(docs);
  const entry = s.entry ?? null;
  const steps = ownerSteps({ summary: s, nda, mou, operatingAgreement: oa, rules, ...(usesBinding ? { binding } : {}) });
  const validation = entry?.validation ?? null;
  /** "Tú conservas el 60 %...": the definitive split once Strategic Mates closed the validation. */
  const splitBlock = isSplitFinal(validation) && validation ? (
    <div className="rounded-[4px] border border-border border-l-2 border-l-gold bg-surface px-4 py-3">
      <p className="text-sm font-semibold">{t("entry_contracts.owner.split_title")}</p>
      <p className="mt-1 text-sm">{t("entry_contracts.owner.split_body", { owner: validation.equity_owner, bishop: validation.equity_bishop, sm: validation.equity_sm })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("entry_contracts.owner.split_note")}</p>
    </div>
  ) : null;
  const ownerPending = (c: Contract | null) => !!c?.signers.some((x) => x.party === "owner" && (x.status === "sent" || x.status === "opened"));
  const smSigned = (c: Contract | null) => !!c?.signers.some((x) => x.party === "sm" && x.status === "signed");
  // The API creates the documents at the NDA signature: they say nothing about the meeting (only its outcome does).
  const docsSent = docs.length > 0;
  const readFull = (c: Contract, key: string) =>
    hasContractText(c) ? <button className={linkCls} onClick={() => setReading(c)}>{t(key)}</button> : null;

  const meetings = entryMeetings(entry);
  /** One meeting step: book it, book again, the booked meeting (date, Meet link), waiting for the outcome, or held. */
  const meetingBlock = (m: LeadMeeting | null, kind: "initial" | "expansion", heldAt?: string | null) => {
    const view = ownerMeetingView(m, { heldAt });
    if (view === "held") {
      const at = m?.starts_at ?? heldAt;
      return <p className="text-sm">{at ? t("intake.owner.meeting.held", { date: formatDate(at, lng) }) : t("intake.owner.meeting.held_short")}</p>;
    }
    if (view === "book" || view === "rebook" || !m)
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t(view === "rebook" ? "intake.owner.meeting.rebook" : kind === "expansion" ? "intake.owner.expansion.book" : "intake.owner.meeting.book")}</p>
          {entry?.booking_url && (
            <a href={entry.booking_url} target="_blank" rel="noreferrer" className={primaryButtonCls}>{t("intake.owner.meeting.book_cta")}</a>
          )}
        </div>
      );
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium tabular-nums">
          {m.duration_minutes > 0
            ? t("intake.owner.meeting.when", { date: formatDateTime(m.starts_at, lng), minutes: m.duration_minutes })
            : formatDateTime(m.starts_at, lng)}
        </p>
        {entry?.consultant_name && <p className="text-xs text-muted-foreground">{t("intake.owner.meeting.with", { name: entry.consultant_name })}</p>}
        {view === "waiting_outcome"
          ? <p className="text-sm text-muted-foreground">{t("intake.owner.meeting.waiting_outcome")}</p>
          : m.meet_url
            ? <a href={m.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline"><Video className="h-4 w-4" />{t("intake.owner.meeting.join")}<ExternalLink className="h-3 w-3" /></a>
            : null}
      </div>
    );
  };

  const bodyOf = (key: OwnerStepKey): ReactNode => {
    switch (key) {
      case "nda": {
        if (!nda) return <p className="text-sm text-muted-foreground">{t("intake.owner.nda.not_sent")}</p>;
        if (nda.awaiting_sm_signature || s.nda_awaiting_sm)
          return <p className="text-sm">{t("intake.owner.awaiting_sm")}</p>;
        if (ndaStatus(nda) === "signed")
          return (
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm">{t("intake.owner.nda.signed")}</p>
              {readFull(nda, "intake.owner.nda.view")}
              <SealedCopyLinks contract={nda} />
            </div>
          );
        return (
          <div className="space-y-3">
            {hasContractExplainer(nda) ? (
              <ContractExplainerCard contract={nda} language={contractLanguage} onLanguageChange={setContractLanguage}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t(smSigned(nda) ? "intake.owner.nda.sm_signed" : "intake.owner.nda.both_sign")}</p>
                  {readFull(nda, "intake.owner.nda.read_full")}
                </div>
              </ContractExplainerCard>
            ) : (
              <p className="text-sm text-muted-foreground">{t("intake.owner.nda.body")}</p>
            )}
            {ownerPending(nda) && <button className={primaryButtonCls} onClick={() => setSigning(nda)}>{t("intake.owner.nda.sign")}</button>}
          </div>
        );
      }
      case "meeting":
        // Approved without the meeting row (older programs): the meeting happened before the approval.
        return s.approved_at && !meetings.initial ? <p className="text-sm">{t("intake.owner.meeting.held_short")}</p> : meetingBlock(meetings.initial, "initial");
      case "mou": {
        // The MOU exists as soon as the owner signs the NDA.
        if (!mou) return <p className="text-sm text-muted-foreground">{t("intake.owner.mou.not_sent")}</p>;
        if (mou.awaiting_sm_signature || s.mou_awaiting_sm)
          return <p className="text-sm">{t("intake.owner.awaiting_sm")}</p>;
        if (!ownerPending(mou))
          return (
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm">{t("intake.owner.mou.signed")}</p>
              {readFull(mou, "intake.owner.mou.view")}
              <SealedCopyLinks contract={mou} />
            </div>
          );
        return (
          <div className="space-y-3">
            {hasContractExplainer(mou) ? (
              <ContractExplainerCard contract={mou} language={contractLanguage} onLanguageChange={setContractLanguage}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t("intake.owner.mou.when")}</p>
                  {readFull(mou, "intake.owner.mou.read_full")}
                </div>
              </ContractExplainerCard>
            ) : (
              <p className="text-sm text-muted-foreground">{t("intake.owner.mou.when")}</p>
            )}
            <p className="text-sm text-muted-foreground">{t("intake.owner.mou.body")}</p>
            <MouAcceptance mou={mou} onSign={() => setSigning(mou)} />
          </div>
        );
      }
      case "documents": {
        if (!s.mou_signed_by_owner)
          return (
            <p className="flex items-start gap-2 rounded-[4px] border border-border bg-muted px-3 py-2 text-sm">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{t("intake.owner.docs.locked")}
            </p>
          );
        if (s.approved_at) return <p className="text-sm">{t("intake.owner.docs.approved")}</p>;
        if (!docsSent) return <p className="text-sm text-muted-foreground">{t("intake.owner.docs.preparing")}</p>;
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {missing > 0
                ? t("intake.owner.docs.missing", { count: missing })
                : s.clock.status === "paused" ? t("intake.owner.s3_paused") : t("intake.owner.docs.in_review", { day: Math.max(s.clock.day, 1), total: s.clock.total })}
            </p>
            <ul className="divide-y divide-border rounded-[4px] border border-border text-sm">
              {docs.map((d) => (
                <li key={d.id} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">{d.name}</span>
                    <span className={cn("shrink-0 text-xs", d.state === "rejected" ? "font-medium text-status-danger-fg" : "text-muted-foreground")}>
                      {t(`owner_extra.documents.state_${d.state}`)}
                    </span>
                  </div>
                  {d.state === "rejected" && d.review_comment && <ReviewNoteAlert comment={d.review_comment} className="mt-2" />}
                </li>
              ))}
            </ul>
            <Link to="/documentos" className={primaryButtonCls}>{t("intake.owner.s2_cta")}</Link>
          </div>
        );
      }
      case "expansion":
        return meetingBlock(meetings.expansion, "expansion", entry?.expansion_meeting_held_at ?? null);
      case "binding": {
        if (!binding) return <p className="text-sm text-muted-foreground">{t("entry_contracts.owner.binding_not_yet")}</p>;
        if (!ownerPending(binding))
          return (
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm">{t("entry_contracts.owner.binding_signed")}</p>
              {readFull(binding, "entry_contracts.owner.binding_view")}
              <SealedCopyLinks contract={binding} />
            </div>
          );
        return (
          <div className="space-y-3">
            {hasContractExplainer(binding) && (
              <ContractExplainerCard contract={binding} language={contractLanguage} onLanguageChange={setContractLanguage}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium">{t("entry_contracts.owner.binding_when")}</p>
                  {readFull(binding, "entry_contracts.owner.binding_read")}
                </div>
              </ContractExplainerCard>
            )}
            <button className={primaryButtonCls} onClick={() => setSigning(binding)}>{t("entry_contracts.owner.binding_sign")}</button>
          </div>
        );
      }
      case "operating_agreement": {
        if (!oa)
          return (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t(usesBinding ? "entry_contracts.owner.oa_waiting" : "intake.owner.oa.not_sent")}</p>
              {splitBlock}
            </div>
          );
        if (!ownerPending(oa)) return <div className="space-y-3"><p className="text-sm">{t("intake.owner.oa.signed")}</p><SealedCopyLinks contract={oa} />{splitBlock}</div>;
        const until = oaWaitingUntil(oa, rules.oa_waiting_days);
        const deadline = contractDeadline(oa);
        return (
          <div className="space-y-3">
            {hasContractExplainer(oa) ? <ContractExplainerCard contract={oa} language={contractLanguage} onLanguageChange={setContractLanguage}>{readFull(oa, "entry_contracts.owner.oa_read")}</ContractExplainerCard> : <p className="text-sm text-muted-foreground">{t("intake.owner.oa.body")}</p>}
            {splitBlock}
            {deadline.state === "open" && <p className="text-sm font-medium">{t("entry_contracts.owner.oa_deadline", { date: formatDate(deadline.sign_by, lng) })}</p>}
            {deadline.state === "overdue" && <p className="rounded-[4px] border border-status-danger-border bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">{t("entry_contracts.owner.oa_overdue", { date: formatDate(deadline.sign_by, lng) })}</p>}
            {until
              ? <p className="rounded-[4px] border border-border bg-muted px-3 py-2 text-sm">{t("intake.owner.oa.waiting", { date: formatDate(until, lng) })}</p>
              : <button className={primaryButtonCls} onClick={() => setSigning(oa)}>{t("intake.owner.oa.sign")}</button>}
          </div>
        );
      }
    }
  };

  return (
    <Wrap>
      <ol className="mt-6 space-y-3">
        {steps.map((st, i) => (
          <Step key={st.key} id={`intake-step-${st.key}`} n={i + 1} state={st.state} title={t(`intake.owner.steps.${st.key}`)}>{bodyOf(st.key)}</Step>
        ))}
      </ol>
      {signing && <DocuSealSigner contract={signing} language={contractLanguage} party="owner" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
      {reading && <SignedContractDialog contract={reading} language={contractLanguage} onClose={() => setReading(null)} />}
    </Wrap>
  );
}

function Step({ id, n, state, title, children }: { id: string; n: number; state: OwnerStepState; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const active = state === "current";
  return (
    <li id={id} className={cn("scroll-mt-20 rounded-[4px] border bg-surface p-4", active ? "border-primary" : "border-border")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {state === "done" && <Check className="h-4 w-4 text-status-success-fg" />}
        <span>{t("intake.owner.step", { n })}</span>
        {!active && <span>· {state === "done" ? t("intake.owner.done") : t("intake.owner.next")}</span>}
      </div>
      <h2 className={cn("mt-1 font-semibold", active ? "text-lg" : "text-sm")}>{title}</h2>
      <div className={cn("mt-2", !active && state !== "done" && "opacity-80")}>{children}</div>
    </li>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader question={t("intake.owner.question")} />
      {children}
    </div>
  );
}
