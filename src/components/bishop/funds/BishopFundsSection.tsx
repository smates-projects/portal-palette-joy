import { useTranslation } from "react-i18next";
import { useMyFunds } from "@/lib/api/hooks";
import { FundsBody } from "@/components/funds/FundsPanel";
import { DistributionSection } from "@/components/funds/DistributionSection";
import { Amount, FundsStatusBadge } from "@/components/funds/parts";
import { Panel } from "@/components/bishop/ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Bishop's own money: for each business he funds, what he paid SM (with "Subir comprobante") and, read only,
 * how SM distributes it to the firms. Used in Acuerdos (expanded) and in Portafolio (one row per business).
 */
export function BishopFundsSection({ variant }: { variant: "agreements" | "portfolio" }) {
  const { t } = useTranslation();
  const q = useMyFunds();
  const title = t(variant === "agreements" ? "funds.bishop.agreements_title" : "funds.bishop.portfolio_title");

  if (q.isLoading) return <Skeleton className="h-32 rounded-md" />;
  if (q.isError)
    return (
      <Panel title={title}>
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          {t("funds.error")} <button onClick={() => void q.refetch()} className="text-link hover:underline">{t("funds.retry")}</button>
        </p>
      </Panel>
    );
  const list = q.data ?? [];

  return (
    <Panel title={title}>
      {list.length === 0 ? (
        <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("funds.bishop.empty")}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {list.map((f) => (
            <li key={f.business_id} className="px-4 py-3">
              <details open={variant === "agreements" && !f.program_started}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-48 flex-1 text-sm font-medium">{f.business_name}</span>
                  <FundsStatusBadge status={f.status} />
                  <span className="text-sm">
                    <Amount value={f.received} className="font-semibold" /> <span className="text-muted-foreground">{t("funds.of_total")}</span> <Amount value={f.total} />
                  </span>
                  <span className="text-xs text-link">{t(f.program_started ? "funds.bishop.in_program" : "funds.bishop.see")}</span>
                </summary>
                <div className="mt-3 space-y-4">
                  <FundsBody funds={f} mode="bishop" />
                  {f.program_started && (
                    <div>
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("funds.dist.title")}</h4>
                      <DistributionSection businessId={f.business_id} readOnly />
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{t("funds.bishop.read_only")}</p>
    </Panel>
  );
}
