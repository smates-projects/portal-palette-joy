import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateFirm, useDeactivateFirm, useFirmEvents, useOrganizations, useReplaceFirm, useUpdateFirm, useUsersWithInactive } from "@/lib/api/hooks";
import type { AreaCode, CreateFirmInput, FirmEvent, OpenTasksPolicy, Organization } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { AREAS } from "@/lib/tasks/owner";
import { accountError, Field, inputCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from "@/components/accounts/shared";
import { firmName } from "./shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = { kind: "create"; area: AreaCode | null; officeId: string | null } | { kind: "edit"; firm: Organization } | { kind: "replace"; firm: Organization; openTasks: number };

/**
 * "Nueva firma" (name, area, own team or not, contact and the first person), "Editar firma" (contact data) and
 * "Reemplazar firma" (the new firm plus what happens with the open tasks of the old one).
 */
export function FirmFormDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateFirm();
  const update = useUpdateFirm();
  const replace = useReplaceFirm();
  const firm = mode.kind === "edit" || mode.kind === "replace" ? mode.firm : null;
  const [form, setForm] = useState({
    name: mode.kind === "edit" ? mode.firm.name : "",
    area: (mode.kind === "create" ? mode.area : mode.firm.area) ?? "",
    internal: mode.kind === "edit" ? !!mode.firm.internal : false,
    specialty: mode.kind === "edit" ? mode.firm.specialty ?? "" : "",
    contact_name: mode.kind === "edit" ? mode.firm.contact_name ?? "" : "",
    email: mode.kind === "edit" ? mode.firm.email ?? "" : "",
    phone: mode.kind === "edit" ? mode.firm.phone ?? "" : "",
    city: mode.kind === "edit" ? mode.firm.city ?? "" : "",
    person_name: "",
    person_email: "",
    person_title: "",
  });
  const [policy, setPolicy] = useState<OpenTasksPolicy>("transfer");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const pending = create.isPending || update.isPending || replace.isPending;
  const fail = (e: unknown) => toast.error(accountError(t, e));

  const submit = () => {
    if (!form.name.trim()) return setError(t("office.firms.err_name"));
    if (!form.contact_name.trim()) return setError(t("office.firms.err_contact"));
    if (!EMAIL.test(form.email.trim())) return setError(t("office.firms.err_email"));
    if (mode.kind === "edit") {
      setError(null);
      return update.mutate(
        { id: mode.firm.id, patch: { name: form.name, specialty: form.specialty, contact_name: form.contact_name, email: form.email, phone: form.phone, city: form.city } },
        { onSuccess: () => { toast.success(t("office.firms.t_edited", { name: form.name.trim() })); onClose(); }, onError: fail },
      );
    }
    if (!form.area) return setError(t("office.firms.err_area"));
    if (!form.person_name.trim()) return setError(t("office.firms.err_person"));
    if (!EMAIL.test(form.person_email.trim())) return setError(t("office.firms.err_person_email"));
    setError(null);
    const input: CreateFirmInput = {
      office_id: mode.kind === "create" ? mode.officeId : null,
      name: form.name, area: form.area as AreaCode, internal: form.internal, specialty: form.specialty || null, contact_name: form.contact_name,
      email: form.email, phone: form.phone || null, city: form.city || null,
      first_person: { full_name: form.person_name, email: form.person_email, title: form.person_title || null },
    };
    if (mode.kind === "create")
      return create.mutate(input, { onSuccess: (o) => { toast.success(t("office.firms.t_created", { name: o.name, person: form.person_name.trim() })); onClose(); }, onError: fail });
    replace.mutate({ id: mode.firm.id, input, openTasks: policy }, {
      onSuccess: (o) => { toast.success(t(policy === "transfer" ? "office.firms.t_replaced_transfer" : "office.firms.t_replaced_keep", { name: o.name, old: mode.firm.name, count: mode.openTasks })); onClose(); },
      onError: fail,
    });
  };

  const title = mode.kind === "create" ? t("office.firms.new_title") : mode.kind === "edit" ? t("office.firms.edit_title", { name: firm?.name }) : t("office.firms.replace_title", { name: firm?.name });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(`office.firms.${mode.kind}_body`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("office.firms.name")}>
              <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("office.firms.area")}>
              <select className={selectCls} value={form.area} onChange={(e) => set("area", e.target.value)} disabled={mode.kind !== "create" || !!mode.area}>
                <option value="">{t("office.firms.area_placeholder")}</option>
                {AREAS.map((a) => <option key={a} value={a}>{a} · {t(`areas.${a}`)}</option>)}
              </select>
            </Field>
          </div>
          {mode.kind !== "edit" && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.internal} onChange={(e) => set("internal", e.target.checked)} className="mt-0.5 h-4 w-4 rounded-[4px] border-input" />
              <span>{t("office.firms.internal")}<span className="block text-xs text-muted-foreground">{t("office.firms.internal_hint")}</span></span>
            </label>
          )}
          <Field label={t("office.firms.specialty")}>
            <input className={inputCls} value={form.specialty} onChange={(e) => set("specialty", e.target.value)} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("office.firms.contact_name")}>
              <input className={inputCls} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("office.firms.email")}>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("office.firms.phone")}>
              <input className={inputCls} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("office.firms.city")}>
              <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" />
            </Field>
          </div>
          {mode.kind !== "edit" && (
            <fieldset className="rounded-[4px] border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t("office.firms.first_person")}</legend>
              <p className="text-xs text-muted-foreground">{t("office.firms.first_person_hint")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t("office.firms.person_name")}>
                  <input className={inputCls} value={form.person_name} onChange={(e) => set("person_name", e.target.value)} autoComplete="off" />
                </Field>
                <Field label={t("office.firms.person_email")}>
                  <input className={inputCls} type="email" value={form.person_email} onChange={(e) => set("person_email", e.target.value)} autoComplete="off" />
                </Field>
                <Field label={t("office.firms.person_title")}>
                  <input className={inputCls} value={form.person_title} onChange={(e) => set("person_title", e.target.value)} autoComplete="off" />
                </Field>
              </div>
            </fieldset>
          )}
          {mode.kind === "replace" && (
            <fieldset className="rounded-[4px] border border-border p-3">
              <legend className="px-1 text-sm font-medium">{t("office.firms.open_tasks_title", { count: mode.openTasks })}</legend>
              {mode.openTasks === 0 ? (
                <p className="text-xs text-muted-foreground">{t("office.firms.open_tasks_none")}</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {(["transfer", "keep"] as const).map((p) => (
                    <label key={p} className="flex items-start gap-2">
                      <input type="radio" name="open-tasks" checked={policy === p} onChange={() => setPolicy(p)} className="mt-1" />
                      <span>{t(`office.firms.open_tasks_${p}`)}<span className="block text-xs text-muted-foreground">{t(`office.firms.open_tasks_${p}_hint`)}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          {error && <p role="alert" className="text-xs text-status-danger-fg">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={pending}>{t(`office.firms.${mode.kind}_confirm`)}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Dar de baja": the firm becomes inactive with a reason; the area shows "Sin firma". */
export function DeactivateFirmDialog({ firm, onClose }: { firm: Organization; onClose: () => void }) {
  const { t } = useTranslation();
  const deactivate = useDeactivateFirm();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const submit = () => {
    setTried(true);
    if (!reason.trim()) return;
    deactivate.mutate({ id: firm.id, reason: reason.trim() }, {
      onSuccess: () => { toast.success(t("office.firms.t_deactivated", { name: firm.name })); onClose(); },
      onError: (e) => toast.error(accountError(t, e)),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("office.firms.deactivate_title", { name: firm.name })}</DialogTitle>
          <DialogDescription>{t("office.firms.deactivate_body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("office.firms.deactivate_reason")}>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          {tried && !reason.trim() && <span className="text-xs text-status-danger-fg">{t("office.firms.reason_required")}</span>}
        </Field>
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={deactivate.isPending}>{t("office.firms.deactivate_confirm")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** History of a firm: created, edited, replaced, took over, retired. */
export function FirmHistorySheet({ firm, onClose }: { firm: Organization | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const eventsQ = useFirmEvents(firm?.id);
  const usersQ = useUsersWithInactive();
  const orgsQ = useOrganizations();
  const name = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");
  const other = (id: string | null) => (id ? orgsQ.data?.find((o) => o.id === id)?.name ?? "" : "");
  const describe = (e: FirmEvent) =>
    t(`office.firms.events.${e.kind}`, { actor: name(e.actor_user_id), other: other(e.other_organization_id), count: e.moved_tasks ?? 0, fields: e.body ?? "" });
  return (
    <Sheet open={!!firm} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-surface sm:max-w-md">
        <SheetTitle className="text-base font-semibold">{t("office.firms.history_title", { name: firm ? firmName(t, firm) : "" })}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{firm?.email}</SheetDescription>
        <div className="mt-4">
          {eventsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !eventsQ.data?.length ? (
            <p className="rounded-[4px] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("office.firms.history_empty")}</p>
          ) : (
            <ol className="divide-y divide-border rounded-[4px] border border-border">
              {eventsQ.data.map((e) => (
                <li key={e.id} className="px-3 py-2.5 text-sm">
                  <p>{describe(e)}</p>
                  {e.kind === "deactivated" && e.body && <p className="mt-1 rounded-[4px] border border-border bg-muted/50 px-2 py-1 text-xs">{e.body}</p>}
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
