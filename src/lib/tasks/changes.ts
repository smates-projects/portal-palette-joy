import type { TFunction } from "i18next";
import type { TaskChange } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";

/** One sentence for an SM change, shared by the task Activity and the firm's notification. */
export function describeChange(change: TaskChange, name: string, t: TFunction, lng: string): string {
  switch (change.field) {
    case "due_date":
      return t("changes.due_date", {
        name,
        from: change.from ? formatShortDate(change.from, lng) : "",
        to: change.to ? formatShortDate(change.to, lng) : "",
      });
    case "step":
      return t("changes.step", { name, from: change.from ? t(`steps.${change.from}`) : "", to: change.to ? t(`steps.${change.to}`) : "" });
    case "assignee":
      return t("changes.assignee", { name, from: change.from ?? "", to: change.to ?? "" });
    case "cancelled":
      return t("changes.cancelled", { name });
  }
}
