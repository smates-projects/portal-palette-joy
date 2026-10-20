// What SM sees about the Bishops of one lead, flattened for the screen. Tolerant on purpose: a row with a missing date
// (presented but never opened, an answer without its date) renders without that date instead of breaking the page.
import type { LeadInvestors } from "@/lib/api/types";

export interface InvestorRow {
  id: string;
  name: string;
  presented_at: string | null;
  viewed_at: string | null;
  passed_at: string | null;
  accepted_at: string | null;
}

/** One row per Bishop SM presented it to or who opened it: presented, viewed, passed or accepted. */
export function investorRows(
  inv: Pick<LeadInvestors, "views" | "bishop" | "presented">,
): InvestorRow[] {
  const presented = (inv.presented ?? []).filter((p) => !!p?.bishop_user_id);
  const views = (inv.views ?? []).filter((v) => !!v?.bishop_user_id);
  const ids = [
    ...new Set([...presented.map((p) => p.bishop_user_id), ...views.map((v) => v.bishop_user_id)]),
  ];
  return ids.map((id) => {
    const p = presented.find((x) => x.bishop_user_id === id);
    const v = views.find((x) => x.bishop_user_id === id);
    return {
      id,
      name: p?.name || v?.name || "",
      presented_at: p?.presented_at ?? null,
      viewed_at: v?.viewed_at ?? null,
      passed_at: v?.decision === "passed" ? (v.decided_at ?? null) : null,
      accepted_at: inv.bishop?.user_id === id ? (inv.bishop.accepted_at ?? null) : null,
    };
  });
}

export type PresentChoiceState = "available" | "already" | "no_framework";

/**
 * The checkboxes of "Presentar a Bishops": only the API's candidates, one per id. Already presented ones stay ticked
 * and fixed; a Bishop without the framework agreement signed shows but cannot be ticked.
 */
export function presentChoices(
  inv: Pick<LeadInvestors, "candidates" | "presented">,
): { user_id: string; name: string; state: PresentChoiceState }[] {
  const already = new Set((inv.presented ?? []).map((p) => p.bishop_user_id));
  const seen = new Set<string>();
  return (inv.candidates ?? []).flatMap((c) => {
    if (!c?.user_id || seen.has(c.user_id)) return [];
    seen.add(c.user_id);
    const state: PresentChoiceState = already.has(c.user_id)
      ? "already"
      : c.framework_signed === false
        ? "no_framework"
        : "available";
    return [{ user_id: c.user_id, name: c.name, state }];
  });
}
