import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCloseValidation, useSaveValidation, useUsers } from "@/lib/api/hooks";
import type { LeadWithComputed, ValidationInput } from "@/lib/api/types";
import { formatDate, formatUsd } from "@/lib/format";
import { EQUITY_RANGES, SM_SQUARE_EQUITY, closeBlock, parsePct, splitErrors, validationInputOf, type SplitErrors } from "@/lib/leads/validation";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";

const inputCls = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:bg-muted disabled:text-muted-foreground";
const sectionTitle = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

type Text = { equity_owner: string; equity_bishop: string; investment_amount: string; notes: string; sm_square_center: string; sm_square_holder_user_id: string };

const textOf = (v: ValidationInput): Text => ({
  equity_owner: v.equity_owner === null ? "" : String(v.equity_owner),
  equity_bishop: v.equity_bishop === null ? "" : String(v.equity_bishop),
  investment_amount: v.investment_amount === null ? "" : String(v.investment_amount),
  notes: v.notes ?? "",
  sm_square_center: v.sm_square_center ?? "",
  sm_square_holder_user_id: v.sm_square_holder_user_id ?? "",
});
const inputOfText = (x: Text): ValidationInput => ({
  equity_owner: parsePct(x.equity_owner),
  equity_bishop: parsePct(x.equity_bishop),
  equity_sm: SM_SQUARE_EQUITY,
  investment_amount: x.investment_amount.trim() === "" ? null : Number(x.investment_amount.replace(/[.,\s]/g, "")),
  notes: x.notes.trim() || null,
  sm_square_center: x.sm_square_center.trim() || null,
  sm_square_holder_user_id: x.sm_square_holder_user_id || null,
});

/**
 * "Validación" of an accepted lead: the definitive percentages of the new franchisor (owner 50-75 %, Bishop 15-40 %,
 * SM Square 10 % fixed, 100 in all, checked inline), the investment, notes, and the SM Square center with its holder
 * (who signs the Operating Agreement). "Guardar" keeps a draft; "Cerrar validación" (office admin) makes it
 * definitive. Closed, it reads only, with who closed it and when.
 */
export function ValidationCard({ lead, readOnly, canClose }: { lead: LeadWithComputed; readOnly: boolean; canClose: boolean }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const usersQ = useUsers();
  const save = useSaveValidation();
  const close = useCloseValidation();
  const v = lead.validation ?? null;
  const [text, setText] = useState<Text>(() => textOf(validationInputOf(v)));
  const [tried, setTried] = useState(false);
  const users = usersQ.data ?? [];
  const nameOf = (id: string | null | undefined) => (id ? users.find((u) => u.id === id)?.full_name ?? "" : "");
  const holders = users.filter((u) => (u.role === "sm_team" && u.organization_id === lead.office_id) || u.role === "sm_global").filter((u) => u.can_sign_sm_square);

  if (v?.status === "closed")
    return (
      <section className="space-y-2">
        <h3 className={sectionTitle}>{t("entry_contracts.validation.title")}</h3>
        <div className="rounded-md border border-border p-4 text-sm">
          <dl className="grid grid-cols-3 gap-3">
            <Pct label={t("entry_contracts.validation.owner")} value={v.equity_owner} />
            <Pct label={t("entry_contracts.validation.bishop")} value={v.equity_bishop} />
            <Pct label={t("entry_contracts.validation.sm")} value={v.equity_sm} />
          </dl>
          <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
            <div><dt className="text-muted-foreground">{t("entry_contracts.validation.investment")}</dt><dd className="mt-0.5 font-display tabular-nums">{v.investment_amount !== null ? formatUsd(v.investment_amount, lng) : t("app.no_data")}</dd></div>
            <div><dt className="text-muted-foreground">{t("entry_contracts.validation.center")}</dt><dd className="mt-0.5">{[v.sm_square_center, nameOf(v.sm_square_holder_user_id)].filter(Boolean).join(" · ") || t("app.no_data")}</dd></div>
          </dl>
          {v.notes && <p className="mt-3 rounded-[4px] border border-border bg-muted/50 px-3 py-2 text-xs">{v.notes}</p>}
          <p className="mt-3 text-xs text-muted-foreground">{t("entry_contracts.validation.closed", { name: nameOf(v.closed_by) || "Strategic Mates", date: v.closed_at ? formatDate(v.closed_at, lng) : "" })}</p>
        </div>
      </section>
    );

  const input = inputOfText(text);
  const errors: SplitErrors = splitErrors(input);
  const sum = [input.equity_owner, input.equity_bishop, input.equity_sm].reduce<number>((a, b) => a + (typeof b === "number" && Number.isFinite(b) ? b : 0), 0);
  const amountBad = input.investment_amount !== null && (!Number.isFinite(input.investment_amount) || input.investment_amount < 0);
  const block = closeBlock(input);
  const dirty = JSON.stringify(input) !== JSON.stringify(validationInputOf(v));
  const set = (key: keyof Text, value: string) => setText((x) => ({ ...x, [key]: value }));
  const fieldError = (field: "equity_owner" | "equity_bishop") => {
    const e = errors[field];
    if (!e) return null;
    const { min, max } = EQUITY_RANGES[field];
    return e === "required" ? t("entry_contracts.validation.err_required") : t("entry_contracts.validation.err_range", { min, max });
  };
  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    toast.error(["invalid_split", "sm_square_signer_required", "admin_only", "validation_incomplete"].includes(code) ? t(`entry_contracts.validation.err_${code}`) : t("pipeline.t_error"));
  };
  const doSave = (then?: () => void) => {
    setTried(true);
    if (Object.keys(errors).length > 0 || amountBad) return;
    save.mutate({ id: lead.id, input }, { onSuccess: () => { if (then) then(); else toast.success(t("entry_contracts.validation.t_saved")); }, onError: fail });
  };
  const doClose = () => {
    setTried(true);
    if (block || amountBad) return;
    const run = () => close.mutate(lead.id, { onSuccess: () => toast.success(t("entry_contracts.validation.t_closed", { name: lead.business.name })), onError: fail });
    // Unsaved changes go first, so what closes is what is on screen.
    return dirty ? doSave(run) : run();
  };
  const disabled = readOnly || save.isPending || close.isPending;

  return (
    <section className="space-y-2">
      <h3 className={sectionTitle}>{t("entry_contracts.validation.title")}</h3>
      <div className="space-y-4 rounded-md border border-border p-4 text-sm">
        <p className="text-muted-foreground">{t("entry_contracts.validation.hint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <PctInput id="v-owner" label={t("entry_contracts.validation.owner")} value={text.equity_owner} disabled={disabled} error={fieldError("equity_owner")} onChange={(x) => set("equity_owner", x)} />
          <PctInput id="v-bishop" label={t("entry_contracts.validation.bishop")} value={text.equity_bishop} disabled={disabled} error={fieldError("equity_bishop")} onChange={(x) => set("equity_bishop", x)} />
          <PctInput id="v-sm" label={t("entry_contracts.validation.sm")} value={String(SM_SQUARE_EQUITY)} disabled hint={t("entry_contracts.validation.sm_fixed")} onChange={() => undefined} />
        </div>
        <p className={cn("text-xs", errors.sum ? "text-status-danger-fg" : "text-muted-foreground")} role={errors.sum ? "alert" : undefined}>
          {errors.sum ? t("entry_contracts.validation.err_sum", { sum }) : t("entry_contracts.validation.sum", { sum })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("entry_contracts.validation.investment")}</span>
            <input inputMode="numeric" value={text.investment_amount} disabled={disabled} onChange={(e) => set("investment_amount", e.target.value)} placeholder="150000" className={cn(inputCls, "font-display tabular-nums", amountBad && "border-status-danger-fg")} />
            {amountBad && <span className="block text-xs text-status-danger-fg">{t("entry_contracts.validation.err_amount")}</span>}
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("entry_contracts.validation.center")}</span>
            <input value={text.sm_square_center} disabled={disabled} onChange={(e) => set("sm_square_center", e.target.value)} placeholder={t("entry_contracts.validation.center_placeholder")} className={cn(inputCls, tried && block === "center_required" && "border-status-danger-fg")} />
            {tried && block === "center_required" && <span className="block text-xs text-status-danger-fg">{t("entry_contracts.validation.err_center")}</span>}
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry_contracts.validation.holder")}</span>
          <select value={text.sm_square_holder_user_id} disabled={disabled || holders.length === 0} onChange={(e) => set("sm_square_holder_user_id", e.target.value)} className={cn(inputCls, tried && block === "holder_required" && "border-status-danger-fg")}>
            <option value="">{t("entry_contracts.validation.holder_placeholder")}</option>
            {holders.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <span className="block text-xs text-muted-foreground">{holders.length === 0 ? t("entry_contracts.validation.holder_none") : t("entry_contracts.validation.holder_hint")}</span>
          {tried && block === "holder_required" && <span className="block text-xs text-status-danger-fg">{t("entry_contracts.validation.err_holder")}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("entry_contracts.validation.notes")}</span>
          <textarea rows={2} value={text.notes} disabled={disabled} onChange={(e) => set("notes", e.target.value)} className={cn(inputCls, "h-auto resize-none py-2")} />
        </label>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => doSave()} disabled={disabled || !dirty} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">{t("entry_contracts.validation.save")}</button>
            {canClose && <PrimaryButton onClick={doClose} disabled={disabled}>{t("entry_contracts.validation.close")}</PrimaryButton>}
            {!canClose && <span className="text-xs text-muted-foreground">{t("entry_contracts.validation.close_admin")}</span>}
          </div>
        )}
        {tried && block === "invalid_split" && Object.keys(errors).length === 0 && <p className="text-xs text-status-danger-fg">{t("entry_contracts.validation.err_complete")}</p>}
      </div>
    </section>
  );
}

function PctInput(props: { id: string; label: string; value: string; disabled: boolean; error?: string | null; hint?: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={props.id} className="block space-y-1.5">
      <span className="text-sm font-medium">{props.label}</span>
      <span className="relative block">
        <input id={props.id} inputMode="decimal" value={props.value} disabled={props.disabled} aria-invalid={!!props.error}
          onChange={(e) => props.onChange(e.target.value)} className={cn(inputCls, "pr-8 font-display tabular-nums", props.error && "border-status-danger-fg")} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
      </span>
      {props.error ? <span className="block text-xs text-status-danger-fg">{props.error}</span> : props.hint ? <span className="block text-xs text-muted-foreground">{props.hint}</span> : null}
    </label>
  );
}

function Pct({ label, value }: { label: string; value: number | null }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value === null || value === undefined ? <span className="font-sans text-sm font-normal text-muted-foreground">{t("app.no_data")}</span> : `${value} %`}</dd>
    </div>
  );
}
