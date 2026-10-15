import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FEES } from "@/config/economics";
import { TODAY } from "@/config/app";
import { useFranchiseeHome, useFranchiseReports, useSubmitFranchiseReport } from "@/lib/api/hooks";
import type { ReportStatus } from "@/lib/api/types";
import { computeReportAmounts } from "@/lib/franchise/fees";
import { formatDate, formatUsd } from "@/lib/format";
import { formatMonth } from "@/components/bishop/portfolio/recovery";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, primaryButton, Screen, Tag, type Tone } from "@/components/bishop/ui";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSales, validateSales } from "./reportForm";

const STATUS_TONE: Record<ReportStatus, Tone> = { due: "warning", submitted: "info", paid: "success" };

/** Monthly reports of the unit and the form to send the next one, with the fees shown before sending. */
export function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const homeQ = useFranchiseeHome();
  const reportsQ = useFranchiseReports();
  const submit = useSubmitFranchiseReport();
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [sales, setSales] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (homeQ.isError || reportsQ.isError)
    return (
      <Screen ns="franchisee" screen="payments">
        <ErrorBlock title={t("franchisee.error")} retryLabel={t("franchisee.retry")} onRetry={() => { void homeQ.refetch(); void reportsQ.refetch(); }} />
      </Screen>
    );
  if (homeQ.isLoading || reportsQ.isLoading || !homeQ.data || !reportsQ.data)
    return (
      <Screen ns="franchisee" screen="payments">
        <LoadingBlocks rows={2} />
      </Screen>
    );

  const money = (n: number) => formatUsd(n, lng);
  const reports = reportsQ.data;
  // Oldest pending month first: reports are sent in order.
  const dueReports = reports.filter((r) => r.status === "due").sort((a, b) => a.month.localeCompare(b.month));
  const month = dueReports.find((r) => r.month === chosenMonth)?.month ?? dueReports[0]?.month;
  const dueReport = dueReports.find((r) => r.month === month);
  const error = validateSales(sales);
  const amount = error === null ? parseSales(sales) : null;
  const fees = amount === null ? null : computeReportAmounts(amount);
  const royaltyPct = Math.round(FEES.royalty_rate * 100);
  const marketingPct = Math.round(FEES.marketing_fund_rate * 100);

  const send = () => {
    if (!month || amount === null) return;
    submit.mutate(
      { franchiseId: homeQ.data.franchise.id, month, gross_sales: amount },
      {
        onSuccess: () => {
          toast.success(t("franchisee.payments.t_sent", { month: formatMonth(month, lng) }));
          setConfirming(false);
          setSales("");
          setTouched(false);
          setChosenMonth(null);
        },
        onError: () => {
          setConfirming(false);
          toast.error(t("franchisee.error_action"));
        },
      },
    );
  };

  return (
    <Screen ns="franchisee" screen="payments">
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Reports */}
        <Panel title={t("franchisee.payments.reports_title")} className="min-w-0 self-start">
          {reports.length === 0 ? (
            <div className="px-4 pb-4"><EmptyBlock title={t("franchisee.payments.empty_title")} body={t("franchisee.payments.empty_body")} /></div>
          ) : (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">{t("franchisee.payments.col_month")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("franchisee.payments.col_sales")}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("franchisee.payments.col_royalty", { pct: royaltyPct })}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("franchisee.payments.col_marketing", { pct: marketingPct })}</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">{t("franchisee.payments.col_total")}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t("franchisee.payments.col_status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="px-4 py-3 text-left font-medium">{formatMonth(r.month, lng)}</th>
                      <td className="px-4 py-3 text-right tabular-nums">{r.gross_sales === null ? "-" : money(r.gross_sales)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.royalty_amount === null ? "-" : money(r.royalty_amount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.marketing_fund_amount === null ? "-" : money(r.marketing_fund_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.total_due === null ? "-" : money(r.total_due)}</td>
                      <td className="px-4 py-3">
                        <Tag tone={r.status === "due" && r.due_date < TODAY ? "danger" : STATUS_TONE[r.status]}>{t(`franchisee.payments.status_${r.status}`)}</Tag>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.status === "paid" && r.paid_at
                            ? t("franchisee.payments.paid_on", { date: formatDate(r.paid_at, lng) })
                            : r.status === "submitted" && r.submitted_at
                              ? t("franchisee.payments.sent_on", { date: formatDate(r.submitted_at, lng) })
                              : t("franchisee.payments.due_on", { date: formatDate(r.due_date, lng) })}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Send the report of the month */}
        <Panel title={t("franchisee.payments.form_title")} className="self-start">
          {!dueReport ? (
            <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("franchisee.payments.nothing_due")}</p>
          ) : (
            <form
              noValidate
              className="space-y-4 px-4 pb-4"
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (error === null) setConfirming(true);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="report-month">{t("franchisee.payments.field_month")}</Label>
                {dueReports.length > 1 ? (
                  <Select value={month ?? ""} onValueChange={setChosenMonth}>
                    <SelectTrigger id="report-month" className="bg-surface"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dueReports.map((r) => <SelectItem key={r.id} value={r.month}>{formatMonth(r.month, lng)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <p id="report-month" className="text-sm font-medium">{formatMonth(dueReport.month, lng)}</p>
                )}
                <p className="text-xs text-muted-foreground">{t("franchisee.payments.due_on", { date: formatDate(dueReport.due_date, lng) })}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-sales">{t("franchisee.payments.field_sales")}</Label>
                <Input
                  id="report-sales"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="45,000"
                  value={sales}
                  aria-invalid={touched && error !== null}
                  aria-describedby={touched && error !== null ? "report-sales-error" : "report-sales-help"}
                  onChange={(e) => setSales(e.target.value)}
                  onBlur={() => setTouched(true)}
                />
                {touched && error !== null ? (
                  <p id="report-sales-error" className="text-xs text-status-danger-fg">{t(`franchisee.payments.error_${error}`)}</p>
                ) : (
                  <p id="report-sales-help" className="text-xs text-muted-foreground">{t("franchisee.payments.field_sales_help")}</p>
                )}
              </div>

              {/* What he will owe, shown before sending */}
              <dl className="divide-y divide-border rounded-md border border-border text-sm" aria-live="polite">
                <FeeRow label={t("franchisee.payments.royalty_line", { pct: royaltyPct })} value={fees ? money(fees.royalty_amount) : "-"} />
                <FeeRow label={t("franchisee.payments.marketing_line", { pct: marketingPct })} value={fees ? money(fees.marketing_fund_amount) : "-"} />
                <FeeRow label={t("franchisee.payments.total_line")} value={fees ? money(fees.total_due) : "-"} strong />
              </dl>

              <button type="submit" disabled={submit.isPending} className={`${primaryButton} w-full`}>{t("franchisee.payments.send")}</button>
            </form>
          )}
        </Panel>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("franchisee.payments.confirm_title", { month: month ? formatMonth(month, lng) : "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {fees && amount !== null && t("franchisee.payments.confirm_body", { sales: money(amount), total: money(fees.total_due) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("franchisee.payments.confirm_back")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submit.isPending}
              onClick={(e) => {
                // Stay open until the server answers; the dialog closes in the mutation callbacks.
                e.preventDefault();
                send();
              }}
            >
              {t("franchisee.payments.confirm_send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}

function FeeRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${strong ? "bg-muted/50 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="font-display tabular-nums">{value}</dd>
    </div>
  );
}
