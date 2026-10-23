import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AccountEvent, Business, Organization, User, UserStatus } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccountEvents, useUsersWithInactive } from "@/lib/api/hooks";

// Small pieces shared by Personas (SM Global), Equipo (office), Mi equipo (firm) and the owner's team.

export const inputCls =
  "h-9 w-full rounded-[4px] border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
export const selectCls = inputCls;
export const textareaCls =
  "w-full resize-none rounded-[4px] border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
export const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryBtn =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
export const linkBtn = "text-sm text-link hover:underline disabled:cursor-not-allowed disabled:opacity-50";

export const userStatus = (u: Pick<User, "status">): UserStatus => u.status ?? "active";

const STATUS_TONE: Record<UserStatus, string> = {
  invited: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
  active: "border-status-success-border bg-status-success-bg text-status-success-fg",
  inactive: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
};

/** Invitada / Activa / Inactiva, same badge style as task statuses. */
export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none", STATUS_TONE[status])}>
      {t(`accounts.status.${status}`)}
    </span>
  );
}

/** "Administra" tag next to a person who manages its organization. */
export function AdminTag() {
  const { t } = useTranslation();
  return <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{t("accounts.admin_tag")}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string | undefined }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Where a person belongs: the firm, the office, the business or the franchise. */
export function placeOf(u: User, orgs: Organization[], businesses: Business[], t: TFunction): string {
  // The business may be out of the visible list (another office): GET /users also sends its name.
  if (u.role === "business_owner") return businesses.find((b) => b.id === u.business_id)?.name ?? u.business_name ?? "";
  const org = orgs.find((o) => o.id === u.organization_id);
  if (!org) return u.role === "bishop" ? t("roles.bishop") : "";
  // A firm always shows what it does: "Estudio Pérez (abogados)".
  if (org.kind === "partner_firm") return t("owner.firm_label", { name: org.name, what: t(`firmWhat.${org.area ?? "none"}`) });
  return org.name;
}

/** Office a person belongs to (for the office filter and column). */
export function officeNameOf(u: User, orgs: Organization[], businesses: Business[]): string {
  if (u.role === "sm_global") return "";
  if (u.role === "sm_team") return orgs.find((o) => o.id === u.organization_id)?.name ?? "";
  if (u.role === "partner_firm") {
    const firm = orgs.find((o) => o.id === u.organization_id);
    return orgs.find((o) => o.id === firm?.parent_id)?.name ?? "";
  }
  if (u.role === "business_owner") {
    // Without the business in the list, the office GET /users sends for the person.
    const officeId = businesses.find((x) => x.id === u.business_id)?.office_id ?? u.office_id;
    return orgs.find((o) => o.id === officeId)?.name ?? "";
  }
  if (u.role === "franchisee") {
    const unit = orgs.find((o) => o.id === u.organization_id);
    const b = businesses.find((x) => x.id === unit?.franchisor_business_id);
    return orgs.find((o) => o.id === (b?.office_id ?? u.office_id))?.name ?? "";
  }
  return "";
}

/** Account history of one person, in a side sheet. */
export function AccountHistorySheet({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const eventsQ = useAccountEvents(user?.id);
  const usersQ = useUsersWithInactive();
  const name = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");
  const describe = (e: AccountEvent) => t(`accounts.events.${e.kind}`, { actor: name(e.actor_user_id), name: user?.full_name ?? "" });
  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-surface sm:max-w-md">
        <SheetTitle className="text-base font-semibold">{t("accounts.history_title", { name: user?.full_name ?? "" })}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{user?.email}</SheetDescription>
        <div className="mt-4">
          {eventsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : eventsQ.isError ? (
            <p className="text-sm text-status-danger-fg">{t("accounts.errors.generic")}</p>
          ) : !eventsQ.data?.length ? (
            <p className="rounded-[4px] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("accounts.history_empty")}</p>
          ) : (
            <ol className="divide-y divide-border rounded-[4px] border border-border">
              {eventsQ.data.map((e) => (
                <li key={e.id} className="px-3 py-2.5 text-sm">
                  <p>{describe(e)}</p>
                  {e.body && <p className="mt-1 rounded-[4px] border border-border bg-muted/50 px-2 py-1 text-xs">{e.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(e.created_at, i18n.language)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
