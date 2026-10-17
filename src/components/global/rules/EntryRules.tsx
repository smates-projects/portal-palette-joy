import { useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useOrganizations, useRemoveZone, useRoutingRules, useSetDefaultOffice, useSetZone, useUpdateRules } from "@/lib/api/hooks";
import { ASSESSMENT_BLOCKS, type AreaCode, type AssessmentAreaMap, type Organization, type ZoneRule } from "@/lib/api/types";
import type { PlatformRules } from "@/lib/api/network-types";
import { validateZone } from "@/lib/leads/entry";
import { DEFAULT_ASSESSMENT_AREA_MAP } from "@/lib/leads/prevalidation";
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
    <Box title={t("entry.rules.map_title")} hint={t("entry.rules.map_hint")}>
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

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
