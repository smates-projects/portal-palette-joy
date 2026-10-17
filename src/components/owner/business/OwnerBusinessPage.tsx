import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBusinesses, useBusinessProfile, useBusinessTeam, useCurrentUser, useInviteTeamMember, useMakeOwner, useProfileChangeRequests, useRequestProfileChange, useUpdateBusinessProfile } from "@/lib/api/hooks";
import { VERIFIED_PROFILE_FIELDS, type BusinessProfile, type BusinessProfilePatch, type ProfileChangeRequest, type TeamMember, type VerifiedProfileField } from "@/lib/api/types";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { EmptyState, ErrorState, Field, inputCls, LoadingState, PageHeader, Panel, primaryButtonCls, secondaryButtonCls, textareaCls, ToneBadge } from "../shared";
import { OwnerBusinessFile } from "@/components/business/BusinessFile";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mi negocio: the data SM holds about the business (editable), the brand of the portal and the people of the team (invite by email). */
export function OwnerBusinessPage() {
  const { t } = useTranslation();
  const profileQ = useBusinessProfile();
  const teamQ = useBusinessTeam();
  const profile = profileQ.data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.business.question")} />

      {profileQ.isError || teamQ.isError ? (
        <ErrorState onRetry={() => { void profileQ.refetch(); void teamQ.refetch(); }} />
      ) : profileQ.isLoading || teamQ.isLoading ? (
        <LoadingState rows={2} />
      ) : !profile ? (
        <EmptyState title={t("owner_extra.business.empty_title")} hint={t("owner_extra.business.empty_hint")} />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ProfileForm profile={profile} />
          <div className="space-y-4">
            <BrandPanel mode="owner" />
            <TeamPanel team={teamQ.data ?? []} />
          </div>
        </div>
      )}
      <OwnerBusinessFile />
    </div>
  );
}

type ProfileField = keyof BusinessProfilePatch;

/** Profile of the business. Past onboarding the verified fields are read-only: the owner asks SM for a change. */
function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateBusinessProfile();
  const me = useCurrentUser().data;
  const business = useBusinesses().data?.find((b) => b.id === me?.business_id);
  const verified = !!business && business.status !== "onboarding";
  const requestsQ = useProfileChangeRequests();
  const [requesting, setRequesting] = useState<VerifiedProfileField | null>(null);
  const pendingFor = (f: VerifiedProfileField) => requestsQ.data?.find((r) => r.field === f && r.status === "pending");
  const [values, setValues] = useState({
    legal_name: profile.legal_name,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    phone: profile.phone,
    email: profile.email,
    website: profile.website ?? "",
    employees: String(profile.employees),
  });
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});

  const set = (field: ProfileField, value: string) => setValues((v) => ({ ...v, [field]: value }));

  /** The server validates too; this only saves a round trip and tells the owner what to fix. */
  const validate = () => {
    const next: Partial<Record<ProfileField, string>> = {};
    for (const field of ["legal_name", "address", "city", "state", "phone"] as const) {
      if (!values[field].trim()) next[field] = t("owner_extra.business.err_required");
    }
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = t("owner_extra.business.err_email");
    const employees = Number(values.employees);
    if (values.employees.trim() === "" || !Number.isInteger(employees) || employees < 0) next.employees = t("owner_extra.business.err_employees");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const editable: BusinessProfilePatch = {
      phone: values.phone.trim(),
      email: values.email.trim(),
      website: values.website.trim() || null,
      employees: Number(values.employees),
    };
    // Only while entering can the owner still fix the legal data; afterwards SM changes it through a request.
    const patch: BusinessProfilePatch = verified
      ? editable
      : { ...editable, legal_name: values.legal_name.trim(), address: values.address.trim(), city: values.city.trim(), state: values.state.trim() };
    update.mutate(patch, {
      onSuccess: () => toast.success(t("owner_extra.business.t_saved")),
      onError: (e) => toast.error(t(e instanceof Error && e.message === "locked_field" ? "owner_extra.business.t_locked" : "owner_extra.common.t_error")),
    });
  };

  const field = (name: ProfileField, label: string, extra?: { type?: string; inputMode?: "numeric" | "tel" | "email"; autoComplete?: string }) => {
    const locked = verified && (VERIFIED_PROFILE_FIELDS as readonly string[]).includes(name);
    if (locked) {
      const f = name as VerifiedProfileField;
      const pending = pendingFor(f);
      return (
        <Field label={label}>
          <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 basis-40 break-words">{values[name]}</span>
            <span className="shrink-0 rounded-[4px] border border-status-success-border bg-status-success-bg px-1.5 py-0.5 text-[11px] font-medium text-status-success-fg">{t("owner_extra.business.verified")}</span>
            {pending ? (
              <span className="rounded-[4px] border border-status-warning-border bg-status-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-status-warning-fg" title={pending.new_value}>{t("owner_extra.business.status_pending")}</span>
            ) : (
              <button type="button" onClick={() => setRequesting(f)} className="shrink-0 whitespace-nowrap text-xs text-link hover:underline">{t("owner_extra.business.request_change")}</button>
            )}
          </div>
        </Field>
      );
    }
    return (
      <Field label={label}>
        <input
          className={inputCls}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `err-${name}` : undefined}
          {...extra}
        />
        {errors[name] && <span id={`err-${name}`} className="block text-xs text-status-danger-fg">{errors[name]}</span>}
      </Field>
    );
  };

  return (
    <Panel title={t("owner_extra.business.profile_title")} aside={t(verified ? "owner_extra.business.profile_hint_verified" : "owner_extra.business.profile_hint")}>
      {requesting && <RequestChangeDialog field={requesting} current={values[requesting]} onClose={() => setRequesting(null)} />}
      <form onSubmit={submit} noValidate className="space-y-4 border-t border-border p-4">
        {verified && <p className="text-xs text-muted-foreground">{t("owner_extra.business.verified_hint")}</p>}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("owner_extra.business.industry")}</dt>
            <dd className="mt-0.5">{profile.industry}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("owner_extra.business.years")}</dt>
            <dd className="mt-0.5 font-display tabular-nums">{profile.years_operating}</dd>
          </div>
        </dl>
        {field("legal_name", t("owner_extra.business.legal_name"))}
        {field("address", t("owner_extra.business.address"), { autoComplete: "street-address" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("city", t("owner_extra.business.city"))}
          {field("state", t("owner_extra.business.state"))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", t("owner_extra.business.phone"), { type: "tel", inputMode: "tel", autoComplete: "tel" })}
          {field("employees", t("owner_extra.business.employees"), { inputMode: "numeric" })}
        </div>
        {field("email", t("owner_extra.business.email"), { type: "email", inputMode: "email", autoComplete: "email" })}
        {field("website", t("owner_extra.business.website"), { type: "url" })}
        <button type="submit" className={primaryButtonCls} disabled={update.isPending}>
          {update.isPending ? t("owner_extra.common.saving") : t("owner_extra.business.save")}
        </button>
      </form>
      {!!requestsQ.data?.length && (
        <div className="border-t border-border p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("owner_extra.business.pending_title")}</h3>
          <ul className="mt-2 divide-y divide-border text-xs">
            {requestsQ.data.map((r: ProfileChangeRequest) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 first:pt-0">
                <span className="min-w-0 basis-full break-words sm:basis-auto">{t("owner_extra.business.request_line", { field: t(`owner_extra.business.${r.field}`), from: r.current_value, to: r.new_value })}</span>
                <ToneBadge tone={r.status === "pending" ? "warning" : r.status === "applied" ? "success" : "neutral"}>{t(`owner_extra.business.status_${r.status}`)}</ToneBadge>
                <span className="text-muted-foreground">{formatDateTime(r.resolved_at ?? r.created_at, i18n.language)}</span>
                {r.resolution_note && <span className="w-full text-muted-foreground">{r.resolution_note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** "Pedir cambio" of a verified field: new value and reason; SM reviews it with the supporting document. */
function RequestChangeDialog({ field, current, onClose }: { field: VerifiedProfileField; current: string; onClose: () => void }) {
  const { t } = useTranslation();
  const request = useRequestProfileChange();
  const [value, setValue] = useState(current);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!value.trim() || value.trim() === current) return setError(t("owner_extra.business.err_same_value"));
    if (!reason.trim()) return setError(t("owner_extra.business.err_reason"));
    setError(null);
    request.mutate({ field, new_value: value.trim(), reason: reason.trim() }, {
      onSuccess: () => { toast.success(t("owner_extra.business.t_requested")); onClose(); },
      onError: () => toast.error(t("owner_extra.common.t_error")),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("owner_extra.business.request_title")}</DialogTitle>
          <DialogDescription>{t("owner_extra.business.request_body")}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-md border border-border bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">{t("owner_extra.business.request_field")}</dt><dd className="mt-0.5 font-medium">{t(`owner_extra.business.${field}`)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("owner_extra.business.request_current")}</dt><dd className="mt-0.5 break-words">{current}</dd></div>
        </dl>
        <Field label={t("owner_extra.business.request_new_value")}>
          <input autoFocus className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label={t("owner_extra.business.request_reason")}>
          <textarea rows={3} className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("owner_extra.business.request_reason_placeholder")} />
        </Field>
        {error && <p className="text-xs text-status-danger-fg">{error}</p>}
        <DialogFooter>
          <button type="button" className={secondaryButtonCls} onClick={onClose}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryButtonCls} onClick={submit} disabled={request.isPending}>{t("owner_extra.business.request_send")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MEMBER_TONE = { active: "success", invited: "warning", inactive: "neutral" } as const;

function TeamPanel({ team }: { team: TeamMember[] }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const businesses = useBusinesses().data;
  const invite = useInviteTeamMember();
  const makeOwner = useMakeOwner();
  const [form, setForm] = useState({ name: "", role: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const business = businesses?.find((b) => b.id === me?.business_id);
  // Only the owner in charge invites or hands the business over; a team member only sees the list.
  const inCharge = !!me && !!business && business.owner_user_id === me.id;
  const handOver = (m: TeamMember) =>
    makeOwner.mutate(m.id, {
      onSuccess: () => toast.success(t("owner_extra.business.t_made_owner", { name: m.name })),
      onError: (e) => toast.error(t(`owner_extra.business.err_owner_${e instanceof Error ? e.message : "generic"}`, { defaultValue: t("owner_extra.common.t_error") })),
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim()) return setError(t("owner_extra.business.err_invite_required"));
    if (!EMAIL_PATTERN.test(form.email.trim())) return setError(t("owner_extra.business.err_email"));
    setError(null);
    invite.mutate(
      { name: form.name.trim(), role: form.role.trim(), email: form.email.trim() },
      {
        onSuccess: () => {
          toast.success(t("owner_extra.business.t_invited", { email: form.email.trim() }));
          setForm({ name: "", role: "", email: "" });
        },
        onError: () => toast.error(t("owner_extra.common.t_error")),
      },
    );
  };

  return (
    <Panel title={t("owner_extra.business.team_title")} aside={t("owner_extra.business.team_count", { count: team.length })}>
      {team.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.business.team_empty")}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {team.map((m) => {
            const isOwner = !!business && m.user_id === business.owner_user_id;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.name}{isOwner && <span className="ml-2 rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{t("owner_extra.business.owner_tag")}</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{[m.role, m.email].filter(Boolean).join(" · ")}</p>
                </div>
                <ToneBadge tone={MEMBER_TONE[m.state]}>{t(`owner_extra.business.member_${m.state}`)}</ToneBadge>
                {inCharge && !isOwner && m.user_id && m.state === "active" && (
                  <button type="button" onClick={() => handOver(m)} disabled={makeOwner.isPending} className="text-xs text-link hover:underline disabled:opacity-50">
                    {t("owner_extra.business.make_owner")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {inCharge && <form onSubmit={submit} noValidate className="space-y-3 border-t border-border p-4">
        <h3 className="text-sm font-semibold">{t("owner_extra.business.invite_title")}</h3>
        <Field label={t("owner_extra.business.invite_name")}>
          <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="off" />
        </Field>
        <Field label={t("owner_extra.business.invite_role")}>
          <input className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder={t("owner_extra.business.invite_role_example")} autoComplete="off" />
        </Field>
        <Field label={t("owner_extra.business.email")}>
          <input className={inputCls} type="email" inputMode="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="off" />
        </Field>
        {error && <p role="alert" className="text-xs text-status-danger-fg">{error}</p>}
        <button type="submit" className={primaryButtonCls} disabled={invite.isPending}>
          {invite.isPending ? t("owner_extra.common.saving") : t("owner_extra.business.invite_send")}
        </button>
      </form>}
      {!inCharge && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{t("owner_extra.business.team_member_note")}</p>}
    </Panel>
  );
}
