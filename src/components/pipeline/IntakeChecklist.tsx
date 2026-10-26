import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ChevronDown, Circle, FileText } from "lucide-react";
import { useAcceptDocument, useContractRules, useCurrentUser, useLeadIntake, useRequestDocument, useResendContract, useRules } from "@/lib/api/hooks";
import { MOU_ACKNOWLEDGMENT_POINTS, type BusinessDocument, type Contract, type EntryContractRule, type LeadValidation, type ReviewClock, type Signer } from "@/lib/api/types";
import { checklistByRule, contractDeadline, factsFromContracts, ruleSchedule, smEntitiesOf, smSignBlock, smSignerEntityName } from "@/lib/leads/contract-rules";
import { whenText } from "@/components/global/rules/contract-rules-text";
import { formatDate, formatWeekdayDate } from "@/lib/format";
import { canResend } from "@/lib/leads/onboarding";
import { entryRules, intakeDocumentHelp, ndaStatus, oaWaitingUntil, type NdaStatus } from "@/lib/leads/entry-flow";
import { DocumentHelp } from "./DocumentHelp";
import { ReviewNoteAlert } from "./ReviewNoteAlert";
import { StateMark } from "./LeadBadges";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { DocuSealSigner } from "@/components/docuseal/DocuSealSigner";
import { SignedContractDialog } from "@/components/docuseal/SignedContractDialog";
import { SealedCopyLinks } from "@/components/docuseal/SealedCopies";

const TONE: Record<ReviewClock["tone"], string> = {
  ok: "border-border bg-muted text-foreground",
  amber: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  red: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
};
const NDA_TONE: Record<Exclude<NdaStatus, "none">, string> = {
  signed: "border-status-success-border bg-status-success-bg text-status-success-fg",
  pending: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
};
const DOC_TONE: Record<BusinessDocument["state"], string> = {
  requested: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  received: "border-status-info-border bg-status-info-bg text-status-info-fg",
  reviewed: "border-status-success-border bg-status-success-bg text-status-success-fg",
  rejected: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  not_applicable: "border-status-info-border bg-status-info-bg text-status-info-fg",
};
/** The same states as a plain word with a square mark (the compact documents table). */
const DOC_MARK: Record<BusinessDocument["state"], "neutral" | "info" | "success" | "warning"> = {
  requested: "neutral",
  received: "info",
  reviewed: "success",
  rejected: "warning",
  not_applicable: "info",
};

export function ClockLabel({ clock }: { clock: ReviewClock }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex rounded-[4px] border px-2 py-0.5 text-xs font-medium", TONE[clock.tone])}>
      {t(`intake.clock.${clock.status}`, { day: clock.day, total: clock.total })}
    </span>
  );
}

/**
 * Entry checklist of a lead: the contracts (NDA, MOU, the rule ones) and the documents, together. The lead detail
 * shows them as separate pieces (IntakeContracts, IntakeDocuments); this composition stays for the screens that
 * want the whole checklist in one block.
 */
export function IntakeChecklist({ leadId, readOnly, validation }: { leadId: string; readOnly: boolean; validation?: LeadValidation | null | undefined }) {
  return (
    <section className="space-y-3">
      <IntakeContracts leadId={leadId} readOnly={readOnly} validation={validation} />
      <IntakeDocuments leadId={leadId} readOnly={readOnly} />
    </section>
  );
}

/**
 * The entry contracts in the rules' order: each one with its state, or "todavía no se creó" with when it will be
 * (and its deadline when known). `validation` tells when a contract that waits for it can be created. Review is
 * Strategic Mates team work: any SM person of the office acts. SM Global reads it (`readOnly`).
 */
export function IntakeContracts({ leadId, readOnly, validation, withHeader = true }: { leadId: string; readOnly: boolean; validation?: LeadValidation | null | undefined; withHeader?: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const q = useLeadIntake(leadId);
  const resend = useResendContract();
  const [signing, setSigning] = useState<Contract | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const rulesData = useRules().data;
  const rules = entryRules(rulesData);
  const me = useCurrentUser().data;
  const contractRulesQ = useContractRules(me?.role === "sm_team" || me?.role === "sm_global");
  const entities = smEntitiesOf(rulesData);

  if (q.isLoading) return <Skeleton className="h-40 rounded-md" />;
  if (q.isError) return <button onClick={() => void q.refetch()} className="text-sm text-link hover:underline">{t("pipeline.retry")}</button>;
  if (!q.data) return null;
  const { summary, contracts } = q.data;

  const contractRules = contractRulesQ.data ?? [];
  const { rows, others } = checklistByRule(contractRules, contracts);
  const facts = factsFromContracts(contractRules, contracts, validation?.status === "closed" ? validation.closed_at : null);

  /** "Firma Camila Soto por SM Square" / "Firma cualquier persona de la oficina por Corporate". */
  const smLine = (s: Signer) => {
    const entity = s.sm_entity || s.sm_entity_name?.trim() ? smSignerEntityName(s, entities) : null;
    if (!entity) return t("intake.party.sm");
    return s.user_id ? t("entry_contracts.checklist.sm_line", { person: s.name, entity }) : t("entry_contracts.checklist.sm_line_any", { entity });
  };
  /** Why the current SM person cannot sign this SM part, or null. */
  const signReason = (s: Signer) => {
    const block = smSignBlock(s, me);
    if (!block) return null;
    const entity = s.sm_entity ? entities[s.sm_entity].name : "Strategic Mates";
    if (block === "sm_square_signer_required" && !me?.can_sign_sm_square) return t("entry_contracts.checklist.cannot_sm_square", { entity });
    return t("entry_contracts.checklist.cannot_person", { name: s.name, entity });
  };

  /** A rule whose contract does not exist yet: when it will be created, and its deadline once that is known. */
  const pendingRow = (rule: EntryContractRule) => {
    const s = ruleSchedule(rule, facts);
    return (
      <li key={`rule-${rule.code}`} className="py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Circle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{rule.name}</span>
          <span className="rounded-[4px] border border-status-neutral-border bg-status-neutral-bg px-1.5 py-0.5 text-[11px] font-medium text-status-neutral-fg">{t("entry_contracts.checklist.not_created")}</span>
        </div>
        <ul className="mt-1 space-y-0.5 pl-6 text-xs text-muted-foreground">
          <li>{whenText(t, rule, contractRules)}</li>
          {s.waiting_validation && <li>{t("entry_contracts.checklist.waiting_validation")}</li>}
          {s.sign_by && <li>{t("entry_contracts.checklist.sign_by", { date: formatWeekdayDate(s.sign_by, lng) })}</li>}
        </ul>
      </li>
    );
  };

  const contractRow = (c: Contract) => {
    const done = c.signers.every((s) => s.status === "signed");
    const sm = c.signers.find((s) => s.party === "sm");
    const nda = c.kind === "nda" ? ndaStatus(c) : null;
    const waitingUntil = oaWaitingUntil(c, rules.oa_waiting_days);
    const acks = c.kind === "mou" ? c.signers.find((s) => s.party === "owner")?.acknowledgments?.length ?? 0 : null;
    const deadline = contractDeadline(c);
    const smPending = !!sm && sm.status !== "signed" && sm.status !== "declined" && !waitingUntil;
    // Corporate's CEO signs the binding agreement even from SM Global's read-only view: the API says so with can_sign.
    const mySmPart = c.can_sign === true || (!!sm?.user_id && sm.user_id === me?.id);
    const reason = c.can_sign ? null : sm && smPending ? signReason(sm) : null;
    return (
      <li key={c.id} className="py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {done ? <Check className="h-4 w-4 text-status-success-fg" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{c.name}</span>
          {nda && nda !== "none" && (
            <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium", NDA_TONE[nda])}>{t(`intake.nda_status.${nda}`)}</span>
          )}
          <span className="ml-auto flex gap-2">
            {c.signers.some((s) => s.signed_at) && (
              <button onClick={() => setViewing(c)} className="text-xs text-link hover:underline">{t("intake.docuseal.view_signed")}</button>
            )}
            {smPending && (!readOnly || mySmPart) && (
              <button onClick={() => setSigning(c)} disabled={!!reason} title={reason ?? undefined} className="text-xs text-link hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                {sm?.sm_entity ? t("entry_contracts.checklist.sign_for", { entity: entities[sm.sm_entity].name }) : t("intake.sign_as_sm")}
              </button>
            )}
            {!readOnly && (c.can_resend ?? canResend(c)) && (
              <button
                onClick={() => resend.mutate({ id: leadId, contractId: c.id }, { onSuccess: () => toast.success(t("intake.t_resent", { name: c.name })), onError: () => toast.error(t("pipeline.t_error")) })}
                className="text-xs text-link hover:underline"
              >
                {t("intake.resend")}
              </button>
            )}
          </span>
        </div>
        <ul className="mt-1 space-y-0.5 pl-6 text-xs text-muted-foreground">
          {c.signers.map((s) => {
            const last = s.history?.at(-1);
            return (
              <li key={s.party ?? s.name}>
                {/* The SM part is signed by a person on behalf of the company: "Firmado por Marilyn Boraei en nombre de Strategic Mates Corporate". */}
                {s.party === "sm" ? smLine(s) : t(`intake.party.${s.party ?? "owner"}`)}, <span className={cn(s.status === "signed" && "text-status-success-fg", s.status === "declined" && "text-status-danger-fg")}>
                  {s.party === "sm" && s.status === "signed"
                    ? (s.user_id ? t("intake.signed_on_behalf_by", { name: s.name, entity: smSignerEntityName(s, entities) }) : t("intake.nda_signed_on_behalf"))
                    : t(`intake.signer_status.${s.status ?? "sent"}`, { defaultValue: "" })}
                </span>
                {last && ` · ${formatDate(last.at, lng)}`}
                {s.decline_reason && ` · ${t("intake.declined_reason", { reason: s.decline_reason })}`}
              </li>
            );
          })}
          {acks !== null && <li>{t("intake.mou_points", { n: acks, m: c.acknowledgment_points?.es.length || MOU_ACKNOWLEDGMENT_POINTS.length })}</li>}
          {waitingUntil && <li className="text-status-warning-fg">{t("entry.oa.waiting_sm", { date: formatDate(waitingUntil, lng) })}</li>}
          {deadline.state === "open" && <li>{t("entry_contracts.checklist.sign_by", { date: formatWeekdayDate(deadline.sign_by, lng) })}</li>}
          {deadline.state === "overdue" && <li className="text-status-danger-fg">{t("entry_contracts.checklist.overdue", { date: formatDate(deadline.sign_by, lng) })}</li>}
          {reason && !readOnly && <li>{reason}</li>}
        </ul>
        <SealedCopyLinks contract={c} className="mt-2 pl-6" />
      </li>
    );
  };

  return (
    <section className="space-y-3">
      {withHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("intake.title")}</h3>
          <ClockLabel clock={summary.clock} />
        </div>
      )}
      <div className="rounded-md border border-border px-4">
        <ul className="divide-y divide-border">
          {contractRules.length > 0 ? (
            <>
              {rows.map((r) => (r.contract ? contractRow(r.contract) : pendingRow(r.rule)))}
              {others.map(contractRow)}
            </>
          ) : contracts.map(contractRow)}
        </ul>
      </div>
      {!readOnly && <p className="text-xs text-muted-foreground">{t("intake.team_note")}</p>}

      {signing && <DocuSealSigner contract={signing} party="sm" signerName={signing.signers.find((s) => s.party === "sm")?.name || "Strategic Mates"} onClose={() => setSigning(null)} />}
      {viewing && <SignedContractDialog contract={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

/**
 * The entry documents. `full` is the checklist with the help under each one; `table` is the compact table of the
 * lead detail's Documentos tab (one row per document, the long help collapsed in an expandable row, the owner's
 * instructions collapsed once on top).
 */
export function IntakeDocuments({ leadId, readOnly, variant = "full" }: { leadId: string; readOnly: boolean; variant?: "full" | "table" }) {
  const { t } = useTranslation();
  const q = useLeadIntake(leadId);
  const rulesData = useRules().data;
  const [accepting, setAccepting] = useState<BusinessDocument | null>(null);
  const [requesting, setRequesting] = useState<BusinessDocument | null>(null);
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const helpText = rulesData?.intake_help_text?.trim() ?? "";

  if (q.isLoading) return <Skeleton className="h-40 rounded-md" />;
  if (q.isError) return <button onClick={() => void q.refetch()} className="text-sm text-link hover:underline">{t("pipeline.retry")}</button>;
  if (!q.data) return null;
  const { summary, documents } = q.data;

  const actions = (d: BusinessDocument) =>
    !readOnly && (d.state === "received" || d.state === "reviewed" || d.state === "not_applicable") ? (
      <div className="flex gap-3">
        {(d.state === "received" || d.state === "not_applicable") && <button onClick={() => setAccepting(d)} className="text-xs font-medium text-link hover:underline">{t("intake.accept")}</button>}
        <button onClick={() => setRequesting(d)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{t(d.state === "not_applicable" ? "intake.request_anyway" : "intake.request_again")}</button>
      </div>
    ) : null;

  const dialogs = (
    <>
      {accepting && <AcceptDialog leadId={leadId} doc={accepting} onClose={() => setAccepting(null)} />}
      {requesting && <RequestDialog leadId={leadId} doc={requesting} onClose={() => setRequesting(null)} />}
    </>
  );

  if (variant === "table")
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("intake.docs_title")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">{t("pipeline.detail.docs_counter", { uploaded: summary.uploaded, total: summary.required_total, accepted: summary.accepted })}</span>
        </div>
        {/* The same note the owner reads at the top of his list, collapsed once for the whole table. */}
        {helpText && documents.length > 0 && (
          <div className="rounded-md border border-border">
            <button type="button" aria-expanded={instructionsOpen} onClick={() => setInstructionsOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium">
              {t("intake.table.owner_instructions")}
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", instructionsOpen && "rotate-180")} />
            </button>
            {instructionsOpen && <p className="whitespace-pre-line border-t border-border px-3 py-2 text-xs text-muted-foreground">{helpText}</p>}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">{t("intake.table.document")}</th>
                <th className="px-3 py-2">{t("intake.table.state")}</th>
                <th className="px-3 py-2">{t("intake.table.file")}</th>
                <th className="px-3 py-2">{t("intake.table.fact")}</th>
                <th className="px-3 py-2">{t("intake.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d, i) => {
                const help = intakeDocumentHelp(d, rulesData);
                const open = helpOpen === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className="border-t border-border align-top first:border-t-0">
                      <td className="px-3 py-2">
                        <span className="font-medium tabular-nums">{i + 1}. </span>
                        <span className="font-medium">{d.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {d.required ? t("intake.required") : t("intake.optional")}
                          {d.only_if_llc ? ` · ${t("intake.only_llc")}` : ""}
                          {d.locked_until_mou ? ` · ${t("intake.locked_until_mou")}` : ""}
                        </span>
                        {help && (
                          <button type="button" aria-expanded={open} onClick={() => setHelpOpen(open ? null : d.id)} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-link hover:underline">
                            {t("intake.table.help")}
                            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2"><StateMark tone={DOC_MARK[d.state]}>{t(`intake.state.${d.state}`)}</StateMark></td>
                      <td className="px-3 py-2">
                        {d.file_name ? (
                          <a href="#" onClick={(e) => e.preventDefault()} className="inline-flex min-w-0 items-center gap-1 text-link hover:underline"><FileText className="h-3 w-3 shrink-0" /><span className="max-w-32 truncate">{d.file_name}</span></a>
                        ) : d.state !== "not_applicable" ? <span className="text-muted-foreground">{t("intake.table.no_file")}</span> : null}
                      </td>
                      <td className="max-w-40 px-3 py-2 text-muted-foreground">
                        {d.state === "reviewed" && d.verified_fact ? <span className="text-status-success-fg">{d.verified_fact}</span>
                          : d.state === "rejected" && d.review_comment ? <span className="text-status-warning-fg">{d.review_comment}</span>
                          : d.state === "not_applicable" ? d.not_applicable_reason ?? ""
                          : ""}
                      </td>
                      <td className="px-3 py-2">{actions(d)}</td>
                    </tr>
                    {open && help && (
                      <tr className="border-t border-border bg-muted/40">
                        <td colSpan={5} className="px-3 py-2"><DocumentHelp help={help} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {dialogs}
      </section>
    );

  return (
    <section className="space-y-3">
      <div id="intake-docs" className="rounded-md border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">{t("intake.docs_title")}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{t("pipeline.detail.docs_counter", { uploaded: summary.uploaded, total: summary.required_total, accepted: summary.accepted })}</span>
        </div>
        {/* The same note the owner reads at the top of his list. */}
        {helpText && documents.length > 0 && <p className="mx-4 mt-2.5 whitespace-pre-line rounded-[4px] border border-border px-3 py-2 text-xs">{helpText}</p>}
        <ul className="divide-y divide-border">
          {documents.map((d) => {
            const help = intakeDocumentHelp(d, rulesData);
            return (
            <li key={d.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{d.name}</span>
                <span className={cn("rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium", DOC_TONE[d.state])}>{t(`intake.state.${d.state}`)}</span>
              </div>
              {/* Each item carries its own separator, so a line never ends in a dangling "·" ("Obligatorio · "). */}
              <p className="mt-0.5 flex flex-wrap gap-x-1 text-xs text-muted-foreground">
                <span>{d.required ? t("intake.required") : t("intake.optional")}</span>
                {d.only_if_llc && <span>· {t("intake.only_llc")}</span>}
                {d.locked_until_mou && <span>· {t("intake.locked_until_mou")}</span>}
                {d.file_name ? (
                  <span className="inline-flex min-w-0 items-center gap-1">· <a href="#" onClick={(e) => e.preventDefault()} className="inline-flex min-w-0 items-center gap-1 text-link hover:underline"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{t("intake.open_file")} {d.file_name}</span></a></span>
                ) : d.state !== "not_applicable" ? <span>· {t("intake.not_uploaded")}</span> : null}
              </p>
              {d.state === "reviewed" && d.verified_fact && <p className="mt-0.5 text-xs text-status-success-fg">{t("intake.verified", { fact: d.verified_fact })}</p>}
              {d.state === "rejected" && d.review_comment && <ReviewNoteAlert comment={d.review_comment} className="mt-1.5" />}
              {/* "No aplica": the owner's reason, in a bordered note; SM accepts it or asks for it anyway. */}
              {d.state === "not_applicable" && (
                <p className="mt-1.5 rounded-[4px] border border-status-info-border bg-status-info-bg px-3 py-2 text-xs text-status-info-fg">{t("intake.not_applicable_reason", { reason: d.not_applicable_reason ?? "" })}</p>
              )}
              {help && <DocumentHelp help={help} className="mt-1.5" />}
              {actions(d) && <div className="mt-1.5">{actions(d)}</div>}
            </li>
            );
          })}
        </ul>
      </div>
      {dialogs}
    </section>
  );
}

/**
 * The Resumen tab's contracts table: one row per entry contract with its state as a plain word and a square mark,
 * the signature count and the sealed copies. Pure: the caller passes the contracts it already loaded.
 */
export function ContractsSummaryTable({ contracts }: { contracts: Contract[] }) {
  const { t } = useTranslation();
  if (contracts.length === 0) return null;
  const stateOf = (c: Contract): { key: "draft" | "in_progress" | "signed" | "declined"; tone: "neutral" | "info" | "success" | "danger" } => {
    if (c.signers.length > 0 && c.signers.every((s) => s.status === "signed")) return { key: "signed", tone: "success" };
    if (c.signers.some((s) => s.status === "declined")) return { key: "declined", tone: "danger" };
    if (c.state === "draft") return { key: "draft", tone: "neutral" };
    return { key: "in_progress", tone: "info" };
  };
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">{t("pipeline.detail.contracts_table.documento")}</th>
            <th className="px-3 py-2">{t("pipeline.detail.contracts_table.estado")}</th>
            <th className="px-3 py-2">{t("pipeline.detail.contracts_table.firmas")}</th>
            <th className="px-3 py-2">{t("pipeline.detail.contracts_table.descargas")}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => {
            const s = stateOf(c);
            const signed = c.signers.filter((x) => x.status === "signed").length;
            return (
              <tr key={c.id} className="border-t border-border align-top first:border-t-0">
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2"><StateMark tone={s.tone}>{t(`pipeline.detail.contract_state.${s.key}`)}</StateMark></td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{t("pipeline.detail.signatures_of", { n: signed, m: c.signers.length })}</td>
                <td className="px-3 py-2"><SealedCopyLinks contract={c} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TextDialog(props: { title: string; body: string; label: string; confirm: string; required: string; placeholder?: string | undefined; initialValue?: string | undefined; serverError?: string | undefined; pending: boolean; onClose: () => void; onConfirm: (v: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(props.initialValue ?? "");
  const [tried, setTried] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.body}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{props.label}</span>
          <textarea autoFocus rows={3} value={value} placeholder={props.placeholder} required aria-required="true"
            aria-invalid={(tried && !value.trim()) || !!props.serverError} onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>
        {tried && !value.trim()
          ? <p role="alert" className="text-xs text-status-danger-fg">{props.required}</p>
          : props.serverError && <p role="alert" className="text-xs text-status-danger-fg">{props.serverError}</p>}
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("intake.cancel")}</SecondaryButton>
          <PrimaryButton disabled={props.pending} onClick={() => { setTried(true); if (value.trim()) props.onConfirm(value.trim()); }}>{props.confirm}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptDialog({ leadId, doc, onClose }: { leadId: string; doc: BusinessDocument; onClose: () => void }) {
  const { t } = useTranslation();
  const accept = useAcceptDocument();
  const [factRejected, setFactRejected] = useState(false);
  // Accepting a "No aplica": the fact the Bishop reads starts from the owner's reason.
  const notApplicable = doc.state === "not_applicable";
  return (
    <TextDialog
      title={t("intake.accept_title", { name: doc.name })} body={t(notApplicable ? "intake.accept_not_applicable_body" : "intake.accept_body")} label={t("intake.accept_label")}
      confirm={t("intake.accept_confirm")} required={t("intake.fact_required")} placeholder={doc.verified_hint ?? undefined}
      initialValue={notApplicable ? t("intake.not_applicable_fact", { reason: doc.not_applicable_reason ?? "" }) : undefined}
      serverError={factRejected ? t("intake.fact_required") : undefined} pending={accept.isPending} onClose={onClose}
      onConfirm={(fact) => {
        setFactRejected(false);
        accept.mutate({ id: leadId, documentId: doc.id, fact }, {
          onSuccess: () => { toast.success(t("intake.t_accepted")); onClose(); },
          // The API's fact_required code is shown inline, next to the field.
          onError: (error) => { if (error.message === "fact_required") setFactRejected(true); else toast.error(t("pipeline.t_error")); },
        });
      }}
    />
  );
}

function RequestDialog({ leadId, doc, onClose }: { leadId: string; doc: BusinessDocument; onClose: () => void }) {
  const { t } = useTranslation();
  const request = useRequestDocument();
  const anyway = doc.state === "not_applicable";
  return (
    <TextDialog
      title={t(anyway ? "intake.request_anyway_title" : "intake.request_title", { name: doc.name })} body={t(anyway ? "intake.request_anyway_body" : "intake.request_body")} label={t("intake.request_label")}
      confirm={t("intake.request_confirm")} required={t("intake.comment_required")} pending={request.isPending} onClose={onClose}
      onConfirm={(comment) => request.mutate({ id: leadId, documentId: doc.id, comment }, { onSuccess: () => { toast.success(t("intake.t_requested")); onClose(); }, onError: () => toast.error(t("pipeline.t_error")) })}
    />
  );
}

/** "No aprobar": asks the reason, then the caller discards the lead. */
export function RejectDocsDialog(props: { name: string; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  return (
    <TextDialog title={t("intake.reject_title", { name: props.name })} body={t("intake.reject_body")} label={t("intake.reject_label")}
      confirm={t("intake.reject_confirm")} required={t("pipeline.reason_required")} pending={props.pending} onClose={props.onClose} onConfirm={props.onConfirm} />
  );
}
