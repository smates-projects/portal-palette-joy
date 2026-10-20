import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ExternalLink, Lock, Video } from "lucide-react";
import { useContracts, useCurrentUser, useDocuments, useIntake, useProposeOwnNda, useRules } from "@/lib/api/hooks";
import type { Contract, LeadMeeting } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { meetingHeld } from "@/lib/leads/entry";
import { entryRules, ndaStatus, oaWaitingUntil, ownNdaPending, ownerSteps, type OwnerStepKey, type OwnerStepState } from "@/lib/leads/entry-flow";
import { cn } from "@/lib/utils";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { ErrorState, LoadingState, PageHeader, primaryButtonCls } from "../shared";
import { MouAcceptance } from "./MouAcceptance";

const linkCls = "text-sm text-link hover:underline";

/**
 * "Tu ingreso": what the owner still has to do before the program starts. Firma el NDA, Tu reunión, MOU (the four
 * points with "Entendí"), Documentos (locked until the MOU is signed); after the approval, the expansion meeting and
 * the Operating Agreement with its waiting period. One highlighted step at a time.
 */
export function IntakeHomePage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const me = useCurrentUser().data;
  const intakeQ = useIntake();
  const contractsQ = useContracts();
  const docsQ = useDocuments();
  const rulesQ = useRules();
  const proposeOwn = useProposeOwnNda();
  const fileInput = useRef<HTMLInputElement>(null);
  const [signing, setSigning] = useState<Contract | null>(null);
  const queries = [intakeQ, contractsQ, docsQ];

  if (queries.some((q) => q.isError)) return <Wrap><ErrorState onRetry={() => queries.forEach((q) => void q.refetch())} /></Wrap>;
  if (queries.some((q) => q.isLoading) || !intakeQ.data) return <Wrap><LoadingState rows={3} /></Wrap>;

  const s = intakeQ.data;
  const rules = entryRules(rulesQ.data);
  const contracts = (contractsQ.data ?? []).filter((c) => c.area === "intake");
  const nda = contracts.find((c) => c.kind === "nda") ?? null;
  const mou = contracts.find((c) => c.kind === "mou") ?? null;
  const oa = contracts.find((c) => c.kind === "tripartite") ?? null;
  const docs = (docsQ.data ?? []).filter((d) => d.area === "intake");
  const missing = docs.filter((d) => d.state === "requested" || d.state === "rejected").length;
  const entry = s.entry ?? null;
  const steps = ownerSteps({ summary: s, nda, mou, operatingAgreement: oa, rules });
  const ownerPending = (c: Contract | null) => !!c?.signers.some((x) => x.party === "owner" && (x.status === "sent" || x.status === "opened"));

  const onOwnNda = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !nda) return;
    proposeOwn.mutate({ contractId: nda.id, file }, {
      onSuccess: () => toast.success(t("intake.owner.nda.t_own_sent")),
      onError: (e) => toast.error(e instanceof Error && e.message === "own_nda_pending" ? t("intake.owner.nda.own_pending") : t("owner_extra.common.t_error")),
    });
  };

  const meetingBlock = (m: LeadMeeting | null, kind: "initial" | "expansion") => {
    if (!m || m.outcome === "no_show" || m.outcome === "reschedule")
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t(m ? "intake.owner.meeting.rebook" : kind === "expansion" ? "intake.owner.expansion.book" : "intake.owner.meeting.book")}</p>
          {entry?.booking_url && (
            <a href={entry.booking_url} target="_blank" rel="noreferrer" className={primaryButtonCls}>{t("intake.owner.meeting.book_cta")}</a>
          )}
        </div>
      );
    if (m.outcome === "held") return <p className="text-sm">{t("intake.owner.meeting.held", { date: formatDate(m.starts_at, lng) })}</p>;
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium tabular-nums">{t("intake.owner.meeting.when", { date: formatDateTime(m.starts_at, lng), minutes: m.duration_minutes })}</p>
        {entry?.consultant_name && <p className="text-xs text-muted-foreground">{t("intake.owner.meeting.with", { name: entry.consultant_name })}</p>}
        {meetingHeld(m)
          ? <p className="text-sm text-muted-foreground">{t("intake.owner.meeting.waiting_outcome")}</p>
          : <a href={m.meet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline"><Video className="h-4 w-4" />{t("intake.owner.meeting.join")}<ExternalLink className="h-3 w-3" /></a>}
      </div>
    );
  };

  const bodyOf = (key: OwnerStepKey): ReactNode => {
    switch (key) {
      case "nda": {
        if (!nda) return <p className="text-sm text-muted-foreground">{t("intake.owner.nda.not_sent")}</p>;
        if (ndaStatus(nda) === "signed") return <p className="text-sm">{t(nda.source === "own" ? "intake.owner.nda.own_accepted" : "intake.owner.nda.signed")}</p>;
        if (ownNdaPending(nda))
          return (
            <div className="rounded-[4px] border border-border bg-surface px-3 py-2 text-sm">
              <p className="font-medium">{t("intake.owner.nda.waiting_review")}</p>
              <p className="text-xs text-muted-foreground">{nda.own_file_name}</p>
            </div>
          );
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("intake.owner.nda.body")}</p>
            {nda.own_review_comment && <p className="text-sm text-status-warning-fg">{t("intake.owner.nda.own_rejected", { comment: nda.own_review_comment })}</p>}
            <div className="flex flex-wrap items-center gap-4">
              {ownerPending(nda) && <button className={primaryButtonCls} onClick={() => setSigning(nda)}>{t("intake.owner.nda.sign")}</button>}
              <button className={linkCls} disabled={proposeOwn.isPending} onClick={() => fileInput.current?.click()}>{t("intake.owner.nda.own")}</button>
            </div>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onOwnNda(e.target.files?.[0])} />
          </div>
        );
      }
      case "meeting":
        return mou ? <p className="text-sm">{t("intake.owner.meeting.held_short")}</p> : meetingBlock(entry?.meeting ?? null, "initial");
      case "mou": {
        if (!mou) return <p className="text-sm text-muted-foreground">{t("intake.owner.mou.not_sent")}</p>;
        if (!ownerPending(mou)) return <p className="text-sm">{t("intake.owner.mou.signed")}</p>;
        return (
          <div className="space-y-3">
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
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {missing > 0
                ? t("intake.owner.docs.missing", { count: missing })
                : s.clock.status === "paused" ? t("intake.owner.s3_paused") : t("intake.owner.docs.in_review", { day: Math.max(s.clock.day, 1), total: s.clock.total })}
            </p>
            <ul className="divide-y divide-border rounded-[4px] border border-border text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">{d.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`owner_extra.documents.state_${d.state}`)}</span>
                </li>
              ))}
            </ul>
            <Link to="/documentos" className={primaryButtonCls}>{t("intake.owner.s2_cta")}</Link>
          </div>
        );
      }
      case "expansion":
        return meetingBlock(entry?.expansion_meeting ?? null, "expansion");
      case "operating_agreement": {
        if (!oa) return <p className="text-sm text-muted-foreground">{t("intake.owner.oa.not_sent")}</p>;
        if (!ownerPending(oa)) return <p className="text-sm">{t("intake.owner.oa.signed")}</p>;
        const until = oaWaitingUntil(oa, rules.oa_waiting_days);
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("intake.owner.oa.body")}</p>
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
          <Step key={st.key} n={i + 1} state={st.state} title={t(`intake.owner.steps.${st.key}`)}>{bodyOf(st.key)}</Step>
        ))}
      </ol>
      {signing && <DocuSealSigner contract={signing} party="owner" signerName={me?.full_name ?? ""} onClose={() => setSigning(null)} />}
    </Wrap>
  );
}

function Step({ n, state, title, children }: { n: number; state: OwnerStepState; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const active = state === "current";
  return (
    <li className={cn("rounded-[4px] border bg-surface p-4", active ? "border-primary" : "border-border")}>
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
