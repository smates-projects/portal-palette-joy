import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useAddContractRule, useArchiveContractRule, useContractRules, useContractRulesHistory, useRestoreContractRule, useRules,
  useUpdateContractRule, useUpdateRules, useUsers,
} from "@/lib/api/hooks";
import {
  CONTRACT_TRIGGER_EVENTS, ENTRY_CONTRACT_KINDS, SM_ENTITIES, type ContractParty, type EntryContractKind, type EntryContractRule,
  type EntryContractRuleInput, type EntryContractSigner, type PlatformRules, type SmEntity,
} from "@/lib/api/types";
import {
  CONTRACT_TEMPLATE_PLACEHOLDERS, byPosition, contractSignedTrigger, placeholderToken, ruleError, smEntitiesOf,
} from "@/lib/leads/contract-rules";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrimaryButton, SecondaryButton } from "@/components/tasks/detail/dialogs";
import { HistoryList, type HistoryEntry } from "../shared";
import { blockOptions, blocksText, signersText, whenText } from "./contract-rules-text";

const inputCls = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
const areaCls = "w-full rounded-md border border-input bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";
const linkBtn = "text-xs text-link hover:underline disabled:opacity-50";
const PARTIES: ContractParty[] = ["owner", "bishop", "sm"];

/**
 * SM Global: "Contratos del ingreso". Which contracts every business entering gets, when each one is created (in
 * plain words), who signs it and for which Strategic Mates company, what waits for it, and whether it is active.
 * Add, edit, archive, restore and the history, like the program catalog.
 */
export function ContractRulesSection() {
  const { t } = useTranslation();
  const q = useContractRules();
  const rulesQ = useRules();
  const historyQ = useContractRulesHistory();
  const usersQ = useUsers();
  const archive = useArchiveContractRule();
  const restore = useRestoreContractRule();
  const [editing, setEditing] = useState<EntryContractRule | "new" | null>(null);
  const [archiving, setArchiving] = useState<EntryContractRule | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const box = (children: React.ReactNode) => (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("entry_contracts.rules.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("entry_contracts.rules.hint")}</p>
        </div>
        {q.data && <PrimaryButton onClick={() => setEditing("new")}>{t("entry_contracts.rules.add")}</PrimaryButton>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
  if (q.isError) return box(<button onClick={() => void q.refetch()} className="text-sm text-link hover:underline">{t("global.retry")}</button>);
  if (q.isLoading || !q.data) return box(<Skeleton className="h-32" />);

  const all = [...q.data].sort(byPosition);
  const archived = all.filter((r) => !r.active);
  const shown = showArchived ? all : all.filter((r) => r.active);
  const entities = smEntitiesOf(rulesQ.data);
  const nameOf = (code: string) => all.find((r) => r.code === code)?.name ?? code;
  const fail = (e: unknown) => toast.error(e instanceof Error && e.message === "rule_in_use" ? t("entry_contracts.errors.rule_in_use") : t("global.t_error"));
  const doRestore = (r: EntryContractRule) =>
    restore.mutate(r.code, { onSuccess: () => toast.success(t("entry_contracts.rules.t_restored", { name: r.name })), onError: fail });

  const authorName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const entries: HistoryEntry[] = (historyQ.data ?? []).map((h) => ({
    id: h.id,
    when: h.created_at,
    author: authorName(h.actor_user_id),
    title: t(`entry_contracts.history.${h.kind}`, { name: nameOf(h.code) }),
    lines: h.changes.map((c) => t("entry_contracts.history.change", { field: t(`entry_contracts.fields.${c.field}`, { defaultValue: c.field }), from: shortValue(t, c.from), to: shortValue(t, c.to) })),
    note: h.note,
  }));

  return (
    <>
      {box(
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("entry_contracts.rules.col_name")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("entry_contracts.rules.col_when")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("entry_contracts.rules.col_signers")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("entry_contracts.rules.col_blocks")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("entry_contracts.rules.col_state")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => (
                  <tr key={r.code} className={cn(!r.active && "text-muted-foreground")}>
                    <td className="px-3 py-2.5 align-top">
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{t(`entry_contracts.kinds.${r.kind}`)} · {t(r.required ? "entry_contracts.rules.required" : "entry_contracts.rules.optional")}</span>
                    </td>
                    <td className="px-3 py-2.5 align-top">{whenText(t, r, all)}</td>
                    <td className="px-3 py-2.5 align-top">{signersText(t, r, entities)}</td>
                    <td className="px-3 py-2.5 align-top">{blocksText(t, r, all)}</td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={cn("inline-flex rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium", r.active ? "border-status-success-border bg-status-success-bg text-status-success-fg" : "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg")}>
                        {t(r.active ? "entry_contracts.rules.active" : "entry_contracts.rules.archived")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                      <span className="inline-flex gap-3">
                        <button onClick={() => setEditing(r)} className={linkBtn}>{t("entry_contracts.rules.edit")}</button>
                        {r.active
                          ? <button onClick={() => setArchiving(r)} className={linkBtn}>{t("entry_contracts.rules.archive")}</button>
                          : <button onClick={() => doRestore(r)} disabled={restore.isPending} className={linkBtn}>{t("entry_contracts.rules.restore")}</button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {archived.length > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="mt-2 text-sm text-link hover:underline">
              {showArchived ? t("entry_contracts.rules.hide_archived") : t("entry_contracts.rules.show_archived", { count: archived.length })}
            </button>
          )}
        </>,
      )}
      {historyQ.isSuccess && <HistoryList title={t("entry_contracts.history.title")} entries={entries} empty={t("entry_contracts.history.empty")} />}
      {editing && <RuleDialog rule={editing === "new" ? null : editing} rules={all} onClose={() => setEditing(null)} />}
      {archiving && (
        <ArchiveRuleDialog
          rule={archiving}
          pending={archive.isPending}
          onClose={() => setArchiving(null)}
          onConfirm={(reason) =>
            archive.mutate({ code: archiving.code, reason }, {
              onSuccess: () => {
                const r = archiving;
                setArchiving(null);
                toast.success(t("entry_contracts.rules.t_archived", { name: r.name }), { action: { label: t("global.undo"), onClick: () => doRestore(r) } });
              },
              onError: (e) => { setArchiving(null); fail(e); },
            })
          }
        />
      )}
    </>
  );
}

/** A history value in a few words: long texts and objects are only said to have changed. */
function shortValue(t: (key: string) => string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return t(value ? "entry.rules.flow.yes" : "entry.rules.flow.no");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.length > 60 ? t("entry_contracts.history.text_changed") : value;
  return t("entry_contracts.history.text_changed");
}

interface RuleForm {
  name: string;
  kind: EntryContractKind;
  template: string;
  explainer_title: string;
  paragraphs: string;
  bullets: string;
  signers: EntryContractSigner[];
  trigger: string;
  delay_days: string;
  deadline_days: string;
  blocks: string[];
  required: boolean;
  position: string;
}

const formOf = (rule: EntryContractRule | null, rules: EntryContractRule[]): RuleForm => ({
  name: rule?.name ?? "",
  kind: rule?.kind ?? "other",
  template: rule?.template ?? "",
  explainer_title: rule?.explainer.title ?? "",
  paragraphs: (rule?.explainer.paragraphs ?? []).join("\n"),
  bullets: (rule?.explainer.bullets ?? []).join("\n"),
  signers: structuredClone(rule?.signers ?? [{ party: "owner" }, { party: "sm", sm_entity: "corporate" }]),
  trigger: rule?.trigger ?? "documents_approved",
  delay_days: String(rule?.delay_days ?? 0),
  deadline_days: String(rule?.deadline_days ?? 0),
  blocks: [...(rule?.blocks ?? [])],
  required: rule?.required ?? true,
  position: String(rule?.position ?? Math.max(0, ...rules.map((r) => r.position)) + 1),
});

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const toInt = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

const inputOf = (f: RuleForm): EntryContractRuleInput => ({
  name: f.name.trim(),
  kind: f.kind,
  template: f.template,
  explainer: { title: f.explainer_title.trim(), paragraphs: lines(f.paragraphs), bullets: lines(f.bullets) },
  signers: PARTIES.flatMap((p) => f.signers.filter((s) => s.party === p)),
  trigger: f.trigger as EntryContractRuleInput["trigger"],
  delay_days: toInt(f.delay_days),
  deadline_days: toInt(f.deadline_days),
  blocks: f.blocks,
  required: f.required,
  position: toInt(f.position) || 1,
});

/** Add or edit one rule: name, the text with its placeholders, the explanation, signers, when, deadline, what waits. */
function RuleDialog({ rule, rules, onClose }: { rule: EntryContractRule | null; rules: EntryContractRule[]; onClose: () => void }) {
  const { t } = useTranslation();
  const add = useAddContractRule();
  const update = useUpdateContractRule();
  const entities = smEntitiesOf(useRules().data);
  const [form, setForm] = useState<RuleForm>(() => formOf(rule, rules));
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const others = rules.filter((r) => r.code !== rule?.code);
  const input = inputOf(form);
  const error = ruleError({ ...input, code: rule?.code }, others.map((r) => r.code));
  const pending = add.isPending || update.isPending;

  const signerOf = (party: ContractParty) => form.signers.find((s) => s.party === party);
  const toggleSigner = (party: ContractParty) =>
    set("signers", signerOf(party) ? form.signers.filter((s) => s.party !== party) : [...form.signers, party === "sm" ? { party, sm_entity: "corporate" } : { party }]);
  const patchSm = (patch: Partial<EntryContractSigner>) =>
    set("signers", form.signers.map((s) => (s.party === "sm" ? { ...s, ...patch } : s)));
  const toggleBlock = (b: string) => set("blocks", form.blocks.includes(b) ? form.blocks.filter((x) => x !== b) : [...form.blocks, b]);

  /** Puts the placeholder where the cursor is (or at the end) and keeps the cursor after it. */
  const insert = (token: string) => {
    const el = templateRef.current;
    const start = el?.selectionStart ?? form.template.length;
    const end = el?.selectionEnd ?? start;
    const next = `${form.template.slice(0, start)}${token}${form.template.slice(end)}`;
    set("template", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () => {
    setTried(true);
    if (error) return;
    const onError = (e: unknown) =>
      toast.error(e instanceof Error && t(`entry_contracts.errors.${e.message}`, { defaultValue: "" }) ? t(`entry_contracts.errors.${e.message}`) : t("global.t_error"));
    if (!rule)
      return add.mutate(input, { onSuccess: (r) => { toast.success(t("entry_contracts.rules.t_added", { name: r.name })); onClose(); }, onError });
    const patch = Object.fromEntries(
      (Object.keys(input) as (keyof EntryContractRuleInput)[])
        .filter((k) => JSON.stringify(input[k]) !== JSON.stringify(rule[k as keyof EntryContractRule]))
        .map((k) => [k, input[k]]),
    ) as Partial<EntryContractRuleInput>;
    if (Object.keys(patch).length === 0) return onClose();
    update.mutate({ code: rule.code, patch, version: rule.version, note: note.trim() || null }, {
      onSuccess: () => { toast.success(t("entry_contracts.rules.t_saved", { name: input.name })); onClose(); },
      onError,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? t("entry_contracts.editor.title_edit", { name: rule.name }) : t("entry_contracts.editor.title_add")}</DialogTitle>
          <DialogDescription>{t("entry_contracts.editor.body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label={t("entry_contracts.editor.name")} error={tried && error === "name_required" ? t("entry_contracts.errors.name_required") : undefined}>
              <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className={cn(inputCls, tried && error === "name_required" && "border-status-danger-fg")} />
            </Field>
            <Field label={t("entry_contracts.editor.kind")}>
              <select value={form.kind} onChange={(e) => set("kind", e.target.value as EntryContractKind)} className={inputCls}>
                {ENTRY_CONTRACT_KINDS.map((k) => <option key={k} value={k}>{t(`entry_contracts.kinds.${k}`)}</option>)}
              </select>
            </Field>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rule-template" className="text-sm font-medium">{t("entry_contracts.editor.template")}</label>
            <p className="text-xs text-muted-foreground">{t("entry_contracts.editor.template_hint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_TEMPLATE_PLACEHOLDERS.map((p) => (
                <button key={p} type="button" onClick={() => insert(placeholderToken(p))} title={placeholderToken(p)}
                  className="rounded-[4px] border border-border bg-surface px-1.5 py-0.5 text-xs hover:border-primary hover:bg-muted">
                  {t(`entry_contracts.placeholders.${p}`)}
                </button>
              ))}
            </div>
            <textarea id="rule-template" ref={templateRef} rows={10} value={form.template} onChange={(e) => set("template", e.target.value)} className={cn(areaCls, "font-mono text-xs")} />
          </div>

          <fieldset className="space-y-3 rounded-[4px] border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t("entry_contracts.editor.explainer")}</legend>
            <Field label={t("entry_contracts.editor.explainer_title")}>
              <input value={form.explainer_title} onChange={(e) => set("explainer_title", e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("entry_contracts.editor.paragraphs")} hint={t("entry_contracts.editor.one_per_line")}>
              <textarea rows={3} value={form.paragraphs} onChange={(e) => set("paragraphs", e.target.value)} className={areaCls} />
            </Field>
            <Field label={t("entry_contracts.editor.bullets")} hint={t("entry_contracts.editor.one_per_line")}>
              <textarea rows={3} value={form.bullets} onChange={(e) => set("bullets", e.target.value)} className={areaCls} />
            </Field>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("entry_contracts.editor.signers")}</legend>
            {PARTIES.map((p) => {
              const s = signerOf(p);
              return (
                <div key={p} className="flex flex-wrap items-center gap-3 rounded-[4px] border border-border px-3 py-2 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={!!s} onChange={() => toggleSigner(p)} className="h-4 w-4 accent-primary" />
                    {t(`entry_contracts.signers.${p === "sm" ? "sm_party" : p}`)}
                  </label>
                  {p === "sm" && s && (
                    <>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t("entry_contracts.editor.entity")}
                        <select value={s.sm_entity ?? "corporate"} onChange={(e) => patchSm({ sm_entity: e.target.value as SmEntity })} className="h-8 rounded-md border border-input bg-surface px-2 text-sm text-foreground">
                          {SM_ENTITIES.map((en) => <option key={en} value={en}>{entities[en].name}</option>)}
                        </select>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={!!s.auto_sign} onChange={(e) => patchSm({ auto_sign: e.target.checked })} className="h-4 w-4 accent-primary" />
                        {t("entry_contracts.editor.auto_sign")}
                      </label>
                    </>
                  )}
                </div>
              );
            })}
            {tried && (error === "signers_required" || error === "sm_entity_required") && <p className="text-xs text-status-danger-fg">{t(`entry_contracts.errors.${error}`)}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("entry_contracts.editor.trigger")} error={tried && error === "invalid_trigger" ? t("entry_contracts.errors.invalid_trigger") : undefined}>
              <select value={form.trigger} onChange={(e) => set("trigger", e.target.value)} className={inputCls}>
                {CONTRACT_TRIGGER_EVENTS.map((ev) => <option key={ev} value={ev}>{t(`entry_contracts.when.${ev}`)}</option>)}
                {others.map((r) => <option key={r.code} value={contractSignedTrigger(r.code)}>{t("entry_contracts.when.contract_signed", { name: r.name })}</option>)}
              </select>
            </Field>
            <Field label={t("entry_contracts.editor.delay")} hint={t("entry_contracts.editor.delay_hint")}>
              <input inputMode="numeric" value={form.delay_days} onChange={(e) => set("delay_days", e.target.value)} className={cn(inputCls, tried && error === "invalid_days" && "border-status-danger-fg")} />
            </Field>
            <Field label={t("entry_contracts.editor.deadline")} hint={t("entry_contracts.editor.deadline_hint")}>
              <input inputMode="numeric" value={form.deadline_days} onChange={(e) => set("deadline_days", e.target.value)} className={cn(inputCls, tried && error === "invalid_days" && "border-status-danger-fg")} />
            </Field>
          </div>
          {tried && error === "invalid_days" && <p className="text-xs text-status-danger-fg">{t("entry_contracts.errors.invalid_days")}</p>}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("entry_contracts.editor.blocks")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {blockOptions(rules, rule?.code).map((b) => (
                <label key={b} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.blocks.includes(b)} onChange={() => toggleBlock(b)} className="h-4 w-4 accent-primary" />
                  {b === "documents" || b === "program_start" ? t(`entry_contracts.blocks.${b}`) : rules.find((r) => r.code === b)?.name ?? b}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={form.required} onChange={(e) => set("required", e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                <span className="block font-medium">{t("entry_contracts.editor.required")}</span>
                <span className="block text-xs text-muted-foreground">{t("entry_contracts.editor.required_hint")}</span>
              </span>
            </label>
            <Field label={t("entry_contracts.editor.position")}>
              <input inputMode="numeric" value={form.position} onChange={(e) => set("position", e.target.value)} className={inputCls} />
            </Field>
          </div>

          {rule && (
            <Field label={t("entry_contracts.editor.note")} hint={t("entry_contracts.editor.note_hint")}>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>

        <DialogFooter>
          <SecondaryButton onClick={onClose}>{t("global.cancel")}</SecondaryButton>
          <PrimaryButton onClick={save} disabled={pending}>{rule ? t("global.save_changes") : t("entry_contracts.editor.create")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveRuleDialog(props: { rule: EntryContractRule; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entry_contracts.archive.title", { name: props.rule.name })}</DialogTitle>
          <DialogDescription>{t("entry_contracts.archive.body")}</DialogDescription>
        </DialogHeader>
        <Field label={t("entry_contracts.archive.reason")}>
          <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={areaCls} />
        </Field>
        <DialogFooter>
          <SecondaryButton onClick={props.onClose}>{t("global.cancel")}</SecondaryButton>
          <PrimaryButton onClick={() => props.onConfirm(reason.trim())} disabled={props.pending}>{t("entry_contracts.archive.confirm")}</PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-status-danger-fg">{error}</span>}
    </label>
  );
}

/**
 * SM Global: the names Strategic Mates signs with. Corporate signs the NDA, the MOU and the binding agreement; SM
 * Square signs the Operating Agreement (its center and holder come from each validation).
 */
export function SmEntitiesSection({ rules }: { rules: PlatformRules }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const saved = smEntitiesOf(rules);
  const [names, setNames] = useState({ corporate: saved.corporate.name, sm_square: saved.sm_square.name });
  const dirty = names.corporate.trim() !== saved.corporate.name || names.sm_square.trim() !== saved.sm_square.name;
  const empty = !names.corporate.trim() || !names.sm_square.trim();
  const save = () =>
    update.mutate({ patch: { sm_entities: { corporate: { name: names.corporate.trim() }, sm_square: { name: names.sm_square.trim() } } } }, {
      onSuccess: () => toast.success(t("entry_contracts.entities.t_saved"), {
        action: { label: t("global.undo"), onClick: () => update.mutate({ patch: { sm_entities: saved } }) },
      }),
      onError: () => toast.error(t("global.t_error")),
    });
  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{t("entry_contracts.entities.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("entry_contracts.entities.hint")}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {SM_ENTITIES.map((en) => (
          <Field key={en} label={t(`entry_contracts.entities.${en}`)} error={!names[en].trim() ? t("entry_contracts.entities.required") : undefined}>
            <input value={names[en]} onChange={(e) => setNames((n) => ({ ...n, [en]: e.target.value }))} className={inputCls} />
          </Field>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={save} disabled={!dirty || empty || update.isPending}>{t("entry_contracts.entities.save")}</PrimaryButton>
      </div>
    </section>
  );
}
