import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { BookingUrlSection } from "@/components/profile/BookingUrlSection";
import { TwoFactorSection } from "@/components/profile/TwoFactorSection";
import { Mail, MapPin, Phone, UserPlus } from "lucide-react";
import { useCurrentUser, useOrganizations, useUsersWithInactive } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { isActiveUser, isFirmAdmin } from "@/lib/accounts/permissions";
import { isCalendarConnected } from "@/lib/calendar/scheduling";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountHistorySheet, AdminTag, primaryBtn, UserStatusBadge, userStatus } from "@/components/accounts/shared";
import { DeactivatePersonDialog, InvitePersonDialog, PersonActions } from "@/components/accounts/AccountDialogs";
import { GoogleCalendarCard, type CalendarReturnStatus } from "./GoogleCalendarCard";

export type { CalendarReturnStatus } from "./GoogleCalendarCard";

const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function ProfilePage({ calendarStatus, onDismissCalendarStatus }: { calendarStatus?: CalendarReturnStatus | undefined; onDismissCalendarStatus?: () => void } = {}) {
  const { t } = useTranslation();
  const meQ = useCurrentUser();
  const orgsQ = useOrganizations();
  const usersQ = useUsersWithInactive();
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
                        {isCalendarConnected(u) ? t("profile.cal_on_short") : t("profile.cal_off_short")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Google Calendar: read and write, for every role */}
          <GoogleCalendarCard me={me} returnStatus={calendarStatus} onDismissReturn={onDismissCalendarStatus} />

          <TwoFactorSection me={me} />
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
