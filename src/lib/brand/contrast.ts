// WCAG contrast for the business brand: the primary color carries white text (rail, primary buttons) and the accent
// is an indicator on white. When a color does not reach AA, we propose the nearest darker tone that does.

export const WHITE = "#ffffff";
/** AA for normal text. */
export const AA_TEXT = 4.5;
/** AA for non-text UI parts (indicators, progress bars). */
export const AA_UI = 3;

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colors, 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Mixes a color toward black by `amount` (0 to 1). */
export function darken(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

export interface ContrastCheck {
  ratio: number;
  required: number;
  ok: boolean;
  /** Nearest darker tone that reaches the requirement (same as the input when it already does). */
  suggestion: string;
}

/** Checks `color` against `background` and, if short, darkens it step by step until it passes. */
export function checkContrast(color: string, background: string, required: number): ContrastCheck {
  const ratio = contrastRatio(color, background);
  if (ratio >= required) return { ratio, required, ok: true, suggestion: color.toLowerCase() };
  let candidate = color;
  for (let i = 0; i < 40; i++) {
    candidate = darken(candidate, 0.06);
    if (contrastRatio(candidate, background) >= required) break;
  }
  return { ratio, required, ok: false, suggestion: candidate };
}

/** Primary: white text on it (AA text; the ratio is symmetric). Accent: indicator on the white work area (AA UI). */
export const checkPrimary = (hex: string) => checkContrast(hex, WHITE, AA_TEXT);
export const checkAccent = (hex: string) => checkContrast(hex, WHITE, AA_UI);

/** Hover tone of a primary color: a bit darker, like the SM dark blue next to the institutional blue. */
export const hoverOf = (hex: string) => darken(hex, 0.18);
