import type { CSSProperties } from "react";
import type { BusinessBrand } from "@/lib/api/types";
import { hoverOf } from "./contrast";

/**
 * White label: the business brand replaces the SM blue on the rail and the primary buttons and the gold on the
 * indicators, through the same CSS variables the design system reads. Only set for the owner, the team, the
 * franchisor and its franchises (the mock returns null for everyone else). Lives outside the components so that
 * Vite's fast refresh keeps working (a component file must export only components).
 */
export const brandStyle = (brand: BusinessBrand | null | undefined): CSSProperties | undefined =>
  brand
    ? ({
        "--primary": brand.primary_color,
        "--primary-hover": hoverOf(brand.primary_color),
        "--sidebar": brand.primary_color,
        "--sidebar-accent": hoverOf(brand.primary_color),
        "--sidebar-border": hoverOf(brand.primary_color),
        "--gold": brand.accent_color,
        "--ring": brand.primary_color,
        "--link": brand.primary_color,
      } as CSSProperties)
    : undefined;
