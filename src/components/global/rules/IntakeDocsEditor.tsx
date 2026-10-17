import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useUpdateRules } from "@/lib/api/hooks";
import type { IntakeDocRule, PlatformRules } from "@/lib/api/network-types";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/tasks/detail/dialogs";

const inputCls = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

/** SM Global: entry documents every owner uploads (add, edit, required, archive). Applies to the next entries. */
export function IntakeDocsEditor({ rules }: { rules: PlatformRules }) {
  const { t } = useTranslation();
  const update = useUpdateRules();
  const [docs, setDocs] = useState<IntakeDocRule[]>(rules.intake_documents);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(docs) !== JSON.stringify(rules.intake_documents);
  const invalid = docs.some((d) => !d.name.trim());
  const set = (id: string, patch: Partial<IntakeDocRule>) => setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const save = () => {
    setTried(true);
    if (invalid || !dirty) return;
    const prev = rules.intake_documents;
    update.mutate({ patch: { intake_documents: docs.map((d) => ({ ...d, name: d.name.trim() })) } }, {
      onSuccess: () => toast.success(t("intake.rules.t_saved"), { action: { label: t("global.undo"), onClick: () => update.mutate({ patch: { intake_documents: prev } }) } }),
      onError: () => toast.error(t("global.t_error")),
    });
  };
  return (
    <section className="mt-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t("intake.rules.docs_title")}</h2>
        <span className="rounded-[4px] border border-status-warning-border bg-status-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-status-warning-fg">{t("intake.rules.docs_badge")}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("intake.rules.docs_hint")}</p>
      <ul className="mt-3 divide-y divide-border rounded-md border border-border">
        {docs.map((d) => (
          <li key={d.id} className={cn("space-y-2 px-3 py-3", d.archived && "opacity-60")}>
            <div className="flex items-center gap-2">
              <input value={d.name} onChange={(e) => set(d.id, { name: e.target.value })} aria-label={t("intake.rules.name")} disabled={d.archived}
                className={cn(inputCls, tried && !d.name.trim() && "border-status-danger-fg")} />
              <button onClick={() => set(d.id, { archived: !d.archived })} className="shrink-0 text-xs text-link hover:underline">
                {d.archived ? t("intake.rules.restore") : t("intake.rules.archive")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={d.required} disabled={d.archived} onChange={(e) => set(d.id, { required: e.target.checked })} />{t("intake.required")}</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={d.only_if_llc} disabled={d.archived} onChange={(e) => set(d.id, { only_if_llc: e.target.checked })} />{t("intake.only_llc")}</label>
              {d.archived && <span className="text-muted-foreground">{t("intake.rules.archived")}</span>}
            </div>
            <input value={d.verified_hint} onChange={(e) => set(d.id, { verified_hint: e.target.value })} disabled={d.archived}
              placeholder={t("intake.rules.hint")} aria-label={t("intake.rules.hint")} className={cn(inputCls, "h-8 text-xs")} />
          </li>
        ))}
      </ul>
      {tried && invalid && <p className="mt-2 text-xs text-status-danger-fg">{t("intake.rules.name_required")}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button onClick={() => setDocs((all) => [...all, { id: newId(), name: t("intake.rules.new_name"), required: true, only_if_llc: false, verified_hint: "", archived: false }])}
          className="text-sm text-link hover:underline">{t("intake.rules.add")}</button>
        <PrimaryButton onClick={save} disabled={!dirty || update.isPending}>{t("intake.rules.save")}</PrimaryButton>
      </div>
    </section>
  );
}
