import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { useCatalogAdmin, useRules, useRulesHistory, useUpdateRules, useUsers } from "@/lib/api/hooks";
import type { IntakeDocRule, MeetingHours, PlatformRules, RulesField } from "@/lib/api/network-types";
import { IntakeDocsEditor, IntakeTextsEditor } from "./IntakeDocsEditor";
import { MeetingHoursRules, zoneKey } from "./MeetingHoursRules";
import { AssessmentMapEditor, EligibilityRulesSection, EntryFlowRules, ZonesSection } from "./EntryRules";
import { ContractRulesSection, GoverningLanguageSection, SmEntitiesSection } from "./ContractRulesSection";
import type { EligibilityRules, SmEntities } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";
import { ErrorBox, GlobalHeader, HistoryList, type HistoryEntry } from "../shared";
import { formFromRules, rulesPatch, toggleCode, undoPatch, validateRules, type RulesForm } from "./form";

const inputCls =
  "h-9 w-32 rounded-md border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

/** Reglas de toda la red: only SM Global edits them. Offices and businesses only read them. */
export function RulesPage() {
  const { t, i18n } = useTranslation();
  const rulesQ = useRules();
  const historyQ = useRulesHistory();
  const catalogQ = useCatalogAdmin();
  const usersQ = useUsers();
  const header = <GlobalHeader question={t("global.rules.question")} />;

  if (rulesQ.isError || catalogQ.isError)
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => { void rulesQ.refetch(); void catalogQ.refetch(); }} /></div>
      </div>
    );
  if (rulesQ.isLoading || catalogQ.isLoading || !rulesQ.data)
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        {header}
        <Skeleton className="mt-6 h-12 rounded-md" />
        <div className="mt-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}</div>
      </div>
    );

  const authorName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const show = (field: keyof PlatformRules, value: unknown) =>
    // Revised entry: absent before SM Global set it (the default applied).
    value === undefined || value === null
      ? t("entry.rules.flow.default_value")
      : field === "meeting_hours"
      ? (() => {
          const h = value as MeetingHours;
          return t("calendar.rules.value", { start: h.start, end: h.end, zone: t(`calendar.rules.zones.${zoneKey(h.timezone)}`, { defaultValue: h.timezone }) });
        })()
      : field === "opportunity_visibility"
      ? t(`entry.rules.flow.visibility_${String(value)}`)
      : field === "require_expansion_meeting" || field === "nda_auto_signed_by_sm"
      ? t(value ? "entry.rules.flow.yes" : "entry.rules.flow.no")
      : field === "oa_waiting_days"
      ? t("global.rules.days", { count: Number(value) })
      : field === "assessment_area_map"
      ? t("entry.rules.map_history")
      : field === "eligibility"
      ? formatUsd(Number((value as EligibilityRules).min_annual_revenue), i18n.language)
      : field === "intake_help_text"
      ? String(value)
      : field === "sm_entities"
      ? t("entry_contracts.entities.value", { corporate: (value as SmEntities).corporate.name, sm_square: (value as SmEntities).sm_square.name })
      : field === "contracts"
      ? t(`contracts_lang.rules.option_${(value as { governing_language?: string } | null)?.governing_language === "es" ? "es" : "en"}`)
      : field === "program_amount"
      ? formatUsd(Number(value), i18n.language)
      : field === "intake_documents"
      ? t("intake.rules.count", { count: (value as IntakeDocRule[]).filter((d) => !d.archived).length })
      : field === "document_review_days"
        ? t("global.rules.days", { count: Number(value) })
        : Array.isArray(value)
      ? value.length ? value.join(", ") : t("global.rules.required_none")
      : field === "franchisability_goal"
        ? t("global.rules.percent", { value })
        : field === "area_amber_days"
          ? t("global.rules.days", { count: Number(value) })
          : t("global.rules.points", { count: Number(value) });
  const entries: HistoryEntry[] = (historyQ.data ?? []).map((c) => ({
    id: c.id,
    when: c.created_at,
    author: authorName(c.actor_user_id),
    title: t("global.rules.history_title"),
    lines: c.changes.map((x) => t("global.history.change", { field: t(`global.rules.fields.${x.field}`), from: show(x.field, x.from), to: show(x.field, x.to) })),
    note: c.note,
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {header}
      <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">{t("global.rules.notice")}</p>
      {/* Re-keyed by the stored rules so the form starts from what was just saved. */}
      <RulesEditor key={JSON.stringify(rulesQ.data)} rules={rulesQ.data} catalog={catalogQ.data ?? []} />
      <IntakeDocsEditor key={`docs-${JSON.stringify(rulesQ.data.intake_documents)}`} rules={rulesQ.data} />
      <IntakeTextsEditor key={`texts-${rulesQ.data.intake_help_text ?? ""}`} rules={rulesQ.data} />
      {/* Who can enter: the declared annual revenue (the year of operation is a hard rule of the assessment). */}
      <Explained text={t("global.rules.explain.eligibility")}>
        <EligibilityRulesSection key={`eligibility-${JSON.stringify(rulesQ.data.eligibility ?? null)}`} rules={rulesQ.data} />
      </Explained>
      {/* Configurable entry contracts: the companies Strategic Mates signs with, then the contracts themselves. */}
      <Explained text={t("global.rules.explain.contracts")}>
        <SmEntitiesSection key={`entities-${JSON.stringify(rulesQ.data.sm_entities ?? null)}`} rules={rulesQ.data} />
        <GoverningLanguageSection rules={rulesQ.data} />
        <ContractRulesSection />
      </Explained>
      <Explained text={t("global.rules.explain.hours")}>
        <MeetingHoursRules key={`hours-${JSON.stringify(rulesQ.data.meeting_hours ?? null)}`} rules={rulesQ.data} />
      </Explained>
      <Explained text={t("global.rules.explain.zones")}>
        <ZonesSection />
      </Explained>
      {/*
        Expert-only blocks, collapsed so Marilyn's everyday rules stay in view: what the business already has (the
        assessment block × area grid) and the fine settings of the entry flow. Each keeps its one-line explanation.
      */}
      <details className="group mt-6 rounded-[4px] border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-semibold">{t("global.rules.advanced_title")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t("global.rules.advanced_hint")}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-border px-4 pb-4">
          <Explained text={t("global.rules.explain.areas", { days: rulesQ.data.program_length_days ?? "…" })}>
            <AssessmentMapEditor key={`map-${JSON.stringify(rulesQ.data.assessment_area_map)}`} rules={rulesQ.data} />
          </Explained>
          <Explained text={t("global.rules.explain.flow")}>
            <EntryFlowRules key={`flow-${rulesQ.data.opportunity_visibility}-${rulesQ.data.oa_waiting_days}-${rulesQ.data.require_expansion_meeting}-${rulesQ.data.nda_auto_signed_by_sm}`} rules={rulesQ.data} />
          </Explained>
        </div>
      </details>
      {historyQ.isError ? (
        <div className="mt-6"><ErrorBox onRetry={() => void historyQ.refetch()} /></div>
      ) : (
        <HistoryList title={t("global.rules.history_heading")} entries={entries} empty={t("global.rules.history_empty")} />
      )}
    </div>
  );
}

/** Tag of a rule still at its default value (GET /rules `defaults`). */
export function DefaultTag() {
  const { t } = useTranslation();
  return <span className="rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{t("global.rules.default_value")}</span>;
}

/** One sentence above a block of Reglas, in Marilyn's words: what the block decides. */
function Explained({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 [&>section:first-of-type]:mt-2">
      <p className="text-sm text-foreground">{text}</p>
      {children}
    </div>
  );
}

function RulesEditor({ rules, catalog }: { rules: PlatformRules; catalog: { code: string; name: string; archived: boolean }[] }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const [form, setForm] = useState<RulesForm>(formFromRules(rules));
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [tried, setTried] = useState(false);

  const errors = tried ? validateRules(form) : {};
  const patch = Object.keys(validateRules(form)).length === 0 ? rulesPatch(rules, form) : {};
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromRules(rules));
  const setField = (key: "franchisability_goal" | "area_amber_days" | "franchisability_amber_tolerance" | "document_review_days" | "program_amount", value: string) => setForm((f) => ({ ...f, [key]: value }));
  const err = (key: keyof typeof errors) => (errors[key] ? t(`global.rules.error_${errors[key]}`) : null);

  const needle = search.trim().toLowerCase();
  const choices = catalog.filter((c) => !c.archived && (!needle || c.code.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle)));
  const nameOf = (code: string) => catalog.find((c) => c.code === code);
  /** "Valor por defecto" next to a rule SM Global never changed (the API's `defaults`). */
  const def = (field: RulesField) => (rules.defaults?.includes(field) ? <DefaultTag /> : null);

  const save = () => {
    setTried(true);
    if (Object.keys(validateRules(form)).length > 0) return;
    if (Object.keys(patch).length === 0) return;
    update.mutate({ patch, note: note.trim() || null }, {
      onSuccess: () => {
        toast.success(t("global.rules.t_saved"), {
          action: { label: t("global.undo"), onClick: () => update.mutate({ patch: undoPatch(rules, patch) }, { onError: () => toast.error(t("global.t_error")) }) },
        });
      },
      onError: () => toast.error(t("global.t_error")),
    });
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Program amount the Bishop pays SM (applies to tripartite contracts signed from now on) */}
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{t("global.rules.amount_title")}{def("program_amount")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("global.rules.amount_hint")}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="font-display">{t("global.rules.currency")}</span>
          <input inputMode="numeric" value={form.program_amount} onChange={(e) => setField("program_amount", e.target.value)} aria-label={t("global.rules.amount_title")} className={cn(inputCls, "w-40 font-display tabular-nums", errors.program_amount && "border-status-danger-fg")} />
        </label>
        {err("program_amount") && <p className="mt-1 text-xs text-status-danger-fg">{err("program_amount")}</p>}
      </section>

      {/* Document review deadline */}
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{t("intake.rules.days_title")}{def("document_review_days")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("intake.rules.days_hint")}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="number" min={1} value={form.document_review_days} onChange={(e) => setField("document_review_days", e.target.value)} aria-label={t("intake.rules.days_title")} className={cn(inputCls, errors.document_review_days && "border-status-danger-fg")} />
          <span>{t("global.rules.days_unit", { count: Number(form.document_review_days) || 0 })}</span>
        </label>
        {err("document_review_days") && <p className="mt-1 text-xs text-status-danger-fg">{err("document_review_days")}</p>}
      </section>

      {/* Franchisability goal */}
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{t("global.rules.goal_title")}{def("franchisability_goal")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("global.rules.goal_hint")}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="number" min={1} max={100} value={form.franchisability_goal} onChange={(e) => setField("franchisability_goal", e.target.value)} aria-label={t("global.rules.goal_title")} className={cn(inputCls, errors.franchisability_goal && "border-status-danger-fg")} />
          <span>{t("global.rules.percent_unit")}</span>
        </label>
        {err("franchisability_goal") && <p className="mt-1 text-xs text-status-danger-fg">{err("franchisability_goal")}</p>}
      </section>

      {/* Required tasks, picked from the catalog (may be empty) */}
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{t("global.rules.required_title")}{def("required_task_codes")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("global.rules.required_hint")}</p>
        {form.required_task_codes.length === 0 ? (
          <p className="mt-3 rounded-[4px] border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{t("global.rules.required_none_hint")}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {form.required_task_codes.map((code) => (
              <li key={code} className="inline-flex items-center gap-2 rounded-[4px] border border-border bg-muted px-2 py-1 text-xs">
                <span><span className="font-display font-semibold">{code}</span> {nameOf(code)?.name}</span>
                <button onClick={() => setForm((f) => ({ ...f, required_task_codes: toggleCode(f.required_task_codes, code) }))} aria-label={t("global.rules.remove", { code })} className="text-link hover:underline">{t("global.rules.remove_short")}</button>
              </li>
            ))}
          </ul>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("office.cat.search")}
          aria-label={t("office.cat.search")}
          className="mt-3 h-8 w-72 rounded-md border border-input bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {choices.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t("global.rules.required_empty_search")}</li>
          ) : (
            choices.map((c) => (
              <li key={c.code}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                  <input type="checkbox" checked={form.required_task_codes.includes(c.code)} onChange={() => setForm((f) => ({ ...f, required_task_codes: toggleCode(f.required_task_codes, c.code) }))} className="h-4 w-4 accent-primary" />
                  <span className="w-12 shrink-0 font-display text-xs font-semibold tabular-nums">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </label>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Traffic lights */}
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{t("global.rules.lights_title")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="rules-days">{t("global.rules.days_title")}{def("area_amber_days")}</label>
            <p className="mt-1 text-xs text-muted-foreground">{t("global.rules.days_hint")}</p>
            <input id="rules-days" type="number" min={1} value={form.area_amber_days} onChange={(e) => setField("area_amber_days", e.target.value)} className={cn(inputCls, "mt-2", errors.area_amber_days && "border-status-danger-fg")} />
            {err("area_amber_days") && <p className="mt-1 text-xs text-status-danger-fg">{err("area_amber_days")}</p>}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="rules-tolerance">{t("global.rules.tolerance_title")}{def("franchisability_amber_tolerance")}</label>
            <p className="mt-1 text-xs text-muted-foreground">{t("global.rules.tolerance_hint")}</p>
            <input id="rules-tolerance" type="number" min={0} max={100} value={form.franchisability_amber_tolerance} onChange={(e) => setField("franchisability_amber_tolerance", e.target.value)} className={cn(inputCls, "mt-2", errors.franchisability_amber_tolerance && "border-status-danger-fg")} />
            {err("franchisability_amber_tolerance") && <p className="mt-1 text-xs text-status-danger-fg">{err("franchisability_amber_tolerance")}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <label className="block text-sm font-medium" htmlFor="rules-note">{t("global.rules.note")}</label>
        <input id="rules-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("global.rules.note_placeholder")} className="mt-2 h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        <div className="mt-4 flex items-center gap-3">
          <PrimaryButton onClick={save} disabled={update.isPending || !dirty}>{t("global.save_changes")}</PrimaryButton>
          {!dirty && <span className="text-xs text-muted-foreground">{t("global.rules.no_changes")}</span>}
        </div>
      </section>
    </div>
  );
}
