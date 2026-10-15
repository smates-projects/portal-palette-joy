import type { AreaCode } from "@/lib/api/types";

/**
 * Identity color of each Método 180 area. The tokens live in styles.css (--area-b1..b6).
 * An area color is identity, never status: always show it next to the area code or name.
 */
export function areaColorVar(area: AreaCode): string {
  return `var(--area-${area.toLowerCase()})`;
}

/** Share of the area color mixed into the surface for a soft tinted background. */
const TINT_PERCENT = 13;

/** Very soft tinted background in the area color, mixed with the current surface (works in dark mode). */
export function areaTintVar(area: AreaCode): string {
  return `color-mix(in oklab, ${areaColorVar(area)} ${TINT_PERCENT}%, var(--surface))`;
}
