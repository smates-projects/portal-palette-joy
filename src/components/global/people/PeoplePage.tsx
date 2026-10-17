import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { useBusinesses, useCurrentUser, useOrganizations, useUsersWithInactive } from "@/lib/api/hooks";
import type { User, UserRole, UserStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyBox, ErrorBox, GlobalHeader, ListSkeleton } from "../shared";
import { AccountHistorySheet, AdminTag, officeNameOf, placeOf, primaryBtn, UserStatusBadge, userStatus } from "@/components/accounts/shared";
import { DeactivatePersonDialog, InvitePersonDialog, PersonActions } from "@/components/accounts/AccountDialogs";

const ALL = "__all";
const ROLES: UserRole[] = ["sm_global", "sm_team", "partner_firm", "business_owner", "bishop", "franchisee"];
const STATUSES: UserStatus[] = ["invited", "active", "inactive"];

/** Personas (SM Global): everyone in the network, by office, role and status. One action: "Invitar persona". */
export function PeoplePage() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const usersQ = useUsersWithInactive();
  const orgsQ = useOrganizations();
  const bizQ = useBusinesses();
  const [office, setOffice] = useState<string | undefined>();
  const [role, setRole] = useState<UserRole | undefined>();
  const [status, setStatus] = useState<UserStatus | undefined>();
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [history, setHistory] = useState<User | null>(null);

  const header = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <GlobalHeader question={t("accounts.people.question")} />
      <button className={primaryBtn} onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" />{t("accounts.invite.title")}</button>
    </div>
  );
  if (usersQ.isError || orgsQ.isError || bizQ.isError)
    return <div className="mx-auto max-w-7xl px-6 py-8">{header}<div className="mt-6"><ErrorBox onRetry={() => { void usersQ.refetch(); void orgsQ.refetch(); void bizQ.refetch(); }} /></div></div>;
  if (usersQ.isLoading || orgsQ.isLoading || bizQ.isLoading || !me)
    return <div className="mx-auto max-w-7xl px-6 py-8">{header}<div className="mt-6"><ListSkeleton rows={6} /></div></div>;

  const orgs = orgsQ.data ?? [];
  const businesses = bizQ.data ?? [];
  const offices = orgs.filter((o) => o.kind === "sm").sort((a, b) => a.name.localeCompare(b.name));
  const all = (usersQ.data ?? []).map((u) => ({ user: u, office: officeNameOf(u, orgs, businesses), place: placeOf(u, orgs, businesses, t), status: userStatus(u) }));
  const rows = all
    .filter((r) => (!office || (office === "global" ? r.user.role === "sm_global" : r.office === offices.find((o) => o.id === office)?.name)) && (!role || r.user.role === role) && (!status || r.status === status))
    .sort((a, b) => a.office.localeCompare(b.office) || ROLES.indexOf(a.user.role) - ROLES.indexOf(b.user.role) || a.user.full_name.localeCompare(b.user.full_name));
  const hasFilters = !!(office || role || status);
  const counts = { invited: all.filter((r) => r.status === "invited").length, inactive: all.filter((r) => r.status === "inactive").length };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {header}
      <p className="mt-2 text-sm text-muted-foreground">{t("accounts.people.summary", { total: all.length, invited: counts.invited, inactive: counts.inactive })}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Filter label={t("accounts.people.filter_office")} value={office} all={t("accounts.people.all_offices")} onChange={setOffice}
          options={[{ value: "global", label: t("roles.sm_global") }, ...offices.map((o) => ({ value: o.id, label: o.name }))]} />
        <Filter label={t("accounts.people.filter_role")} value={role} all={t("accounts.people.all_roles")} onChange={(v) => setRole(v as UserRole | undefined)}
          options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
        <Filter label={t("accounts.people.filter_status")} value={status} all={t("accounts.people.all_statuses")} onChange={(v) => setStatus(v as UserStatus | undefined)}
          options={STATUSES.map((s) => ({ value: s, label: t(`accounts.status.${s}`) }))} />
        {hasFilters && <button onClick={() => { setOffice(undefined); setRole(undefined); setStatus(undefined); }} className="text-sm text-link hover:underline">{t("accounts.people.clear")}</button>}
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyBox title={t(hasFilters ? "accounts.people.empty_filtered_title" : "accounts.people.empty_title")} body={t(hasFilters ? "accounts.people.empty_filtered_body" : "accounts.people.empty_body")} />
        ) : (
          <>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface md:hidden">
            {rows.map((r) => (
              <li key={r.user.id} className={cn("space-y-2 px-4 py-3 text-sm", r.status === "inactive" && "text-muted-foreground")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium"><span className="whitespace-nowrap">{r.user.full_name}</span>{r.user.is_admin && <AdminTag />}{r.user.id === me.id && <span className="text-xs font-normal text-muted-foreground">{t("profile.you")}</span>}</span>
                    <span className="block break-all text-xs text-muted-foreground">{r.user.email}</span>
                  </div>
                  <UserStatusBadge status={r.status} />
                </div>
                <div className="text-xs text-muted-foreground">{t(`roles.${r.user.role}`)}{r.user.title ? ` · ${r.user.title}` : ""} · {r.place || "—"} · {r.office || (r.user.role === "sm_global" ? t("roles.sm_global") : "—")}</div>
                <PersonActions user={r.user} orgs={orgs} onDeactivate={setDeactivating} onHistory={setHistory} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("accounts.col_person")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("accounts.col_role")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("accounts.col_place")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("accounts.col_office")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("accounts.col_status")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("accounts.col_actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.user.id} className={cn(r.status === "inactive" && "text-muted-foreground")}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium">{r.user.full_name}{r.user.is_admin && <AdminTag />}{r.user.id === me.id && <span className="text-xs font-normal text-muted-foreground">{t("profile.you")}</span>}</span>
                      <span className="block text-xs text-muted-foreground">{r.user.email}</span>
                    </td>
                    <td className="px-3 py-3">{t(`roles.${r.user.role}`)}{r.user.title ? <span className="block text-xs text-muted-foreground">{r.user.title}</span> : null}</td>
                    <td className="px-3 py-3">{r.place || "—"}</td>
                    <td className="px-3 py-3">{r.office || (r.user.role === "sm_global" ? t("roles.sm_global") : "—")}</td>
                    <td className="px-3 py-3"><UserStatusBadge status={r.status} /></td>
                    <td className="px-3 py-3"><PersonActions user={r.user} orgs={orgs} onDeactivate={setDeactivating} onHistory={setHistory} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <InvitePersonDialog open={inviting} onOpenChange={setInviting} />
      <DeactivatePersonDialog user={deactivating} onClose={() => setDeactivating(null)} />
      <AccountHistorySheet user={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function Filter(props: { label: string; value: string | undefined; all: string; options: { value: string; label: string }[]; onChange: (v: string | undefined) => void }) {
  return (
    <Select value={props.value ?? ALL} onValueChange={(v) => props.onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={props.label} className={cn("h-8 w-auto min-w-40 gap-2 bg-surface text-sm", props.value && "border-ring text-foreground")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{props.all}</SelectItem>
        {props.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
