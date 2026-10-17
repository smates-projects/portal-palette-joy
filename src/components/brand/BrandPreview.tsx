import { useTranslation } from "react-i18next";
import type { BrandPalette } from "@/lib/api/types";
import { hoverOf } from "@/lib/brand/contrast";
import { BrandLogo } from "./BrandLogo";

/** Small picture of the portal with the brand applied: logo on the rail, primary on rail and button, accent on indicators. */
export function BrandPreview({ name, palette }: { name: string; palette: BrandPalette }) {
  const { t } = useTranslation();
  const font = palette.font_family ? { fontFamily: `${palette.font_family}, Inter, sans-serif` } : undefined;
  return (
    <div aria-label={t("brand.preview_label")} className="overflow-hidden rounded-[4px] border border-border bg-background text-xs">
      <div className="flex h-40">
        <div className="flex w-32 shrink-0 flex-col justify-between p-2.5 text-white" style={{ backgroundColor: palette.primary_color }}>
          <div className="space-y-2.5">
            <BrandLogo name={name} palette={palette} />
            <ul className="space-y-1">
              {(["home", "tasks", "manual"] as const).map((k, i) => (
                <li key={k} className="relative flex h-6 items-center rounded-[4px] px-2" style={i === 0 ? { backgroundColor: hoverOf(palette.primary_color) } : undefined}>
                  {i === 0 && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{ backgroundColor: palette.accent_color }} />}
                  <span className={i === 0 ? "font-medium" : "opacity-80"}>{t(`nav.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[10px] opacity-70">{t("brand.with_sm")}</p>
        </div>
        <div className="flex-1 space-y-3 p-3">
          <p className="text-sm font-semibold" style={font}>{t("pages.home.subtitle")}</p>
          <div className="h-1.5 overflow-hidden rounded-[2px] border border-border bg-muted">
            <div className="h-full w-2/3" style={{ backgroundColor: palette.accent_color }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-[4px] px-3 font-display font-semibold text-white" style={{ backgroundColor: palette.primary_color }}>{t("owner.action_approve")}</span>
            <span className="inline-flex h-7 items-center rounded-[4px] border border-border bg-surface px-3">{t("owner.action_request_changes")}</span>
          </div>
          <div className="rounded-[4px] border border-border bg-surface p-2 text-muted-foreground">{t("brand.preview_card")}</div>
        </div>
      </div>
    </div>
  );
}
