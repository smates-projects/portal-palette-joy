import type { TFunction } from "i18next";
import type { Organization } from "@/lib/api/types";
import type { Health } from "@/lib/tasks/owner";

export const DOT: Record<Health, string> = {
  red: "bg-status-danger-fg",
  amber: "bg-status-warning-fg",
  green: "bg-status-success-fg",
  grey: "bg-status-neutral-border",
};
export const TEXT: Record<Health, string> = {
  red: "text-status-danger-fg",
  amber: "text-status-warning-fg",
  green: "text-status-success-fg",
  grey: "text-muted-foreground",
};

/**
 * "Agencia XYZ (marketing)"; the office's own team: "SM Miami (estrategia, equipo propio)"; a partner firm flagged
 * as SM's own team: "SM Miami Finanzas (finanzas y fiscal, equipo propio)".
 */
export const firmName = (t: TFunction, o: Organization | null | undefined) =>
  !o
    ? ""
    : o.kind === "sm"
      ? t("office.firm_internal", { name: o.name })
      : o.internal
        ? t("office.firm_internal_area", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) })
        : t("owner.firm_label", { name: o.name, what: t(`firmWhat.${o.area ?? "B1"}`) });
