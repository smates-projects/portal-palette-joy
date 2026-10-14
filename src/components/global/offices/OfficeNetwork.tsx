import { useTranslation } from "react-i18next";
import { TODAY } from "@/config/app";
import { useBusinesses, useRules, useTasks, useVersions } from "@/lib/api/hooks";
import { AREAS, type Health } from "@/lib/tasks/owner";
import { buildNetworkMatrix } from "@/lib/tasks/sm";
import { cn } from "@/lib/utils";
import { DOT } from "@/components/office/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBox, ErrorBox } from "../shared";

/** The Red of one office, read only: business by area health. Global looks, the office works. */
export function OfficeNetwork({ officeId, onOpenBusiness }: { officeId: string; onOpenBusiness: (businessId: string) => void }) {
  const { t } = useTranslation();
  const bizQ = useBusinesses();
  const tasksQ = useTasks();
  const versionsQ = useVersions();
  const rulesQ = useRules();
  const queries = [bizQ, tasksQ, versionsQ, rulesQ];

  if (queries.some((q) => q.isError)) return <ErrorBox onRetry={() => queries.forEach((q) => void q.refetch())} />;
  if (queries.some((q) => q.isLoading)) return <Skeleton className="h-48 rounded-md" />;

  const businesses = (bizQ.data ?? []).filter((b) => b.office_id === officeId && b.status === "in_program");
  if (businesses.length === 0) return <EmptyBox title={t("global.office.network_empty_title")} body={t("global.office.network_empty_body")} />;
  const tasks = (tasksQ.data ?? []).filter((x) => x.status !== "cancelled");
  const rows = buildNetworkMatrix(tasks, versionsQ.data ?? [], businesses, TODAY, rulesQ.data?.area_amber_days);

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t("sm.matrix_title")}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t("sm.matrix_business")}</th>
              {AREAS.map((a) => (
                <th key={a} className="px-2 py-2 text-center font-medium">
                  <span className="block font-display text-foreground">{a}</span>
                  <span className="block truncate text-[11px] font-normal">{t(`areas.${a}`)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.business.id}>
                <td className="px-4 py-2.5">
                  <button onClick={() => onOpenBusiness(row.business.id)} className="flex items-center gap-2 text-left hover:underline">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[row.health])} />
                    <span>
                      <span className="block font-medium">{row.business.name}</span>
                      <span className="block text-xs text-muted-foreground">{t("sm.program_day", { day: row.business.program_day })}</span>
                    </span>
                  </button>
                </td>
                {row.cells.map((c) => {
                  const label = t(`sm.health.${c.health}`);
                  return (
                    <td key={c.area} className="px-2 py-2.5 text-center" title={`${label} · ${t("sm.cell_detail", { open: c.open, overdue: c.overdue })}`}>
                      <span className="inline-flex h-8 w-full items-center justify-center gap-1.5" aria-label={`${row.business.name} · ${t(`areas.${c.area}`)}: ${label}`}>
                        <span className={cn("h-2.5 w-2.5 rounded-full", DOT[c.health])} />
                        {c.health !== "grey" && <span className="font-display text-xs tabular-nums text-muted-foreground">{c.open}</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {(["green", "amber", "red", "grey"] as Health[]).map((h) => (
          <span key={h} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", DOT[h])} />
            {t(`sm.health.${h}`)}
          </span>
        ))}
      </div>
    </section>
  );
}
