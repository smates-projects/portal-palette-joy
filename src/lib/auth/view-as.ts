// "Ver como" in the top bar is impersonation: only SM Global has it. The HTTP session answers an empty list to
// anyone else (the API refuses them with 403), and the list built before the switch while SM Global is viewing as
// someone, so the selector stays to go back. The demo (mock) offers every person, as its way of moving between roles.
import type { ViewAsOption } from "../api/types";

/** Whether the top bar shows "Ver como": only with someone to pick. Nothing at all otherwise, never an empty selector. */
export function showViewAs(options: Pick<ViewAsOption, "enabled">[] | null | undefined): boolean {
  return (options ?? []).some((o) => o.enabled);
}
