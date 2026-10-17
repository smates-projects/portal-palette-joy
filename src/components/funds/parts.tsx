import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Paperclip } from "lucide-react";
import { TODAY } from "@/config/app";
import { PAYMENT_METHODS, type FundsStatus, type PaymentMethod, type Receipt } from "@/lib/api/types";
import { formatUsd } from "@/lib/format";
import { isReceiptFile, parseWholeUsd } from "@/lib/leads/funds";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

export const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

/** USD amount in Archivo with tabular figures. */
export function Amount({ value, className }: { value: number; className?: string }) {
  const { i18n } = useTranslation();
  return <span className={cn("font-display tabular-nums", className)}>{formatUsd(value, i18n.language)}</span>;
}

const TONES = {
  neutral: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  info: "border-status-info-border bg-status-info-bg text-status-info-fg",
  success: "border-status-success-border bg-status-success-bg text-status-success-fg",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
} as const;

/** Status badge: tint, darker text and a visible border of the same hue, 4 px radius. */
export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium leading-none", TONES[tone])}>{children}</span>;
}

const FUNDS_TONE: Record<FundsStatus, keyof typeof TONES> = { pending: "neutral", partial: "warning", received: "success" };
export function FundsStatusBadge({ status }: { status: FundsStatus }) {
  const { t } = useTranslation();
  return <Badge tone={FUNDS_TONE[status]}>{t(`funds.status.${status}`)}</Badge>;
}

export function ReceiptLink({ receipt }: { receipt: Receipt }) {
  const { t } = useTranslation();
  // Simulated upload: there is no file behind it yet, so the link does nothing.
  return (
    <a href="#" onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-1 text-link hover:underline" title={t("funds.receipt_size", { kb: receipt.size_kb })}>
      <FileText className="h-3 w-3" aria-hidden />{receipt.file_name}
    </a>
  );
}

/** File picker for a receipt (PDF or image). The upload is simulated: only name and size are kept. */
export function ReceiptPicker({ value, onChange, required }: { value: Receipt | null; onChange: (r: Receipt | null) => void; required?: boolean }) {
  const { t } = useTranslation();
  const [wrongType, setWrongType] = useState(false);
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{t(required ? "funds.form.receipt_required" : "funds.form.receipt")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
          <Paperclip className="h-3.5 w-3.5" aria-hidden />{t(value ? "funds.form.receipt_change" : "funds.form.receipt_pick")}
          <input
            type="file"
            accept=".pdf,image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const ok = isReceiptFile(f.name);
              setWrongType(!ok);
              onChange(ok ? { file_name: f.name, size_kb: Math.max(1, Math.round(f.size / 1024)) } : null);
            }}
          />
        </label>
        {value && <span className="text-xs text-muted-foreground">{value.file_name}</span>}
      </div>
      {wrongType && <p className="text-xs text-status-danger-fg">{t("funds.form.receipt_type")}</p>}
      <p className="text-xs text-muted-foreground">{t("funds.form.receipt_hint")}</p>
    </div>
  );
}

export interface PaymentFormValue {
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  receipt: Receipt | null;
}

/**
 * One form for every payment: SM records what the Bishop sent, the Bishop reports his transfer, SM marks a firm
 * payment as paid. `amount` is shown only when it can be typed. `validate` returns an error key of funds.errors.
 */
export function PaymentDialog(props: {
  title: string;
  body: string;
  confirm: string;
  withAmount: boolean;
  defaultAmount?: number;
  receiptRequired?: boolean;
  pending: boolean;
  validate: (v: PaymentFormValue) => string | null;
  onClose: () => void;
  onSubmit: (v: PaymentFormValue) => void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(props.defaultAmount ? String(props.defaultAmount) : "");
  const [paidOn, setPaidOn] = useState(TODAY);
  const [method, setMethod] = useState<PaymentMethod>("wire");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const v: PaymentFormValue = { amount: props.withAmount ? parseWholeUsd(amount) : props.defaultAmount ?? 0, paid_on: paidOn, method, reference: reference.trim() || null, receipt };
    const err = props.validate(v);
    setError(err);
    if (!err) props.onSubmit(v);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.body}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {props.withAmount && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("funds.form.amount")}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputCls, "font-display tabular-nums")} />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("funds.form.date")}</span>
              <input type="date" value={paidOn} max={TODAY} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("funds.form.method")}</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`funds.method.${m}`)}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("funds.form.reference")}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("funds.form.reference_placeholder")} className={inputCls} />
          </label>
          <ReceiptPicker value={receipt} onChange={setReceipt} {...(props.receiptRequired ? { required: true } : {})} />
          {error && <p className="text-xs text-status-danger-fg">{t(`funds.errors.${error}`)}</p>}
        </div>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("funds.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{props.confirm}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
