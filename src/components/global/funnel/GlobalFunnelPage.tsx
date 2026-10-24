import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useLeadDetail, useLeads, useOrganizations, useUsers } from "@/lib/api/hooks";
import { LEAD_STAGES } from "@/lib/api/types";
import { ALL_OFFICES, officeIdForQuery, useOfficeScope } from "@/lib/office-scope";
import { cn } from "@/lib/utils";
import { LeadDetail } from "@/components/pipeline/LeadDetail";
import { LeadBoard, LeadTable } from "@/components/pipeline/LeadViews";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBox, ErrorBox, GlobalHeader } from "../shared";

/**
 * Embudo of the whole network, read only. It looks like the office funnel (same board and table) but SM Global
 * never moves or writes on a lead: each office does. The office in view comes from "Viendo" in the header (one
 * control for every Global screen), and the API gets it as office_id.
 */
export function GlobalFunnelPage({ initialLeadId }: { initialLeadId?: string | undefined } = {}) {
  const { t } = useTranslation();
  const [scope] = useOfficeScope();
  const [view, setView] = useState<"board" | "table">("board");
  // Opened from the bell (?lead=): that lead comes up at once (Corporate signs the binding agreement there).
  const [leadId, setLeadId] = useState<string | undefined>(initialLeadId);
  const leadsQ = useLeads(officeIdForQuery(scope));
  const orgsQ = useOrganizations();
  const usersQ = useUsers();
  const meId = useCurrentUser().data?.id;
  // The open lead as its detail reads it (the same query): a lead opened from the bell may be outside the office in view.
  const openQ = useLeadDetail(leadId);
  const header = <GlobalHeader question={t("global.funnel.question")} />;
  const queries = [leadsQ, orgsQ, usersQ];

  if (queries.some((q) => q.isError))
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => queries.forEach((q) => void q.refetch())} /></div>
      </div>
    );
  if (queries.some((q) => q.isLoading))
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 flex gap-3">{LEAD_STAGES.map((s) => <Skeleton key={s} className="h-72 w-64 rounded-md" />)}</div>
      </div>
    );

  const leads = leadsQ.data ?? [];
  const consultantName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const selected = leads.find((l) => l.id === leadId);
  const openConsultant = openQ.data?.lead.consultant_user_id ?? selected?.consultant_user_id;
  const office = scope === ALL_OFFICES ? null : orgsQ.data?.find((o) => o.id === scope);
  const officeLabel = office ? (office.kind === "sm_global" ? t("topbar.viewing_corporate") : office.name) : t("global.funnel.all_offices");

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      {header}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
          {(["board", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn("rounded-[4px] px-3 py-1 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t(`pipeline.view_${v}`)}
            </button>
          ))}
        </div>
        <span className="rounded-[4px] border border-border bg-surface px-2 py-1 text-sm">{officeLabel}</span>
        <span className="text-sm text-muted-foreground">{t("global.funnel.total", { count: leads.length })}</span>
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("global.funnel.read_only")}</p>
      </div>

      <div className="mt-4">
        {leads.length === 0 ? (
          <EmptyBox title={t("global.funnel.empty_title")} body={t("global.funnel.empty_body")} />
        ) : view === "board" ? (
          <LeadBoard readOnly leads={leads} selectedId={leadId} consultantName={consultantName} onOpen={setLeadId} />
        ) : (
          <LeadTable leads={leads} selectedId={leadId} consultantName={consultantName} onOpen={setLeadId} />
        )}
      </div>

      <Sheet open={!!leadId} onOpenChange={(o) => !o && setLeadId(undefined)}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl [&>button]:hidden">
          <SheetTitle className="sr-only">{selected?.business.name ?? t("pipeline.detail.open_full")}</SheetTitle>
          <SheetDescription className="sr-only">{selected?.contact.name ?? ""}</SheetDescription>
          {/* Read only unless the current user is the lead's consultant (who held a meeting answers it either way). */}
          {leadId && <LeadDetail readOnly={!meId || openConsultant !== meId} leadId={leadId} onClose={() => setLeadId(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
