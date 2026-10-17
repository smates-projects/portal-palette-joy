import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BookingUrlSection } from "@/components/profile/BookingUrlSection";
import { CalendarDays, Mail, MapPin, Phone, UserPlus } from "lucide-react";
import { useCurrentUser, useOrganizations, useSetGoogleCalendar, useUsersWithInactive } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { isActiveUser, isFirmAdmin } from "@/lib/accounts/permissions";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountHistorySheet, AdminTag, primaryBtn, UserStatusBadge, userStatus } from "@/components/accounts/shared";
import { DeactivatePersonDialog, InvitePersonDialog, PersonActions } from "@/components/accounts/AccountDialogs";

const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function ProfilePage() {
  const { t } = useTranslation();
  const meQ = useCurrentUser();
  const orgsQ = useOrganizations();
  const usersQ = useUsersWithInactive();
  const setCal = useSetGoogleCalendar();
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [history, setHistory] = useState<User | null>(null);

  const me = meQ.data;
  const org = orgsQ.data?.find((o) => o.id === me?.organization_id);
  // The firm admin manages the team ("Mi equipo"); everyone else only sees it.
  const admin = !!me && isFirmAdmin(me);
  const team = (usersQ.data ?? []).filter((u) => u.organization_id && u.organization_id === me?.organization_id && (admin || isActiveUser(u)))
    .sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id) || Number(!isActiveUser(a)) - Number(!isActiveUser(b)) || a.full_name.localeCompare(b.full_name));
  const loading = meQ.isLoading || orgsQ.isLoading || usersQ.isLoading;

  const connect = () => {
    if (!me) return;
    setCal.mutate(me.email, {
      onSuccess: () => toast.success(t("profile.t_connected", { email: me.email })),
      onError: () => toast.error(t("taskDetail.t_error")),
    });
  };
  const disconnect = () => {
    const prev = me?.google_calendar_email ?? null;
    setCal.mutate(null, {
      onSuccess: () =>
        toast.success(t("profile.t_disconnected"), {
          action: { label: t("profile.undo"), onClick: () => setCal.mutate(prev) },
        }),
      onError: () => toast.error(t("taskDetail.t_error")),
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("tasks.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("profile.heading")}</h1>

      {meQ.isError || orgsQ.isError ? (
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("profile.error_title")}</p>
          <button onClick={() => { void meQ.refetch(); void orgsQ.refetch(); }} className="mt-3 text-link hover:underline">{t("profile.retry")}</button>
        </div>
      ) : loading || !me ? (
        <div className="mt-6 space-y-4"><Skeleton className="h-40 rounded-md" /><Skeleton className="h-32 rounded-md" /></div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Firm */}
          <section className="rounded-md border border-border bg-surface">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">{org?.name}</h2>
                {org?.area && <p className="mt-0.5 text-xs text-muted-foreground">{t("profile.area", { area: `${org.area} · ${t(`areas.${org.area}`)}` })}</p>}
              </div>
              <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t(`roles.${me.role}`)}</span>
            </div>
            <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{t("profile.specialty")}</dt>
                <dd className="mt-0.5">{org?.specialty ?? t("profile.no_specialty")}</dd>
              </div>
              {org?.city && <Row icon={<MapPin className="h-3.5 w-3.5" />} label={t("profile.city")} value={org.city} />}
              {org?.email && <Row icon={<Mail className="h-3.5 w-3.5" />} label={t("profile.email")} value={org.email} />}
              {org?.phone && <Row icon={<Phone className="h-3.5 w-3.5" />} label={t("profile.phone")} value={org.phone} />}
            </dl>
          </section>

          {/* Team ("Mi equipo": the firm admin invites and deactivates) */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t(admin ? "profile.my_team_title" : "profile.team_title")}</h2>
                {admin && <p className="mt-0.5 text-xs text-muted-foreground">{t("profile.my_team_hint")}</p>}
              </div>
              {admin && <button className={primaryBtn} onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" />{t("accounts.invite.title")}</button>}
            </div>
            {team.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">{t(admin ? "profile.my_team_empty" : "profile.team_empty")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface">
                {team.map((u) => (
                  <li key={u.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", !isActiveUser(u) && "text-muted-foreground")}>
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold", isActiveUser(u) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {initials(u.full_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {u.full_name}
                        {u.is_admin && <AdminTag />}
                        {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">{t("profile.you")}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{[u.title, u.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    <UserStatusBadge status={userStatus(u)} />
                    {admin ? (
                      <PersonActions user={u} orgs={orgsQ.data ?? []} onDeactivate={setDeactivating} onHistory={setHistory} />
                    ) : (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {u.google_calendar_email ? t("profile.cal_on_short") : t("profile.cal_off_short")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Google Calendar */}
          <section className="rounded-md border border-border bg-surface px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold">{t("profile.cal_title")}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {me.google_calendar_email ? t("profile.cal_on", { email: me.google_calendar_email }) : t("profile.cal_off")}
                  </p>
                </div>
              </div>
              {me.google_calendar_email ? (
                <button
                  onClick={disconnect}
                  disabled={setCal.isPending}
                  className="h-8 rounded-md border border-border px-3 text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {t("profile.cal_disconnect")}
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={setCal.isPending}
                  className="h-8 rounded-md bg-primary px-3 font-display text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {t("profile.cal_connect")}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("profile.cal_note")}</p>
          </section>

          <BookingUrlSection />
          <NotificationPreferences />
        </div>
      )}
      {admin && me && <InvitePersonDialog open={inviting} onOpenChange={setInviting} fixedRole="partner_firm" fixedOrganizationId={me.organization_id ?? undefined} />}
      <DeactivatePersonDialog user={deactivating} onClose={() => setDeactivating(null)} />
      <AccountHistorySheet user={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-0.5 tabular-nums">{value}</dd>
    </div>
  );
}
