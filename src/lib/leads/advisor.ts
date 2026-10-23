// The assessment link of one SM advisor: the public assessment with ?asesor=<slug>. A lead that arrives through it
// carries completed_by_advisor (the API resolves the slug). The address comes from VITE_ASSESSMENT_URL; only the demo
// (mock mode, no variable) falls back to the current public address.
import { isMockRepository } from "@/lib/api/mode";

const DEMO_ASSESSMENT_URL = "https://strategicmates.com/assessment";

const configured = (import.meta.env["VITE_ASSESSMENT_URL"] as string | undefined)?.trim() || null;

/** The public assessment's address, or null when the deployment did not set it (the link is then not offered). */
export const ASSESSMENT_URL: string | null = configured ?? (isMockRepository("users") ? DEMO_ASSESSMENT_URL : null);

/** null without a slug (the person has no link yet) or without a configured assessment address. */
export function advisorAssessmentUrl(slug: string | null | undefined): string | null {
  const clean = slug?.trim();
  return clean && ASSESSMENT_URL ? `${ASSESSMENT_URL}?asesor=${encodeURIComponent(clean)}` : null;
}
