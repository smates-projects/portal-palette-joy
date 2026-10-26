import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useCurrentUser, useOrganizations, useRules } from "@/lib/api/hooks";
import type { Organization } from "@/lib/api/types";
import { smEntitiesOf } from "@/lib/leads/contract-rules";
import { ALL_OFFICES, useOfficeScope, type OfficeScope } from "@/lib/office-scope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showsOfficeScope } from "./nav";

/**
 * "Viendo": SM Global governs every SM Square office, so its own option (named as the rules call Corporate) is the
 * whole network, and then comes one option per office with only its leads. The choice is remembered per browser and
 * filters the Global screens that know the office of what they list (embudo, negocios, tareas, reportes, the bell).
 * It shows only on those screens (showsOfficeScope); anyone else never sees it.
 */
export function OfficeScopeSelect() {
  const me = useCurrentUser().data;
  const [scope, setScope] = useOfficeScope();
  const orgsQ = useOrganizations();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isGlobal = me?.role === "sm_global";
  const offices = (orgsQ.data ?? []).filter((o) => o.kind === "sm").sort((a, b) => a.name.localeCompare(b.name));
  const known = scope === ALL_OFFICES || offices.some((o) => o.id === scope);
  // A remembered choice that is no longer an option (an office that closed, or Corporate itself, which used to be one
  // more option with no leads) goes back to Global's own option, so every screen and the bell read the whole network.
  useEffect(() => {
    if (isGlobal && orgsQ.data && !known) setScope(ALL_OFFICES);
  }, [isGlobal, orgsQ.data, known, setScope]);
  if (!isGlobal || !showsOfficeScope(pathname)) return null;
  return <ScopeSelect scope={known ? scope : ALL_OFFICES} offices={offices} onChange={setScope} />;
}

/** The selector itself, mounted only for SM Global: it reads the rules for Global's name. */
function ScopeSelect({ scope, offices, onChange }: { scope: OfficeScope; offices: Organization[]; onChange: (scope: OfficeScope) => void }) {
  const { t } = useTranslation();
  const globalName = smEntitiesOf(useRules().data).corporate.name;
  return (
    <Select value={scope} onValueChange={onChange}>
      <SelectTrigger aria-label={t("topbar.viewing_title")} className="h-8 w-auto min-w-0 max-w-[9rem] gap-2 bg-surface text-sm sm:max-w-none md:min-w-44">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">{t("topbar.viewing")}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OFFICES}>{globalName}</SelectItem>
        {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
