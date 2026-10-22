import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { useCalendarConnection, useConnectCalendar, useDisconnectCalendar } from "@/lib/api/hooks";
import { isCalendarConsent } from "@/lib/api/repositories";
import type { User } from "@/lib/api/types";
import { isCalendarConnected, needsReconnect } from "@/lib/calendar/scheduling";
import { cn } from "@/lib/utils";

/** How Google's consent ended, as the API's callback reports it on /perfil?calendar=. */
export type CalendarReturnStatus = "connected" | "denied" | "error";

const RETURN_TONE: Record<CalendarReturnStatus, string> = {
  connected: "border-status-success-border bg-status-success-bg text-status-success-fg",
  denied: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  error: "border-status-danger-border bg-status-danger-bg text-status-danger-fg",
};

/** Real API: connecting answers Google's consent screen and the person goes there; the mock connects at once. */
const goToConsent = (answer: unknown): boolean => {
  if (!isCalendarConsent(answer)) return false;
  window.location.assign(answer.consent_url);
  return true;
};

/**
 * Google Calendar card of Mi perfil, the same for every role: read and write access (free time for the slot picker,
 * the meetings created with their Meet link). "Volver a conectar" when Google stopped accepting the access.
 */
export function GoogleCalendarCard({ me, returnStatus, onDismissReturn }: {
  me: User;
  returnStatus?: CalendarReturnStatus | undefined;
  onDismissReturn?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const connectionQ = useCalendarConnection();
  const connect = useConnectCalendar();
  const disconnect = useDisconnectCalendar();
  const connection = connectionQ.data;
  const connected = connection ? connection.connected : isCalendarConnected(me);
  const email = connection?.email ?? me.google_calendar_email;
  const reconnect = needsReconnect(connection);
  const pending = connect.isPending || disconnect.isPending;

  const doConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (answer) => {
        if (goToConsent(answer) || isCalendarConsent(answer)) return;
        toast.success(t("profile.t_connected", { email: answer.email ?? me.email }));
      },
      onError: () => toast.error(t("taskDetail.t_error")),
    });
  const doDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () =>
        toast.success(t("profile.t_disconnected"), {
          // Undo connects again: with the real API that means Google's consent screen once more.
          action: { label: t("profile.undo"), onClick: doConnect },
        }),
      onError: () => toast.error(t("taskDetail.t_error")),
    });

  return (
    <section id="google-calendar" className="scroll-mt-4 rounded-md border border-border bg-surface px-5 py-4">
      {returnStatus && (
        <div role="status" className={cn("mb-4 flex items-start justify-between gap-3 rounded-[4px] border px-3 py-2 text-sm", RETURN_TONE[returnStatus])}>
          <p>{t(`profile.cal_return_${returnStatus}`)}</p>
          {onDismissReturn && (
            <button onClick={onDismissReturn} className="shrink-0 text-xs underline-offset-2 hover:underline">{t("profile.cal_return_dismiss")}</button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">{t("calendar.profile.title")}</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{t("calendar.profile.body")}</p>
            <p className="mt-1 text-sm">{connected && email ? t("calendar.profile.on", { email }) : !reconnect ? t("calendar.profile.off") : null}</p>
            {/* SM Global has its own Calendario: once connected, the way there. */}
            {connected && me.role === "sm_global" && (
              <Link to="/calendario" className="mt-1 inline-block text-sm text-link hover:underline">{t("calendar.profile.see_calendar")}</Link>
            )}
          </div>
        </div>
        {connected ? (
          <button onClick={doDisconnect} disabled={pending} className="h-8 rounded-md border border-border px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50">
            {t("calendar.profile.disconnect")}
          </button>
        ) : !reconnect ? (
          <button onClick={doConnect} disabled={pending} className="h-8 rounded-md bg-primary px-3 font-display text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {t("calendar.profile.connect")}
          </button>
        ) : null}
      </div>
      {reconnect && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
          <p className="max-w-xl">{t("calendar.profile.reconnect_note")}</p>
          <button onClick={doConnect} disabled={pending} className="h-8 shrink-0 rounded-md border border-status-warning-fg bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">
            {t("calendar.profile.reconnect")}
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("calendar.profile.consent_note")}</p>
    </section>
  );
}
