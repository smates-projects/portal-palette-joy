import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useNotificationPreferences, useSetNotificationPreference } from "@/lib/api/hooks";
import type { NotificationChannel, NotificationKind } from "@/lib/api/types";
import { preferenceLabel } from "@/lib/notifications/text";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationPreferences() {
  const { t, i18n } = useTranslation();
  const label = (kind: string) => preferenceLabel(kind, (key, values) => t(key, values ?? {}), (key) => i18n.exists(key));
  const q = useNotificationPreferences();
  const set = useSetNotificationPreference();
  const change = (kind: NotificationKind, channel: NotificationChannel, enabled: boolean) =>
    set.mutate(
      { kind, channel, enabled },
      {
        onSuccess: () =>
          toast.success(t("notifications.prefs_saved"), {
            action: { label: t("profile.undo"), onClick: () => set.mutate({ kind, channel, enabled: !enabled }) },
          }),
        onError: () => toast.error(t("notifications.prefs_error")),
      },
    );

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold">{t("notifications.prefs_title")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("notifications.prefs_body")}</p>
      </div>
      <div className="grid grid-cols-[1fr_96px_96px] border-t border-border px-5 py-2 text-xs font-medium text-muted-foreground">
        <span>{t("notifications.prefs_type")}</span>
        <span className="text-center">{t("notifications.prefs_in_app")}</span>
        <span className="text-center">{t("notifications.prefs_email")}</span>
      </div>
      {q.isLoading ? (
        <div className="space-y-2 px-5 pb-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : q.isError ? (
        <div className="px-5 pb-4 text-sm">
          <p>{t("notifications.error")}</p>
          <button onClick={() => void q.refetch()} className="mt-1 text-link hover:underline">{t("notifications.retry")}</button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {(q.data ?? []).map((p) => (
            <li key={p.kind} className="grid grid-cols-[1fr_96px_96px] items-center px-5 py-2.5 text-sm">
              <span>{label(p.kind)}</span>
              <span className="flex justify-center">
                <Switch checked={p.in_app} onCheckedChange={(v) => change(p.kind, "in_app", v)} aria-label={`${label(p.kind)} · ${t("notifications.prefs_in_app")}`} />
              </span>
              <span className="flex justify-center">
                <Switch checked={p.email} onCheckedChange={(v) => change(p.kind, "email", v)} aria-label={`${label(p.kind)} · ${t("notifications.prefs_email")}`} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{t("notifications.prefs_email_note")}</p>
    </section>
  );
}
