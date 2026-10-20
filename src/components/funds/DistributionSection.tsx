import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { todayIso } from "@/lib/clock";
import { useClearDistributionLine, useDistribution, useMarkDistributionPaid, useMarkDistributionPending, useSaveDistributionLine } from "@/lib/api/hooks";
import type { Distribution, DistributionLine, DistributionPayment, PaymentPlanKind } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { parseWholeUsd, validateLinePlan } from "@/lib/leads/funds";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { Amount, Badge, PaymentDialog, ReceiptLink, inputCls } from "./parts";

/** "Agencia XYZ (marketing)" or "Strategic Mates (orquestación)". */
function useLineName() {
  const { t } = useTranslation();
  return (l: Pick<DistributionLine, "firm_name" | "areas">) =>
    l.firm_name === null ? t("funds.dist.sm_line") : l.areas[0] ? t("owner.firm_label", { name: l.firm_name, what: t(`firmWhat.${l.areas[0]}`) }) : l.firm_name;
}

/**
 * "Distribución a las firmas": one line per partner firm of the business plus Strategic Mates (orchestration).
 * The lines never add up to more than the funds received; the rest shows as unassigned.
 * SM office: assigns the plan of each line and marks each payment paid (undo from the toast). SM Global and the
 * Bishop of the business: read only.
 */
export function DistributionSection({ businessId, readOnly }: { businessId: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const q = useDistribution(businessId);
  if (q.isLoading) return <div className="space-y-2"><Skeleton className="h-10 rounded-md" /><Skeleton className="h-10 rounded-md" /><Skeleton className="h-10 rounded-md" /><Skeleton className="h-10 rounded-md" /></div>;
  if (q.isError)
    return (
      <p role="alert" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
        {t("funds.error")} <button onClick={() => void q.refetch()} className="text-link hover:underline">{t("funds.retry")}</button>
      </p>
    );
  if (!q.data) return <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t("funds.dist.none")}</p>;
  return <DistributionBody dist={q.data} readOnly={readOnly} />;
}

function DistributionBody({ dist, readOnly }: { dist: Distribution; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const name = useLineName();
  const markPaid = useMarkDistributionPaid();
  const markPending = useMarkDistributionPending();
  const [editing, setEditing] = useState<DistributionLine | null>(null);
  const [paying, setPaying] = useState<{ line: DistributionLine; payment: DistributionPayment } | null>(null);
  const fail = () => toast.error(t("funds.t_error"));
  const nothingAssigned = dist.assigned === 0;

  const paymentLabel = (line: DistributionLine, p: DistributionPayment, i: number) =>
    line.kind === "milestones" ? p.milestone ?? "" : line.kind === "installments" ? t("funds.dist.installment", { n: i + 1, total: line.payments.length }) : t("funds.dist.one_time_payment");

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface sm:grid-cols-4">
        {([
          ["received", dist.received],
          ["assigned", dist.assigned],
          ["unassigned", dist.unassigned],
          ["paid", dist.paid],
        ] as const).map(([k, v]) => (
          <div key={k} className="border-b border-border p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <dt className="text-xs text-muted-foreground">{t(`funds.dist.${k}`)}</dt>
            <dd className={cn("mt-0.5 text-base font-semibold", k === "unassigned" && v > 0 && "text-status-warning-fg")}><Amount value={v} /></dd>
          </div>
        ))}
      </dl>
      {dist.overdue_count > 0 && <p className="text-xs text-status-danger-fg">{t("funds.dist.overdue_count", { count: dist.overdue_count })}</p>}
      {nothingAssigned && <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t(readOnly ? "funds.dist.empty_read" : "funds.dist.empty")}</p>}

      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {dist.lines.map((line) => (
          <li key={line.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="min-w-0 flex-1 font-medium">{name(line)}</span>
              {line.kind ? (
                <>
                  <span className="text-xs text-muted-foreground">{t(`funds.dist.kind.${line.kind}`)}</span>
                  <Amount value={line.amount} className="font-semibold" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("funds.dist.not_assigned")}</span>
              )}
              {!readOnly && (
                <button onClick={() => setEditing(line)} disabled={line.paid > 0} title={line.paid > 0 ? t("funds.dist.locked") : undefined}
                  className="text-xs text-link hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline">
                  {t(line.kind ? "funds.dist.edit" : "funds.dist.assign")}
                </button>
              )}
            </div>
            {line.payments.length > 0 && (
              <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
                {line.payments.map((p, i) => (
                  <li key={p.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Amount value={p.amount} className="text-sm" />
                      <span className="text-muted-foreground">
                        {paymentLabel(line, p, i)}
                        {p.due_on && ` · ${t("funds.dist.due", { date: formatDate(p.due_on, lng) })}`}
                      </span>
                      <span className="ml-auto">
                        {p.status === "paid" ? <Badge tone="success">{t("funds.dist.paid_tag")}</Badge> : p.overdue ? <Badge tone="danger">{t("funds.dist.overdue_tag")}</Badge> : <Badge tone="neutral">{t("funds.dist.pending_tag")}</Badge>}
                      </span>
                    </div>
                    {p.status === "paid" && (
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-muted-foreground">
                        <span>{t("funds.dist.paid_on", { date: formatDate(p.paid_on ?? todayIso(), lng), method: t(`funds.method.${p.method ?? "other"}`) })}</span>
                        {p.reference && <span>{t("funds.reference", { ref: p.reference })}</span>}
                        {p.receipt && <ReceiptLink receipt={p.receipt} />}
                      </p>
                    )}
                    {!readOnly && p.status === "pending" && (
                      <button onClick={() => setPaying({ line, payment: p })} className="mt-0.5 font-medium text-link hover:underline">{t("funds.dist.mark_paid")}</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {editing && <LineDialog dist={dist} line={editing} onClose={() => setEditing(null)} />}
      {paying && (
        <PaymentDialog
          title={t("funds.dist.mark_paid_title", { name: name(paying.line) })}
          body={t("funds.dist.mark_paid_body")}
          confirm={t("funds.dist.mark_paid_confirm")}
          withAmount={false}
          defaultAmount={paying.payment.amount}
          pending={markPaid.isPending}
          validate={(v) => (!v.paid_on || v.paid_on > todayIso() ? "date" : null)}
          onClose={() => setPaying(null)}
          onSubmit={(v) => {
            const paymentId = paying.payment.id;
            markPaid.mutate({ businessId: dist.business_id, paymentId, input: { paid_on: v.paid_on, method: v.method, reference: v.reference, receipt: v.receipt } }, {
              onSuccess: () => {
                setPaying(null);
                toast.success(t("funds.dist.t_paid"), {
                  action: { label: t("funds.undo"), onClick: () => markPending.mutate({ businessId: dist.business_id, paymentId }, { onError: fail }) },
                });
              },
              onError: fail,
            });
          }}
        />
      )}
    </div>
  );
}

interface Row { amount: string; due_on: string; milestone: string }
const emptyRow = (): Row => ({ amount: "", due_on: "", milestone: "" });

/** Plan of one line: one-time, installments with dates, or milestones with a short text. */
function LineDialog({ dist, line, onClose }: { dist: Distribution; line: DistributionLine; onClose: () => void }) {
  const { t } = useTranslation();
  const name = useLineName();
  const save = useSaveDistributionLine();
  const clear = useClearDistributionLine();
  const [kind, setKind] = useState<PaymentPlanKind>(line.kind ?? "one_time");
  const [rows, setRows] = useState<Row[]>(
    line.payments.length ? line.payments.map((p) => ({ amount: String(p.amount), due_on: p.due_on ?? "", milestone: p.milestone ?? "" })) : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);
  // What this line can take: received minus what the other lines already have.
  const available = dist.received - (dist.assigned - line.amount);
  const visibleRows = kind === "one_time" ? rows.slice(0, 1) : rows;
  const total = visibleRows.reduce((s, r) => s + (parseWholeUsd(r.amount) || 0), 0);
  const fail = () => toast.error(t("funds.t_error"));
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () => {
    const payments = visibleRows.map((r) => ({ amount: parseWholeUsd(r.amount), due_on: r.due_on || null, milestone: kind === "milestones" ? r.milestone.trim() || null : null }));
    const err = validateLinePlan({ kind, payments }, available);
    setError(err);
    if (err) return;
    save.mutate({ businessId: dist.business_id, input: { organization_id: line.organization_id, kind, payments } }, {
      onSuccess: () => { toast.success(t("funds.dist.t_saved", { name: name(line) })); onClose(); },
      onError: fail,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("funds.dist.line_title", { name: name(line) })}</DialogTitle>
          <DialogDescription>
            {t("funds.dist.line_body")} <Amount value={available} className="font-semibold text-foreground" />
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t("funds.dist.kind_label")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["one_time", "installments", "milestones"] as const).map((k) => (
              <label key={k} className={cn("inline-flex cursor-pointer items-center gap-2 rounded-[4px] border px-3 py-1.5 text-sm", kind === k ? "border-ring bg-accent/60" : "border-border")}>
                <input type="radio" name="plan-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-primary" />
                {t(`funds.dist.kind.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          {visibleRows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <label className="block w-32 shrink-0 space-y-1">
                <span className="text-xs text-muted-foreground">{t("funds.form.amount")}</span>
                <input inputMode="numeric" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} className={cn(inputCls, "font-display tabular-nums")} />
              </label>
              {kind === "milestones" ? (
                <label className="block min-w-0 flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">{t("funds.dist.milestone")}</span>
                  <input value={r.milestone} onChange={(e) => set(i, { milestone: e.target.value })} placeholder={t("funds.dist.milestone_placeholder")} className={inputCls} />
                </label>
              ) : (
                <label className="block min-w-0 flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">{t("funds.dist.due_label")}</span>
                  <input type="date" value={r.due_on} onChange={(e) => set(i, { due_on: e.target.value })} className={inputCls} />
                </label>
              )}
              {kind !== "one_time" && visibleRows.length > 1 && (
                <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={t("funds.dist.remove_row")} className="mb-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {kind !== "one_time" && (
            <button onClick={() => setRows((rs) => [...rs, emptyRow()])} className="inline-flex items-center gap-1 text-sm text-link hover:underline">
              <Plus className="h-3.5 w-3.5" />{t(kind === "milestones" ? "funds.dist.add_milestone" : "funds.dist.add_installment")}
            </button>
          )}
          <p className="text-xs text-muted-foreground">{t("funds.dist.line_total")} <Amount value={total} className="font-semibold text-foreground" /></p>
          {error && <p className="text-xs text-status-danger-fg">{t(`funds.dist.errors.${error}`)}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {line.kind && line.paid === 0 ? (
            <button
              onClick={() => clear.mutate({ businessId: dist.business_id, organizationId: line.organization_id }, { onSuccess: () => { toast.success(t("funds.dist.t_cleared", { name: name(line) })); onClose(); }, onError: fail })}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("funds.dist.clear")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <SecondaryButton onClick={onClose}>{t("funds.cancel")}</SecondaryButton>
            <PrimaryButton onClick={submit} disabled={save.isPending}>{t("funds.dist.save")}</PrimaryButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
