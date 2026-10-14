import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { CreateOfficeInput } from "@/lib/api/network-types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { emptyNewOfficeForm, toCreateOfficeInput, validateNewOffice, type NewOfficeErrors, type NewOfficeForm } from "./form";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
const areaCls = "w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-status-danger-fg">{error}</span>}
    </label>
  );
}

/** Opens an office: city, who runs it and when it plans to open. It starts "En apertura" with its checklist. */
export function NewOfficeDialog(props: { pending: boolean; onClose: () => void; onCreate: (input: CreateOfficeInput) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<NewOfficeForm>(emptyNewOfficeForm());
  const [tried, setTried] = useState(false);
  const errors: NewOfficeErrors = tried ? validateNewOffice(form) : {};
  const set = (key: keyof NewOfficeForm, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const err = (key: keyof NewOfficeForm) => (errors[key] ? t(`global.offices.new_form.error_${errors[key]}`) : undefined);
  const submit = () => {
    setTried(true);
    if (Object.keys(validateNewOffice(form)).length === 0) props.onCreate(toCreateOfficeInput(form));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("global.offices.new_form.title")}</DialogTitle>
          <DialogDescription>{t("global.offices.new_form.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("global.offices.new_form.city")} hint={t("global.offices.new_form.city_hint")} error={err("city")}>
            <input autoFocus value={form.city} onChange={(e) => set("city", e.target.value)} className={cn(inputCls, errors.city && "border-status-danger-fg")} />
          </Field>
          <Field label={t("global.offices.new_form.manager_name")} error={err("manager_name")}>
            <input value={form.manager_name} onChange={(e) => set("manager_name", e.target.value)} className={cn(inputCls, errors.manager_name && "border-status-danger-fg")} />
          </Field>
          <Field label={t("global.offices.new_form.manager_email")} hint={t("global.offices.new_form.manager_email_hint")} error={err("manager_email")}>
            <input type="email" value={form.manager_email} onChange={(e) => set("manager_email", e.target.value)} className={cn(inputCls, errors.manager_email && "border-status-danger-fg")} />
          </Field>
          <Field label={t("global.offices.new_form.opening_date")} error={err("planned_opening_date")}>
            <input type="date" value={form.planned_opening_date} onChange={(e) => set("planned_opening_date", e.target.value)} className={cn(inputCls, errors.planned_opening_date && "border-status-danger-fg")} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("global.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("global.offices.new_form.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pausing needs a reason. The office keeps its data; it only stops being an operating office. */
export function PauseOfficeDialog(props: { officeName: string; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (reason.trim()) props.onConfirm(reason.trim());
  };
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("global.office.pause_form.title", { name: props.officeName })}</DialogTitle>
          <DialogDescription>{t("global.office.pause_form.body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("global.office.pause_form.reason")} error={tried && !reason.trim() ? t("global.office.pause_form.reason_required") : undefined}>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("global.office.pause_form.placeholder")} className={areaCls} />
        </Field>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("global.office.pause_form.keep")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("global.office.pause_form.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
