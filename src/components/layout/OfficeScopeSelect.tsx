import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { useCurrentUser, useOrganizations } from "@/lib/api/hooks";
import { ALL_OFFICES, useOfficeScope } from "@/lib/office-scope";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Viendo": SM Global picks the whole network, Corporate or one office. The choice is remembered per browser and
 * filters the Global screens that know the office of what they list (embudo, negocios, tareas, reportes, the bell).
 * Anyone else never sees it.
 */
export function OfficeScopeSelect() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const [scope, setScope] = useOfficeScope();
  const orgsQ = useOrganizations();
  if (me?.role !== "sm_global") return null;
  const orgs = orgsQ.data ?? [];
  const corporate = orgs.find((o) => o.kind === "sm_global");
  const offices = orgs.filter((o) => o.kind === "sm").sort((a, b) => a.name.localeCompare(b.name));
  // A remembered office that no longer exists falls back to the whole network.
  const known = scope === ALL_OFFICES || corporate?.id === scope || offices.some((o) => o.id === scope);
  return (
    <Select value={known ? scope : ALL_OFFICES} onValueChange={setScope}>
      <SelectTrigger aria-label={t("topbar.viewing_title")} className="h-8 w-auto min-w-0 max-w-[9rem] gap-2 bg-surface text-sm sm:max-w-none md:min-w-44">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">{t("topbar.viewing")}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OFFICES}>{t("topbar.viewing_all")}</SelectItem>
        {corporate && <SelectItem value={corporate.id}>{t("topbar.viewing_corporate")}</SelectItem>}
        {offices.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
