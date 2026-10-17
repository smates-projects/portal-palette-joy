import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateManualLead } from "@/lib/api/hooks";
import type { LeadIndustry, ManualLeadInput, MarginRange, RevenueRange, TeamRange, YearsRange } from "@/lib/api/types";
import { INDUSTRIES, REVENUES } from "@/lib/leads/pipeline";
import { Field, inputCls, primaryBtn, secondaryBtn, selectCls, textareaCls } from "@/components/accounts/shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MARGINS: MarginRange[] = ["lt_10", "10_20", "20_30", "gt_30"];
const TEAMS: TeamRange[] = ["1_5", "6_15", "16_50", "gt_50"];
const YEARS: YearsRange[] = ["lt_2", "2_5", "5_10", "gt_10"];

/**
 * "Agregar negocio": a business that did not come through the assessment (referral, event). Same data the
 * assessment collects, without the result: it enters Evaluado with origin "Manual".
 */
export function AddBusinessDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const create = useCreateManualLead();
  const [f, setF] = useState({
    name: "", email: "", phone: "", city: "", state: "FL", hispanic: true,
    business: "", industry: "" as LeadIndustry | "", activity: "", revenue: "" as RevenueRange | "", margin: "" as MarginRange | "", team: "" as TeamRange | "", years: "" as YearsRange | "", clients: true,
    origin: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    if (!f.business.trim() || !f.name.trim()) return setError(t("pipeline.manual.err_required"));
    if (!EMAIL.test(f.email.trim())) return setError(t("pipeline.manual.err_email"));
    if (!f.industry || !f.revenue || !f.margin || !f.team || !f.years) return setError(t("pipeline.manual.err_ranges"));
    setError(null);
    const input: ManualLeadInput = {
      contact: { name: f.name, email: f.email, phone: f.phone.trim(), city: f.city.trim(), state: f.state.trim() || "FL", hispanic_owner: f.hispanic },
      business: { name: f.business, industry: f.industry, activity: f.activity.trim(), revenue_range: f.revenue, margin_range: f.margin, team_range: f.team, years_range: f.years, has_active_clients: f.clients },
      origin_note: f.origin.trim() || null,
    };
    create.mutate(input, {
      onSuccess: (lead) => { toast.success(t("pipeline.manual.t_created", { name: lead.business.name })); onCreated(lead.id); },
      onError: () => toast.error(t("pipeline.t_error")),
    });
  };

  const select = <T extends string>(label: string, value: T | "", options: readonly T[], prefix: string, onChange: (v: T) => void) => (
    <Field label={label}>
      <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        <option value="">{t("pipeline.manual.pick")}</option>
        {options.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}`)}</option>)}
      </select>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pipeline.manual.title")}</DialogTitle>
          <DialogDescription>{t("pipeline.manual.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.business_title")}</p>
          <Field label={t("pipeline.business")}>
            <input className={inputCls} value={f.business} onChange={(e) => set("business", e.target.value)} autoComplete="off" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {select(t("pipeline.industry"), f.industry, INDUSTRIES, "pipeline.industries", (v) => set("industry", v))}
            <Field label={t("pipeline.detail.activity")}>
              <input className={inputCls} value={f.activity} onChange={(e) => set("activity", e.target.value)} autoComplete="off" />
            </Field>
            {select(t("pipeline.revenue"), f.revenue, REVENUES, "pipeline.revenue_ranges", (v) => set("revenue", v))}
            {select(t("pipeline.detail.margin"), f.margin, MARGINS, "pipeline.margin_ranges", (v) => set("margin", v))}
            {select(t("pipeline.detail.team"), f.team, TEAMS, "pipeline.team_ranges", (v) => set("team", v))}
            {select(t("pipeline.detail.years"), f.years, YEARS, "pipeline.years_ranges", (v) => set("years", v))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.clients} onChange={(e) => set("clients", e.target.checked)} className="h-4 w-4 rounded-[4px] border-input" />
            {t("pipeline.detail.active_clients")}
          </label>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("pipeline.detail.contact")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("pipeline.owner")}>
              <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("pipeline.manual.email")}>
              <input className={inputCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("pipeline.manual.phone")}>
              <input className={inputCls} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("pipeline.city")}>
              <input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.hispanic} onChange={(e) => set("hispanic", e.target.checked)} className="h-4 w-4 rounded-[4px] border-input" />
            {t("pipeline.detail.hispanic")}
          </label>
          <Field label={t("pipeline.manual.origin_note")} hint={t("pipeline.manual.origin_note_hint")}>
            <textarea rows={2} className={textareaCls} value={f.origin} onChange={(e) => set("origin", e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-xs text-status-danger-fg">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t("pipeline.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={create.isPending}>{t("pipeline.manual.confirm")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
