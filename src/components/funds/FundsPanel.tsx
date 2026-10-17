import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBusinessFunds, useConfirmFundPayment, useRecordFundPayment, useRemoveFundPayment, useReportFundPayment } from "@/lib/api/hooks";
import type { BishopFunds, FundPayment } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { validateFundPayment } from "@/lib/leads/funds";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount, Badge, FundsStatusBadge, PaymentDialog, ReceiptLink } from "./parts";

/**
 * "Fondos del inversor": what the Bishop paid SM for the program, with every payment and its receipt.
 * sm: the office team confirms receipts the Bishop uploaded and can remove a payment recorded by mistake.
 * bishop: read only, plus "Subir comprobante". read: SM Global (no actions).
 * The primary "Registrar fondos recibidos" lives in the lead detail header, not here (one primary action).
 */
export function FundsPanel({ businessId, mode }: { businessId: string; mode: "sm" | "bishop" | "read" }) {
  const { t } = useTranslation();
  const q = useBusinessFunds(businessId);
  if (q.isLoading) return <Skeleton className="h-32 rounded-md" />;
  if (q.isError)
    return (
      <p className="text-sm text-muted-foreground">
        {t("funds.error")} <button onClick={() => void q.refetch()} className="text-link hover:underline">{t("funds.retry")}</button>
      </p>
    );
  if (!q.data) return <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t("funds.none")}</p>;
  return <FundsBody funds={q.data} mode={mode} />;
}

export function FundsBody({ funds, mode }: { funds: BishopFunds; mode: "sm" | "bishop" | "read" }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const confirm = useConfirmFundPayment();
  const remove = useRemoveFundPayment();
  const record = useRecordFundPayment();
  const report = useReportFundPayment();
  const [reporting, setReporting] = useState(false);
  const remaining = Math.max(0, funds.total - funds.received);
  const reportable = Math.max(0, remaining - funds.to_confirm);
  const pct = funds.total ? Math.min(100, Math.round((funds.received / funds.total) * 100)) : 0;
  const fail = () => toast.error(t("funds.t_error"));

  const removePayment = (p: FundPayment) =>
    remove.mutate({ businessId: funds.business_id, paymentId: p.id }, {
      onSuccess: () =>
        toast.success(t("funds.t_removed"), {
          action: {
            label: t("funds.undo"),
            onClick: () => record.mutate({ businessId: funds.business_id, input: { amount: p.amount, paid_on: p.paid_on, method: p.method, reference: p.reference, receipt: p.receipt } }, { onError: fail }),
          },
        }),
      onError: fail,
    });

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <Amount value={funds.received} className="text-xl font-semibold" />{" "}
            <span className="text-muted-foreground">{t("funds.of_total")} </span>
            <Amount value={funds.total} className="font-semibold" />
          </p>
          <FundsStatusBadge status={funds.status} />
        </div>
        <div role="progressbar" aria-label={t("funds.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 h-1.5 overflow-hidden rounded-[2px] border border-border bg-muted">
          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {funds.completed_on
            ? t("funds.completed_on", { date: formatDate(funds.completed_on, lng) })
            : <>{t("funds.missing_label")} <Amount value={remaining} /></>}
          {funds.to_confirm > 0 && <> · {t("funds.to_confirm_label")} <Amount value={funds.to_confirm} /></>}
        </p>
        {mode !== "bishop" && <p className="mt-1 text-xs text-muted-foreground">{t("funds.bishop_line", { name: funds.bishop_name })}</p>}
        {mode === "bishop" && !funds.program_started && reportable > 0 && (
          <div className="mt-3">
            <button onClick={() => setReporting(true)} className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
              {t("funds.report")}
            </button>
            <p className="mt-1 text-xs text-muted-foreground">{t("funds.report_hint")}</p>
          </div>
        )}
      </div>

      {funds.payments.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{t(mode === "bishop" ? "funds.empty_bishop" : "funds.empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {funds.payments.map((p) => (
            <li key={p.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Amount value={p.amount} className="font-semibold" />
                <span className="text-muted-foreground">· {formatDate(p.paid_on, lng)} · {t(`funds.method.${p.method}`)}</span>
                <span className="ml-auto">
                  {p.status === "confirmed" ? <Badge tone="success">{t("funds.payment_confirmed")}</Badge> : <Badge tone="warning">{t("funds.payment_reported")}</Badge>}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {p.reference && <span>{t("funds.reference", { ref: p.reference })}</span>}
                {p.receipt ? <ReceiptLink receipt={p.receipt} /> : <span>{t("funds.no_receipt")}</span>}
                <span>{t(p.reported_by === "bishop" ? "funds.by_bishop" : "funds.by_sm")}</span>
              </p>
              {mode === "sm" && !funds.program_started && (
                <div className="mt-1.5 flex gap-3">
                  {p.status === "reported" && (
                    <button
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate({ businessId: funds.business_id, paymentId: p.id }, { onSuccess: () => toast.success(t("funds.t_confirmed")), onError: fail })}
                      className="text-xs font-medium text-link hover:underline"
                    >
                      {t("funds.confirm")}
                    </button>
                  )}
                  <button disabled={remove.isPending} onClick={() => removePayment(p)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">{t("funds.remove")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {mode === "bishop" && <p className="text-xs text-muted-foreground">{t("funds.no_gateway")}</p>}

      {reporting && (
        <PaymentDialog
          title={t("funds.report_title", { name: funds.business_name })}
          body={t("funds.report_body")}
          confirm={t("funds.report_confirm")}
          withAmount
          defaultAmount={reportable}
          receiptRequired
          pending={report.isPending}
          validate={(v) => validateFundPayment(v, reportable, { receiptRequired: true })}
          onClose={() => setReporting(false)}
          onSubmit={(input) =>
            report.mutate({ businessId: funds.business_id, input }, {
              onSuccess: () => { setReporting(false); toast.success(t("funds.t_reported")); },
              onError: fail,
            })
          }
        />
      )}
    </div>
  );
}
