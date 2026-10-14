import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeads, useOffices, useUsers } from "@/lib/api/hooks";
import { LEAD_STAGES } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { LeadDetail } from "@/components/pipeline/LeadDetail";
import { LeadBoard, LeadTable } from "@/components/pipeline/LeadViews";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBox, ErrorBox, GlobalHeader } from "../shared";

const ALL = "__all";

/**
 * Embudo of the whole network, read only. It looks like the office funnel (same board and table) but SM Global
 * never moves, discards or writes on a lead: each office does. Optional filter by office.
 */
export function GlobalFunnelPage() {
  const { t } = useTranslation();
  const [officeId, setOfficeId] = useState<string>(ALL);
  const [view, setView] = useState<"board" | "table">("board");
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  const leadsQ = useLeads(officeId === ALL ? undefined : officeId);
  const officesQ = useOffices();
  const usersQ = useUsers();
  const header = <GlobalHeader question={t("global.funnel.question")} />;
  const queries = [leadsQ, officesQ, usersQ];

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
  const offices = officesQ.data ?? [];
  const consultantName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const selected = leads.find((l) => l.id === leadId);

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
        <Select value={officeId} onValueChange={setOfficeId}>
          <SelectTrigger aria-label={t("global.funnel.office")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", officeId !== ALL && "border-ring")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("global.funnel.all_offices")}</SelectItem>
            {offices.map((o) => <SelectItem key={o.office.id} value={o.office.id}>{o.office.name}</SelectItem>)}
          </SelectContent>
        </Select>
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
          {leadId && <LeadDetail readOnly leadId={leadId} onClose={() => setLeadId(undefined)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
