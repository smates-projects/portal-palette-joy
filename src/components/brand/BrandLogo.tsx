import type { BrandPalette } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/**
 * Logo of a business brand. With logo_url it shows the image (32px high, horizontal or square). Without one it
 * draws a square with the initials in the accent color. Next to it, the business name in the brand font unless compact.
 */
export function BrandLogo({ name, palette, onDark = true, className, compact = false }: { name: string; palette: Pick<BrandPalette, "accent_color" | "primary_color" | "font_family" | "logo_url">; onDark?: boolean; className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)} title={name}>
      {palette.logo_url ? (
        <img src={palette.logo_url} alt={name} className="h-8 max-w-[9rem] shrink-0 object-contain object-left" />
      ) : (
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] font-display text-xs font-bold"
          style={{ backgroundColor: palette.accent_color, color: palette.primary_color }}
        >
          {initials(name)}
        </span>
      )}
      {!compact && !palette.logo_url && (
        <span className={cn("truncate text-sm font-semibold leading-tight", onDark ? "text-white" : "text-foreground")} style={palette.font_family ? { fontFamily: `${palette.font_family}, Inter, sans-serif` } : undefined}>
          {name}
        </span>
      )}
    </span>
  );
}
