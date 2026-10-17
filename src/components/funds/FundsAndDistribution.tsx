import { useTranslation } from "react-i18next";
import { DistributionSection } from "./DistributionSection";
import { FundsPanel } from "./FundsPanel";

/**
 * "Fondos y distribución" of one business: the Bishop funds and how SM distributes them to the firms.
 * Only for SM (office: edits; Global: reads) and the Bishop of that business (reads). Never mount it for owners
 * or firms: the mock answers them "forbidden" anyway.
 */
export function FundsAndDistribution({ businessId, mode }: { businessId: string; mode: "sm" | "read" | "bishop" }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{t("funds.section_title")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t(mode === "bishop" ? "funds.section_hint_bishop" : "funds.section_hint")}</p>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("funds.funds_title")}</h4>
        <FundsPanel businessId={businessId} mode={mode} />
      </div>
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("funds.dist.title")}</h4>
        <DistributionSection businessId={businessId} readOnly={mode !== "sm"} />
      </div>
    </section>
  );
}
