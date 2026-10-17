import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Image, Loader2, Paperclip, X } from "lucide-react";
import type { BrandPalette, BrandProposal } from "@/lib/api/types";
import { checkAccent, checkPrimary, isHex } from "@/lib/brand/contrast";
import { brandFileNames, detectBrandFromManual, READING_DELAY_MS } from "@/lib/brand/detect";
import { SecondaryButton } from "@/components/tasks/detail/dialogs";
import { inputCls } from "@/components/accounts/shared";
import { BrandPreview } from "./BrandPreview";

/**
 * Brand capture used in the B5-13 delivery ("Diagnóstico de marca y manual básico de uso") and by SM when it
 * loads a brand by hand. With the manual attached, the app "reads" it (simulated) and prefills the palette; the
 * firm corrects it before sending. Contrast is checked against AA with a darker tone proposed when it falls short.
 */
export function BrandCaptureSection({ businessName, value, onChange, mode = "delivery" }: {
  businessName: string;
  value: BrandProposal | null;
  onChange: (v: BrandProposal | null) => void;
  /** delivery: manual PDF first, then the palette. manual: SM types the palette straight away. */
  mode?: "delivery" | "manual";
}) {
  const { t } = useTranslation();
  const names = brandFileNames(businessName);
  const [manual, setManual] = useState<string | null>(value?.manual_file_name ?? (mode === "manual" ? names.manual : null));
  const [logo, setLogo] = useState<string | null>(value?.logo_file_name ?? null);
  const [reading, setReading] = useState(false);
  const [palette, setPalette] = useState<BrandPalette | null>(value ? { primary_color: value.primary_color, accent_color: value.accent_color, font_family: value.font_family, logo_file_name: value.logo_file_name } : null);

  // Attaching the manual starts the (simulated) reading; the palette appears when it ends.
  useEffect(() => {
    if (!manual || palette || mode !== "delivery") return;
    setReading(true);
    const id = setTimeout(() => {
      const d = detectBrandFromManual(businessName, manual, logo);
      setPalette({ primary_color: d.primary_color, accent_color: d.accent_color, font_family: d.font_family, logo_file_name: logo });
      setReading(false);
    }, READING_DELAY_MS);
    return () => clearTimeout(id);
  }, [manual, palette, mode, businessName, logo]);

  // SM manual load: start from the sample palette at once.
  useEffect(() => {
    if (mode === "manual" && !palette) {
      const d = detectBrandFromManual(businessName, names.manual, null);
      setPalette({ primary_color: d.primary_color, accent_color: d.accent_color, font_family: d.font_family, logo_file_name: null });
    }
  }, [mode, palette, businessName, names.manual]);

  // Tell the parent whenever the proposal is complete and valid.
  useEffect(() => {
    if (!manual || !palette || !isHex(palette.primary_color) || !isHex(palette.accent_color)) return onChange(null);
    onChange({ ...palette, logo_file_name: logo, manual_file_name: manual });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, logo, palette]);

  const set = (k: keyof BrandPalette, v: string) => setPalette((p) => (p ? { ...p, [k]: v } : p));
  const primary = palette && isHex(palette.primary_color) ? checkPrimary(palette.primary_color) : null;
  const accent = palette && isHex(palette.accent_color) ? checkAccent(palette.accent_color) : null;

  return (
    <section className="space-y-4 rounded-[4px] border border-border p-3">
      <div>
        <h3 className="text-sm font-semibold">{t(mode === "delivery" ? "brand.capture_title" : "brand.manual_title")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t(mode === "delivery" ? "brand.capture_hint" : "brand.manual_hint")}</p>
      </div>

      {mode === "delivery" && (
        <div className="space-y-2">
          <FileRow label={t("brand.manual_file")} file={manual} icon={<FileText className="h-4 w-4 text-muted-foreground" />} onAttach={() => setManual(names.manual)} onRemove={() => { setManual(null); setPalette(null); }} attachLabel={t("brand.attach_manual")} />
          <FileRow label={t("brand.logo_file")} file={logo} icon={<Image className="h-4 w-4 text-muted-foreground" />} onAttach={() => setLogo(names.logo)} onRemove={() => setLogo(null)} attachLabel={t("brand.attach_logo")} />
        </div>
      )}
      {mode === "manual" && (
        <FileRow label={t("brand.logo_file")} file={logo} icon={<Image className="h-4 w-4 text-muted-foreground" />} onAttach={() => setLogo(names.logo)} onRemove={() => setLogo(null)} attachLabel={t("brand.attach_logo")} />
      )}

      {reading && (
        <p role="status" className="flex items-center gap-2 rounded-[4px] border border-border bg-muted px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />{t("brand.reading")}
        </p>
      )}

      {palette && !reading && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t(mode === "delivery" ? "brand.detected_hint" : "brand.palette_hint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField label={t("brand.primary")} hint={t("brand.primary_hint")} value={palette.primary_color} onChange={(v) => set("primary_color", v)} check={primary} fix={t("brand.use_darker")} />
            <ColorField label={t("brand.accent")} hint={t("brand.accent_hint")} value={palette.accent_color} onChange={(v) => set("accent_color", v)} check={accent} fix={t("brand.use_darker")} />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("brand.font")}</span>
            <input className={inputCls} value={palette.font_family ?? ""} onChange={(e) => set("font_family", e.target.value)} placeholder={t("brand.font_placeholder")} autoComplete="off" />
          </label>
          <BrandPreview name={businessName} palette={{ ...palette, logo_file_name: logo }} />
        </div>
      )}
    </section>
  );
}

function FileRow({ label, file, icon, onAttach, onRemove, attachLabel }: { label: string; file: string | null; icon: React.ReactNode; onAttach: () => void; onRemove: () => void; attachLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium">{label}</span>
      {file ? (
        <div className="flex items-center gap-2 rounded-[4px] border border-border px-3 py-2 text-sm">
          {icon}
          <span className="flex-1 truncate">{file}</span>
          <button type="button" aria-label={t("taskDetail.d_remove_file")} onClick={onRemove} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <SecondaryButton onClick={onAttach}><Paperclip className="h-3.5 w-3.5" />{attachLabel}</SecondaryButton>
      )}
    </div>
  );
}

function ColorField({ label, hint, value, onChange, check, fix }: { label: string; hint: string; value: string; onChange: (v: string) => void; check: { ok: boolean; ratio: number; required: number; suggestion: string } | null; fix: string }) {
  const { t } = useTranslation();
  const valid = isHex(value);
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded-[4px] border border-input bg-surface p-0.5" />
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      </div>
      <span className="block text-xs text-muted-foreground">{hint}</span>
      {!valid && <span className="block text-xs text-status-danger-fg">{t("brand.err_hex")}</span>}
      {check && (
        check.ok ? (
          <span className="block text-xs text-status-success-fg">{t("brand.contrast_ok", { ratio: check.ratio })}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-xs text-status-warning-fg">
            {t("brand.contrast_low", { ratio: check.ratio, required: check.required })}
            <button type="button" onClick={() => onChange(check.suggestion)} className="inline-flex items-center gap-1 text-link hover:underline">
              <span aria-hidden className="inline-block h-3 w-3 rounded-[2px] border border-border" style={{ backgroundColor: check.suggestion }} />
              {fix} {check.suggestion}
            </button>
          </span>
        )
      )}
    </div>
  );
}
