import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBusinesses, useCurrentUser, useDeactivateUser, useInviteUser, useOrganizations, useReactivateUser, useSimulateAcceptance, useUsersWithInactive } from "@/lib/api/hooks";
import type { Organization, User, UserRole } from "@/lib/api/types";
import { canManage, invitableRoles, isActiveFirm, isActiveUser, isFirmAdmin, isOfficeAdmin } from "@/lib/accounts/permissions";
import { accountError, Field, inputCls, linkBtn, primaryBtn, secondaryBtn, selectCls, textareaCls, userStatus } from "./shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Invitar persona". The roles and places offered depend on who invites (see invitableRoles / canInvite):
 * SM Global anyone anywhere; the office admin its team and the first person of a firm; the firm admin its own firm.
 * With `fixedOrganizationId` (Mi equipo) the place is not asked.
 */
export function InvitePersonDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; fixedOrganizationId?: string | undefined; fixedRole?: UserRole | undefined }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const orgs = useOrganizations().data ?? [];
  const businesses = useBusinesses().data ?? [];
  const users = useUsersWithInactive().data ?? [];
  const invite = useInviteUser();
  const roles = useMemo(() => (me ? invitableRoles(me, { orgs, businesses, users }) : []), [me, orgs, businesses, users]);
  const [role, setRole] = useState<UserRole | "">(props.fixedRole ?? "");
  const [place, setPlace] = useState(props.fixedOrganizationId ?? "");
  const [form, setForm] = useState({ full_name: "", email: "", title: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveRole: UserRole | "" = props.fixedRole ?? (roles.length === 1 ? roles[0]! : role);

  const reset = () => { setRole(props.fixedRole ?? ""); setPlace(props.fixedOrganizationId ?? ""); setForm({ full_name: "", email: "", title: "" }); setIsAdmin(false); setError(null); };
  const close = (o: boolean) => { props.onOpenChange(o); if (!o) reset(); };

  // Places the actor may put the person in, for the chosen role.
  const places: { id: string; label: string }[] = useMemo(() => {
    if (!me || !effectiveRole) return [];
    const officeName = (id: string | null | undefined) => orgs.find((o) => o.id === id)?.name ?? "";
    if (effectiveRole === "sm_global") return orgs.filter((o) => o.kind === "sm_global").map((o) => ({ id: o.id, label: o.name }));
    if (effectiveRole === "sm_team") {
      const offices = me.role === "sm_global" ? orgs.filter((o) => o.kind === "sm") : orgs.filter((o) => o.kind === "sm" && o.id === me.organization_id);
      return offices.map((o) => ({ id: o.id, label: o.name }));
    }
    if (effectiveRole === "partner_firm") {
      let firms = orgs.filter((o) => o.kind === "partner_firm" && isActiveFirm(o));
      if (isOfficeAdmin(me)) firms = firms.filter((o) => o.parent_id === me.organization_id && !users.some((u) => u.organization_id === o.id && isActiveUser(u)));
      if (isFirmAdmin(me)) firms = firms.filter((o) => o.id === me.organization_id);
      return firms.map((o) => ({ id: o.id, label: me.role === "sm_global" ? `${o.name} · ${officeName(o.parent_id)}` : o.name }));
    }
    if (effectiveRole === "business_owner") return businesses.map((b) => ({ id: b.id, label: b.name }));
    if (effectiveRole === "franchisee") return orgs.filter((o) => o.kind === "franchise").map((o) => ({ id: o.id, label: o.name }));
    return [];
  }, [me, effectiveRole, orgs, businesses, users]);
  const needsPlace = effectiveRole !== "" && effectiveRole !== "bishop";
  const placeId = props.fixedOrganizationId ?? (places.length === 1 ? places[0]!.id : place);
  // The office admin creates the first person of a firm as its admin; everyone else it invites is not an admin.
  const adminForced = me && isOfficeAdmin(me) ? effectiveRole === "partner_firm" : me?.role !== "sm_global" ? false : null;
  const adminValue = adminForced === null ? isAdmin : adminForced;

  const submit = () => {
    if (!effectiveRole) return setError(t("accounts.invite.err_role"));
    if (!form.full_name.trim()) return setError(t("accounts.invite.err_name"));
    if (!EMAIL.test(form.email.trim())) return setError(t("accounts.invite.err_email"));
    if (needsPlace && !placeId) return setError(t("accounts.invite.err_place"));
    setError(null);
    const isBusiness = effectiveRole === "business_owner";
    invite.mutate(
      {
        full_name: form.full_name.trim(), email: form.email.trim(), role: effectiveRole, title: form.title.trim() || null,
        organization_id: isBusiness || effectiveRole === "bishop" ? null : placeId, business_id: isBusiness ? placeId : null, is_admin: adminValue,
      },
      {
        onSuccess: (u) => { toast.success(t("accounts.invite.t_sent", { name: u.full_name, email: u.email })); close(false); },
        onError: (e) => toast.error(accountError(t, e)),
      },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accounts.invite.title")}</DialogTitle>
          <DialogDescription>{t("accounts.invite.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!props.fixedRole && roles.length > 1 && (
            <Field label={t("accounts.invite.role")}>
              <select value={role} onChange={(e) => { setRole(e.target.value as UserRole); setPlace(""); }} className={selectCls}>
                <option value="">{t("accounts.invite.role_placeholder")}</option>
                {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </select>
            </Field>
          )}
          {needsPlace && !props.fixedOrganizationId && places.length !== 1 && (
            <Field label={t(`accounts.invite.place_${effectiveRole}`)} hint={places.length === 0 ? t("accounts.invite.no_places") : undefined}>
              <select value={place} onChange={(e) => setPlace(e.target.value)} className={selectCls} disabled={places.length === 0}>
                <option value="">{t("accounts.invite.place_placeholder")}</option>
                {places.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
          )}
          <Field label={t("accounts.invite.name")}>
            <input className={inputCls} value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} autoComplete="off" />
          </Field>
          <Field label={t("accounts.invite.email")}>
            <input className={inputCls} type="email" inputMode="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="off" />
          </Field>
          <Field label={t("accounts.invite.title_label")}>
            <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("accounts.invite.title_placeholder")} autoComplete="off" />
          </Field>
          {adminForced === null ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="mt-0.5 h-4 w-4 rounded-[4px] border-input" />
              <span>
                {t("accounts.invite.admin")}
                <span className="block text-xs text-muted-foreground">{t("accounts.invite.admin_hint")}</span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">{t(adminForced ? "accounts.invite.admin_forced_on" : "accounts.invite.admin_forced_off")}</p>
          )}
          {error && <p role="alert" className="text-xs text-status-danger-fg">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={() => close(false)}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={invite.isPending}>{t("accounts.invite.send")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Desactivar persona": the reason is required and stays in the history. */
export function DeactivatePersonDialog(props: { user: User | null; onClose: () => void }) {
  const { t } = useTranslation();
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const u = props.user;
  const submit = () => {
    setTried(true);
    if (!u || !reason.trim()) return;
    deactivate.mutate({ userId: u.id, reason: reason.trim() }, {
      onSuccess: () => {
        toast.success(t("accounts.t_deactivated", { name: u.full_name }), {
          action: { label: t("accounts.undo"), onClick: () => reactivate.mutate(u.id, { onError: (e) => toast.error(accountError(t, e)) }) },
        });
        setReason(""); setTried(false); props.onClose();
      },
      onError: (e) => toast.error(accountError(t, e)),
    });
  };
  return (
    <Dialog open={!!u} onOpenChange={(o) => { if (!o) { setReason(""); setTried(false); props.onClose(); } }}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accounts.deactivate.title", { name: u?.full_name ?? "" })}</DialogTitle>
          <DialogDescription>{t("accounts.deactivate.body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("accounts.deactivate.reason")}>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("accounts.deactivate.placeholder")} className={textareaCls} />
          {tried && !reason.trim() && <span className="text-xs text-status-danger-fg">{t("accounts.deactivate.reason_required")}</span>}
        </Field>
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={props.onClose}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={deactivate.isPending}>{t("accounts.deactivate.confirm")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Row actions for a person: "Simular aceptación" (invited), "Desactivar" (active), "Reactivar" (inactive) and
 * "Historial". Only shown to someone who manages that account (canManage).
 */
export function PersonActions({ user, orgs, onDeactivate, onHistory }: { user: User; orgs: Organization[]; onDeactivate: (u: User) => void; onHistory: (u: User) => void }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const businesses = useBusinesses().data ?? [];
  const users = useUsersWithInactive().data ?? [];
  const accept = useSimulateAcceptance();
  const reactivate = useReactivateUser();
  const deactivate = useDeactivateUser();
  const manages = !!me && canManage(me, user, { orgs, businesses, users }).ok;
  const status = userStatus(user);
  const fail = (e: unknown) => toast.error(accountError(t, e));
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {manages && status === "invited" && (
        <button className={linkBtn} disabled={accept.isPending} onClick={() => accept.mutate(user.id, { onSuccess: () => toast.success(t("accounts.t_accepted", { name: user.full_name })), onError: fail })}>
          {t("accounts.simulate_acceptance")}
        </button>
      )}
      {manages && status !== "inactive" && (
        <button className={linkBtn} onClick={() => onDeactivate(user)}>{t("accounts.deactivate_action")}</button>
      )}
      {manages && status === "inactive" && (
        <button
          className={linkBtn}
          disabled={reactivate.isPending}
          onClick={() =>
            reactivate.mutate(user.id, {
              onSuccess: () =>
                toast.success(t("accounts.t_reactivated", { name: user.full_name }), {
                  action: { label: t("accounts.undo"), onClick: () => deactivate.mutate({ userId: user.id, reason: user.deactivation_reason ?? t("accounts.undo_reason") }, { onError: fail }) },
                }),
              onError: fail,
            })
          }
        >
          {t("accounts.reactivate_action")}
        </button>
      )}
      <button className={linkBtn} onClick={() => onHistory(user)}>{t("accounts.history_action")}</button>
    </div>
  );
}
