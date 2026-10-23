import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useUpdateRules } from "@/lib/api/hooks";
import type { MeetingHours, PlatformRules } from "@/lib/api/network-types";
import { MEETING_TIMEZONES, meetingHoursOf, validateMeetingHours } from "@/lib/calendar/scheduling";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { DefaultTag } from "./RulesPage";

const fieldCls =
  "h-9 rounded-[4px] border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

/** Label key of a zone: "America/New_York" → "America_New_York". */
export const zoneKey = (zone: string) => zone.replace(/\//g, "_");

/** Calendar v2, SM Global: the window where the portal offers free slots (start, end, time zone). */
export function MeetingHoursRules({ rules }: { rules: PlatformRules }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const saved = meetingHoursOf(rules);
  const [form, setForm] = useState<MeetingHours>(saved);
  const invalid = validateMeetingHours(form) !== null;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // The stored zone stays selectable even when it is not in the short list.
  const zones = MEETING_TIMEZONES.includes(saved.timezone as (typeof MEETING_TIMEZONES)[number]) ? [...MEETING_TIMEZONES] : [saved.timezone, ...MEETING_TIMEZONES];

  const save = () => {
    if (invalid || !dirty) return;
    update.mutate({ patch: { meeting_hours: form } }, {
      onSuccess: () => toast.success(t("calendar.rules.t_saved"), {
        action: { label: t("global.undo"), onClick: () => update.mutate({ patch: { meeting_hours: saved } }) },
      }),
      onError: () => toast.error(t("global.t_error")),
    });
  };

  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">{t("calendar.rules.title")}{rules.defaults?.includes("meeting_hours") && <DefaultTag />}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("calendar.rules.hint", { minutes: rules.limits?.meeting_slot_minutes ?? "…" })}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span className="block font-medium">{t("calendar.rules.start")}</span>
          <input type="time" step={1800} value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className={cn(fieldCls, "w-32", invalid && "border-status-danger-fg")} aria-invalid={invalid} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block font-medium">{t("calendar.rules.end")}</span>
          <input type="time" step={1800} value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} className={cn(fieldCls, "w-32", invalid && "border-status-danger-fg")} aria-invalid={invalid} />
        </label>
        <label className="block min-w-56 flex-1 space-y-1 text-sm">
          <span className="block font-medium">{t("calendar.rules.timezone")}</span>
          <select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} className={cn(fieldCls, "w-full")}>
            {zones.map((z) => (
              <option key={z} value={z}>{t(`calendar.rules.zones.${zoneKey(z)}`, { defaultValue: z })}</option>
            ))}
          </select>
        </label>
      </div>
      {invalid && <p className="mt-1 text-xs text-status-danger-fg">{t("calendar.rules.error")}</p>}
      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={save} disabled={!dirty || invalid || update.isPending}>{t("calendar.rules.save")}</PrimaryButton>
      </div>
    </section>
  );
}
