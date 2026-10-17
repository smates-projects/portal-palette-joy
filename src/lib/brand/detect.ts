// Simulated reading of a brand manual. In production an AI in the backend reads the PDF and returns the palette;
// here a stable sample palette is picked from the business name so the demo is repeatable.
import type { BrandProposal } from "@/lib/api/types";

/** Sample palettes an AI could read from a manual (primary carries white text; accent is an indicator). */
const SAMPLES: { primary_color: string; accent_color: string; font_family: string }[] = [
  { primary_color: "#1f4e3d", accent_color: "#d9a441", font_family: "Montserrat" },
  { primary_color: "#5a2a83", accent_color: "#f2b134", font_family: "Poppins" },
  { primary_color: "#8c2f39", accent_color: "#e8b04b", font_family: "Lato" },
  { primary_color: "#1b4965", accent_color: "#ff9f1c", font_family: "Nunito" },
  { primary_color: "#3d405b", accent_color: "#e07a5f", font_family: "Raleway" },
  { primary_color: "#264653", accent_color: "#e9c46a", font_family: "Source Sans 3" },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Milliseconds the "Leyendo tu manual de marca…" step takes in the demo. */
export const READING_DELAY_MS = 1400;

/** Palette "read" from the manual: stable for the same business, plus the uploaded file names. */
export function detectBrandFromManual(businessName: string, manualFileName: string, logoFileName: string | null): BrandProposal {
  const sample = SAMPLES[hash(businessName) % SAMPLES.length]!;
  return { ...sample, manual_file_name: manualFileName, logo_file_name: logoFileName };
}

/** Default file names for the simulated uploads of B5-13. */
export const brandFileNames = (businessName: string) => {
  const slug = businessName.replace(/\s+/g, "_");
  return { manual: `${slug}_manual_de_marca.pdf`, logo: `${slug}_logo.png` };
};
