import type { BrandPalette } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

/**
 * Wordmark of a business brand. The logo upload is simulated (only its file name is kept), so the portal draws a
 * square with the initials in the accent color next to the business name, in the brand font when it has one.
 */
export function BrandLogo({ name, palette, onDark = true, className, compact = false }: { name: string; palette: Pick<BrandPalette, "accent_color" | "primary_color" | "font_family">; onDark?: boolean; className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)} title={name}>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] font-display text-xs font-bold"
        style={{ backgroundColor: palette.accent_color, color: palette.primary_color }}
      >
        {initials(name)}
      </span>
      {!compact && (
        <span className={cn("truncate text-sm font-semibold leading-tight", onDark ? "text-white" : "text-foreground")} style={palette.font_family ? { fontFamily: `${palette.font_family}, Inter, sans-serif` } : undefined}>
          {name}
        </span>
      )}
    </span>
  );
}
