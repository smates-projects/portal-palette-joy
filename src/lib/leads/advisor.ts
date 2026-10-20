// The assessment link of one SM advisor: the public assessment of strategicmates.com with ?asesor=<slug>. A lead that
// arrives through it carries completed_by_advisor (the API resolves the slug).

export const ASSESSMENT_URL = "https://strategicmates.com/assessment";

/** null without a slug (the person has no link yet). */
export function advisorAssessmentUrl(slug: string | null | undefined): string | null {
  const clean = slug?.trim();
  return clean ? `${ASSESSMENT_URL}?asesor=${encodeURIComponent(clean)}` : null;
}
