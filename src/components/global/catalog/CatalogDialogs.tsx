import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogAdminItem } from "@/lib/api/network-types";
import type { AreaCode } from "@/lib/api/types";
import { AREAS } from "@/lib/tasks/owner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { PRIORITIES, PROGRAM_DAYS, emptyForm, formFromItem, validateForm, type CatalogForm, type CatalogFormErrors } from "./form";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
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

/** Add a task to the catalog (no item) or edit one (item). The area of an existing task cannot change. */
export function CatalogItemDialog(props: {
  item: CatalogAdminItem | null;
  defaultArea: AreaCode;
  pending: boolean;
  onClose: () => void;
  onSave: (form: CatalogForm, note: string) => void;
}) {
  const { t } = useTranslation();
  const editing = props.item !== null;
  const [form, setForm] = useState<CatalogForm>(props.item ? formFromItem(props.item) : emptyForm(props.defaultArea));
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const errors: CatalogFormErrors = tried ? validateForm(form) : {};
  const set = <K extends keyof CatalogForm>(key: K, value: CatalogForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const submit = () => {
    setTried(true);
    if (Object.keys(validateForm(form)).length === 0) props.onSave(form, note.trim());
  };
  const err = (key: keyof CatalogFormErrors) => (errors[key] ? t(`global.catalog.form.error_${errors[key]}`, { max: PROGRAM_DAYS }) : undefined);

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("global.catalog.form.edit_title", { code: props.item?.code }) : t("global.catalog.form.add_title")}</DialogTitle>
          <DialogDescription>{t("global.catalog.notice")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={t("global.catalog.form.area")} hint={editing ? t("global.catalog.form.area_locked") : t("global.catalog.form.area_hint")}>
            <select value={form.area_code} disabled={editing} onChange={(e) => set("area_code", e.target.value as AreaCode)} className={inputCls}>
              {AREAS.map((a) => <option key={a} value={a}>{a} {t(`areas.${a}`)}</option>)}
            </select>
          </Field>
          <Field label={t("global.catalog.form.name")} error={err("name")}>
            <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className={cn(inputCls, errors.name && "border-status-danger-fg")} />
          </Field>
          <Field label={t("global.catalog.form.acceptance")} hint={t("global.catalog.form.acceptance_hint")} error={err("acceptance")}>
            <textarea rows={3} value={form.acceptance} onChange={(e) => set("acceptance", e.target.value)} className={cn(areaCls, errors.acceptance && "border-status-danger-fg")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("global.catalog.form.owner")} hint={t("global.catalog.form.owner_hint")}>
              <input value={form.owner} onChange={(e) => set("owner", e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("global.catalog.form.support")}>
              <input value={form.support} onChange={(e) => set("support", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label={t("global.catalog.form.applies")} hint={t("global.catalog.form.applies_hint")}>
            <input value={form.applies} onChange={(e) => set("applies", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("global.catalog.form.priority")}>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(`global.catalog.priority.${p}`)}</option>)}
              </select>
            </Field>
            <Field label={t("global.catalog.form.start_day")} error={err("start_day")}>
              <input type="number" min={1} max={PROGRAM_DAYS} value={form.start_day} onChange={(e) => set("start_day", e.target.value)} className={cn(inputCls, errors.start_day && "border-status-danger-fg")} />
            </Field>
            <Field label={t("global.catalog.form.due_day")} error={err("due_day")}>
              <input type="number" min={1} max={PROGRAM_DAYS} value={form.due_day} onChange={(e) => set("due_day", e.target.value)} className={cn(inputCls, errors.due_day && "border-status-danger-fg")} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{t("global.catalog.form.days_hint")}</p>
          {editing && (
            <Field label={t("global.catalog.form.note")} hint={t("global.catalog.form.note_hint")}>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>

        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("global.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{editing ? t("global.save_changes") : t("global.catalog.form.add_confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Archiving needs a reason. The task stays in the catalog and in the history; it only stops going to new programs. */
export function ArchiveCatalogDialog(props: { item: CatalogAdminItem; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
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
          <DialogTitle>{t("global.catalog.archive.title", { code: props.item.code })}</DialogTitle>
          <DialogDescription>{t("global.catalog.archive.body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("global.catalog.archive.reason")} error={tried && !reason.trim() ? t("global.catalog.archive.reason_required") : undefined}>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("global.catalog.archive.placeholder")} className={areaCls} />
        </Field>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("global.catalog.archive.keep")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("global.catalog.archive.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
