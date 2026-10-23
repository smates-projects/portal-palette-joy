import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOrganizations, useRemoveZone, useRoutingRules, useSetDefaultOffice, useSetZone, useUpdateRules } from "@/lib/api/hooks";
import { ASSESSMENT_BLOCKS, type AreaCode, type AssessmentAreaMap, type Organization, type ZoneRule } from "@/lib/api/types";
import type { PlatformRules } from "@/lib/api/network-types";
import { validateZone } from "@/lib/leads/entry";
import { entryRules } from "@/lib/leads/entry-flow";
import { eligibilityRules } from "@/lib/leads/readiness";
import { DEFAULT_ASSESSMENT_AREA_MAP } from "@/lib/leads/prevalidation";
import { formatUsd } from "@/lib/format";
import { AREAS } from "@/lib/tasks/owner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";

const inputCls = "h-9 rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

/** "Miami, FL" or "FL (todo el estado)". */
export const zoneLabel = (t: TFunction, z: Pick<ZoneRule, "state" | "city">) =>
  z.city ? t("entry.rules.city_state", { city: z.city, state: z.state }) : t("entry.rules.whole_state", { state: z.state });

/**
 * Zonas: which office gets a new lead. SM Global edits it (Reglas); an office reads it (Configuración) with
 * `readOnly`, its own zones first.
 */
export function ZonesSection({ readOnly = false, officeId }: { readOnly?: boolean; officeId?: string | undefined }) {
  const { t } = useTranslation();
  const q = useRoutingRules();
  const orgsQ = useOrganizations();
  const setZone = useSetZone();
  const removeZone = useRemoveZone();
  const setDefault = useSetDefaultOffice();
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [office, setOffice] = useState("");
  const [tried, setTried] = useState(false);
  const offices: Organization[] = (orgsQ.data ?? []).filter((o) => o.kind === "sm");
  const officeName = (id: string) => offices.find((o) => o.id === id)?.name ?? "";
  const fail = () => toast.error(t("global.t_error"));

  if (q.isError) return <Box title={t("entry.rules.zones_title")}><button onClick={() => void q.refetch()} className="text-sm text-link hover:underline">{t("global.retry")}</button></Box>;
  if (q.isLoading || !q.data) return <Box title={t("entry.rules.zones_title")}><Skeleton className="h-24" /></Box>;
  const rules = q.data;
  const zones = [...rules.zones].sort((a, b) =>
    (officeId ? Number(b.office_id === officeId) - Number(a.office_id === officeId) : 0) || a.state.localeCompare(b.state) || (a.city ?? "").localeCompare(b.city ?? ""));
  const chosenOffice = office || rules.default_office_id;
  const error = tried ? validateZone(rules, { state, city: city.trim() || null }) : null;

  const add = () => {
    setTried(true);
    if (validateZone(rules, { state, city: city.trim() || null })) return;
    setZone.mutate({ state, city: city.trim() || null, office_id: chosenOffice }, {
      onSuccess: (z) => {
        setState(""); setCity(""); setTried(false);
        toast.success(t("entry.rules.t_added", { zone: zoneLabel(t, z), office: officeName(z.office_id) }), {
          action: { label: t("global.undo"), onClick: () => removeZone.mutate(z.id, { onError: fail }) },
        });
      },
      onError: fail,
    });
  };
  const remove = (z: ZoneRule) =>
    removeZone.mutate(z.id, {
      onSuccess: () => toast.success(t("entry.rules.t_removed", { zone: zoneLabel(t, z) }), {
        action: { label: t("global.undo"), onClick: () => setZone.mutate({ state: z.state, city: z.city, office_id: z.office_id }, { onError: fail }) },
      }),
      onError: fail,
    });
  const changeOffice = (z: ZoneRule, officeId: string) =>
    setZone.mutate({ ...z, office_id: officeId }, {
      onSuccess: () => toast.success(t("entry.rules.t_zone_office", { zone: zoneLabel(t, z), office: officeName(officeId) }), {
        action: { label: t("global.undo"), onClick: () => setZone.mutate(z, { onError: fail }) },
      }),
      onError: fail,
    });
  const changeDefault = (officeId: string) => {
    const prev = rules.default_office_id;
    setDefault.mutate(officeId, {
      onSuccess: () => toast.success(t("entry.rules.t_default", { office: officeName(officeId) }), {
        action: { label: t("global.undo"), onClick: () => setDefault.mutate(prev, { onError: fail }) },
      }),
      onError: fail,
    });
  };

  /** Render helper (not a component), so the Select is not remounted on every render. */
  const officeSelect = (value: string, onChange: (v: string) => void, label: string) =>
    readOnly ? (
      <span className={cn(officeId && value === officeId && "font-medium")}>{officeName(value)}</span>
    ) : (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-8 w-48 bg-surface text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>{offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
    );

  return (
    <Box title={t(readOnly ? "entry.rules.zones_title_office" : "entry.rules.zones_title")} hint={t("entry.rules.zones_hint")}>
      {readOnly && <p className="mb-3 rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("entry.rules.read_only")}</p>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("entry.rules.col_zone")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("entry.rules.col_office")}</th>
              {!readOnly && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {zones.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">{t("entry.rules.empty")}</td></tr>
            ) : zones.map((z) => (
              <tr key={z.id}>
                <td className="px-3 py-2">{zoneLabel(t, z)}</td>
                <td className="px-3 py-2">{officeSelect(z.office_id, (v) => changeOffice(z, v), t("entry.rules.col_office"))}</td>
                {!readOnly && <td className="px-3 py-2 text-right"><button onClick={() => remove(z)} className="text-xs text-link hover:underline">{t("entry.rules.remove")}</button></td>}
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td className="px-3 py-2 font-medium">{t("entry.rules.default_office")}</td>
              <td className="px-3 py-2">{officeSelect(rules.default_office_id, changeDefault, t("entry.rules.default_office"))}</td>
              {!readOnly && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("entry.rules.state")}</span>
            <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="FL" className={cn(inputCls, "w-20", error === "state" && "border-status-danger-fg")} />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("entry.rules.city")}</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("entry.rules.city_placeholder")} className={cn(inputCls, "w-44")} />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block text-muted-foreground">{t("entry.rules.office")}</span>
            {officeSelect(chosenOffice, setOffice, t("entry.rules.office"))}
          </label>
          <PrimaryButton onClick={add} disabled={setZone.isPending}>{t("entry.rules.add")}</PrimaryButton>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-status-danger-fg">{t(`entry.rules.err_${error}`)}</p>}
    </Box>
  );
}

/** SM Global: block of the assessment → areas whose tasks start as "A validar" when the block is strong. */
export function AssessmentMapEditor({ rules }: { rules: PlatformRules }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const saved = rules.assessment_area_map ?? DEFAULT_ASSESSMENT_AREA_MAP;
  const programDays = rules.program_length_days ?? "…";
  const [map, setMap] = useState<AssessmentAreaMap>(saved);
  const dirty = JSON.stringify(map) !== JSON.stringify(saved);
  const toggle = (block: keyof AssessmentAreaMap, area: AreaCode) =>
    setMap((m) => ({ ...m, [block]: m[block].includes(area) ? m[block].filter((a) => a !== area) : [...m[block], area].sort() }));
  const save = () =>
    update.mutate({ patch: { assessment_area_map: map } }, {
      onSuccess: () => toast.success(t("entry.rules.t_map_saved"), {
        action: { label: t("global.undo"), onClick: () => update.mutate({ patch: { assessment_area_map: saved } }) },
      }),
      onError: () => toast.error(t("global.t_error")),
    });
  return (
    <Box title={t("entry.rules.map_title")} hint={t("entry.rules.map_hint", { days: programDays })}>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("entry.rules.col_block")}</th>
              {AREAS.map((a) => <th key={a} className="px-2 py-2 text-center font-display font-medium" title={t(`areas.${a}`)}>{a}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ASSESSMENT_BLOCKS.map((b) => (
              <tr key={b}>
                <td className="px-3 py-2">{t(`pipeline.blocks.${b}`)}</td>
                {AREAS.map((a) => (
                  <td key={a} className="px-2 py-2 text-center">
                    <input type="checkbox" checked={map[b].includes(a)} onChange={() => toggle(b, a)} aria-label={`${t(`pipeline.blocks.${b}`)} · ${t(`areas.${a}`)}`} className="h-4 w-4 accent-primary" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={save} disabled={!dirty || update.isPending}>{t("entry.rules.map_save")}</PrimaryButton>
      </div>
    </Box>
  );
}

/**
 * SM Global: the revised entry. Who sees an approved business (only the Bishops SM presents it to, or every Bishop),
 * the waiting days of the Operating Agreement, whether it needs the expansion meeting, and whether the NDA and the
 * MOU go out already signed by Strategic Mates.
 */
export function EntryFlowRules({ rules }: { rules: PlatformRules }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const saved = entryRules(rules);
  const [form, setForm] = useState({ ...saved, oa_waiting_days: String(saved.oa_waiting_days) });
  const days = Number(form.oa_waiting_days);
  // The upper end is the API's read-only limit (limits.oa_waiting_days_max).
  const maxDays = rules.limits?.oa_waiting_days_max;
  const daysOk = form.oa_waiting_days.trim() !== "" && Number.isInteger(days) && days >= 0 && (maxDays === undefined || days <= maxDays);
  const patch: Partial<PlatformRules> = {};
  if (form.opportunity_visibility !== saved.opportunity_visibility) patch.opportunity_visibility = form.opportunity_visibility;
  if (daysOk && days !== saved.oa_waiting_days) patch.oa_waiting_days = days;
  if (form.require_expansion_meeting !== saved.require_expansion_meeting) patch.require_expansion_meeting = form.require_expansion_meeting;
  if (form.nda_auto_signed_by_sm !== saved.nda_auto_signed_by_sm) patch.nda_auto_signed_by_sm = form.nda_auto_signed_by_sm;
  const dirty = Object.keys(patch).length > 0;
  const save = () => {
    const undo: Partial<PlatformRules> = Object.fromEntries(Object.keys(patch).map((k) => [k, saved[k as keyof typeof saved]]));
    update.mutate({ patch }, {
      onSuccess: () => toast.success(t("entry.rules.flow.t_saved"), {
        action: { label: t("global.undo"), onClick: () => update.mutate({ patch: undo }) },
      }),
      onError: () => toast.error(t("global.t_error")),
    });
  };
  return (
    <Box title={t("entry.rules.flow.title")} hint={t("entry.rules.flow.hint")}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("entry.rules.flow.visibility")}</legend>
        {(["presented", "all"] as const).map((v) => (
          <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-[4px] border p-3 text-sm", form.opportunity_visibility === v ? "border-primary" : "border-border")}>
            <input type="radio" name="opportunity_visibility" className="mt-0.5 h-4 w-4 accent-primary" checked={form.opportunity_visibility === v}
              onChange={() => setForm((f) => ({ ...f, opportunity_visibility: v }))} />
            <span>
              <span className="block font-medium">{t(`entry.rules.flow.visibility_${v}`)}</span>
              <span className="block text-muted-foreground">{t(`entry.rules.flow.visibility_${v}_hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block space-y-1 text-sm">
        <span className="block font-medium">{t("entry.rules.flow.waiting_days")}</span>
        <input inputMode="numeric" value={form.oa_waiting_days} onChange={(e) => setForm((f) => ({ ...f, oa_waiting_days: e.target.value }))}
          className={cn(inputCls, "w-24", !daysOk && "border-status-danger-fg")} aria-invalid={!daysOk} />
        <span className="block text-xs text-muted-foreground">{t("entry.rules.flow.waiting_days_hint")}</span>
        {!daysOk && <span className="block text-xs text-status-danger-fg">{t("entry.rules.flow.waiting_days_error", { max: maxDays ?? "…" })}</span>}
      </label>
      {(["require_expansion_meeting", "nda_auto_signed_by_sm"] as const).map((k) => (
        <label key={k} className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
          <span>
            <span className="block font-medium">{t(`entry.rules.flow.${k}`)}</span>
            <span className="block text-muted-foreground">{t(`entry.rules.flow.${k}_hint`)}</span>
          </span>
        </label>
      ))}
      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={save} disabled={!dirty || !daysOk || update.isPending}>{t("entry.rules.flow.save")}</PrimaryButton>
      </div>
    </Box>
  );
}

/**
 * SM Global: who can enter the program. The three fields of the rule travel together (the API requires them): the
 * least years operating, whether the owner must be Hispanic, and the declared annual revenue of the assessment.
 */
export function EligibilityRulesSection({ rules }: { rules: PlatformRules }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateRules();
  const saved = eligibilityRules(rules);
  const [amount, setAmount] = useState(String(saved.min_annual_revenue));
  const [years, setYears] = useState(String(saved.min_years_operating));
  const [hispanic, setHispanic] = useState(saved.require_hispanic_owner);
  const parsed = Number(amount.replace(/[,\s]/g, ""));
  const parsedYears = Number(years);
  const ok = amount.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;
  const yearsOk = years.trim() !== "" && Number.isInteger(parsedYears) && parsedYears >= 0 && parsedYears <= 50;
  const next = { min_years_operating: parsedYears, require_hispanic_owner: hispanic, min_annual_revenue: parsed };
  const dirty = ok && yearsOk && (parsed !== saved.min_annual_revenue || parsedYears !== saved.min_years_operating || hispanic !== saved.require_hispanic_owner);
  const save = () => {
    if (!dirty) return;
    update.mutate({ patch: { eligibility: next } }, {
      onSuccess: () => toast.success(t("entry.rules.eligibility.t_saved", { amount: formatUsd(parsed, i18n.language) }), {
        action: { label: t("global.undo"), onClick: () => update.mutate({ patch: { eligibility: saved } }) },
      }),
      onError: () => toast.error(t("global.t_error")),
    });
  };
  return (
    <Box title={t("entry.rules.eligibility.title")} hint={t("entry.rules.eligibility.hint")}>
      {rules.defaults?.includes("eligibility") && <p className="text-xs text-muted-foreground">{t("global.rules.default_value")}</p>}
      <label className="mt-2 block space-y-1 text-sm">
        <span className="block font-medium">{t("entry.rules.eligibility.min_years")}</span>
        <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} aria-label={t("entry.rules.eligibility.min_years")}
          className={cn(inputCls, "w-24 font-display tabular-nums", !yearsOk && "border-status-danger-fg")} aria-invalid={!yearsOk} />
        {!yearsOk && <span className="block text-xs text-status-danger-fg">{t("entry.rules.eligibility.min_years_error")}</span>}
      </label>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={hispanic} onChange={(e) => setHispanic(e.target.checked)} />
        <span className="block font-medium">{t("entry.rules.eligibility.hispanic")}</span>
      </label>
      <label className="mt-3 block space-y-1 text-sm">
        <span className="block font-medium">{t("entry.rules.eligibility.min_revenue")}</span>
        <span className="flex items-center gap-2">
          <span className="font-display">{t("global.rules.currency")}</span>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t("entry.rules.eligibility.min_revenue")}
            className={cn(inputCls, "w-40 font-display tabular-nums", !ok && "border-status-danger-fg")} aria-invalid={!ok} />
        </span>
        <span className="block text-xs text-muted-foreground">{t("entry.rules.eligibility.min_revenue_hint")}</span>
        {!ok && <span className="block text-xs text-status-danger-fg">{t("entry.rules.eligibility.min_revenue_error")}</span>}
      </label>
      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={save} disabled={!dirty || update.isPending}>{t("entry.rules.eligibility.save")}</PrimaryButton>
      </div>
    </Box>
  );
}

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
