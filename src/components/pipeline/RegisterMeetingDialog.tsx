import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { RegisterMeetingInput } from "@/lib/api/types";
import {
  MEETING_DURATION_CHOICES, emptyRegisterMeetingForm, toRegisterMeetingInput, validateRegisterMeeting, type RegisterMeetingErrors, type RegisterMeetingForm,
} from "@/lib/leads/register-meeting";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";

const inputCls =
  "h-9 w-full rounded-[4px] border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

function Field({ label, hint, error, children }: { label: string; hint?: string | undefined; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-status-danger-fg">{error}</span>}
    </label>
  );
}

/**
 * "Registrar reunión": a meeting SM agreed with the owner outside the booking calendar. Date, time, how long and an
 * optional Meet link; the lead moves to Reunión (or gets its new meeting after a reschedule).
 */
export function RegisterMeetingDialog(props: { name: string; rebook: boolean; pending: boolean; onClose: () => void; onConfirm: (input: RegisterMeetingInput) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<RegisterMeetingForm>(emptyRegisterMeetingForm());
  const [tried, setTried] = useState(false);
  const errors: RegisterMeetingErrors = tried ? validateRegisterMeeting(form) : {};
  const err = (key: keyof RegisterMeetingForm) => (errors[key] ? t(`entry.register.error_${errors[key]}`) : undefined);
  const set = <K extends keyof RegisterMeetingForm>(key: K, value: RegisterMeetingForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const submit = () => {
    setTried(true);
    if (Object.keys(validateRegisterMeeting(form)).length === 0) props.onConfirm(toRegisterMeetingInput(form));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry.register.title", { name: props.name })}</DialogTitle>
          <DialogDescription>{t(props.rebook ? "entry.register.body_rebook" : "entry.register.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("entry.register.date")} error={err("date")}>
              <input autoFocus type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={cn(inputCls, errors.date && "border-status-danger-fg")} />
            </Field>
            <Field label={t("entry.register.time")} error={err("time")}>
              <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className={cn(inputCls, errors.time && "border-status-danger-fg")} />
            </Field>
          </div>
          <Field label={t("entry.register.duration")} error={err("duration_minutes")}>
            <select value={form.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} className={inputCls}>
              {MEETING_DURATION_CHOICES.map((m) => <option key={m} value={m}>{t("entry.register.minutes", { count: m })}</option>)}
            </select>
          </Field>
          <Field label={t("entry.register.meet_url")} hint={t("entry.register.meet_url_hint")} error={err("meet_url")}>
            <input type="url" inputMode="url" value={form.meet_url} onChange={(e) => set("meet_url", e.target.value)} placeholder="https://meet.google.com/..." className={cn(inputCls, errors.meet_url && "border-status-danger-fg")} />
          </Field>
        </div>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("pipeline.cancel")}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={props.pending}>{t("entry.register.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
