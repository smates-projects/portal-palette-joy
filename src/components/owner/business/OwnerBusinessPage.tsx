import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBusinessProfile, useBusinessTeam, useInviteTeamMember, useUpdateBusinessProfile } from "@/lib/api/hooks";
import type { BusinessProfile, BusinessProfilePatch } from "@/lib/api/types";
import { EmptyState, ErrorState, Field, inputCls, LoadingState, PageHeader, Panel, primaryButtonCls, ToneBadge } from "../shared";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mi negocio: the data SM holds about the business (editable) and the people of the team (invite by email). */
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
          <TeamPanel team={teamQ.data ?? []} />
        </div>
      )}
    </div>
  );
}

type ProfileField = keyof BusinessProfilePatch;

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const { t } = useTranslation();
  const update = useUpdateBusinessProfile();
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
    update.mutate(
      {
        legal_name: values.legal_name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        website: values.website.trim() || null,
        employees: Number(values.employees),
      },
      { onSuccess: () => toast.success(t("owner_extra.business.t_saved")), onError: () => toast.error(t("owner_extra.common.t_error")) },
    );
  };

  const field = (name: ProfileField, label: string, extra?: { type?: string; inputMode?: "numeric" | "tel" | "email"; autoComplete?: string }) => (
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

  return (
    <Panel title={t("owner_extra.business.profile_title")} aside={t("owner_extra.business.profile_hint")}>
      <form onSubmit={submit} noValidate className="space-y-4 border-t border-border p-4">
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
        <div className="grid grid-cols-2 gap-4">
          {field("city", t("owner_extra.business.city"))}
          {field("state", t("owner_extra.business.state"))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("phone", t("owner_extra.business.phone"), { type: "tel", inputMode: "tel", autoComplete: "tel" })}
          {field("employees", t("owner_extra.business.employees"), { inputMode: "numeric" })}
        </div>
        {field("email", t("owner_extra.business.email"), { type: "email", inputMode: "email", autoComplete: "email" })}
        {field("website", t("owner_extra.business.website"), { type: "url" })}
        <button type="submit" className={primaryButtonCls} disabled={update.isPending}>
          {update.isPending ? t("owner_extra.common.saving") : t("owner_extra.business.save")}
        </button>
      </form>
    </Panel>
  );
}

function TeamPanel({ team }: { team: { id: string; name: string; role: string; email: string | null; state: "active" | "invited" }[] }) {
  const { t } = useTranslation();
  const invite = useInviteTeamMember();
  const [form, setForm] = useState({ name: "", role: "", email: "" });
  const [error, setError] = useState<string | null>(null);

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
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[m.role, m.email].filter(Boolean).join(" · ")}</p>
              </div>
              <ToneBadge tone={m.state === "active" ? "success" : "warning"}>{t(`owner_extra.business.member_${m.state}`)}</ToneBadge>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} noValidate className="space-y-3 border-t border-border p-4">
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
      </form>
    </Panel>
  );
}
