import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { AreaCode } from "@/lib/api/types";
import { areaColorVar, areaTintVar } from "@/lib/tasks/area-color";
import { cn } from "@/lib/utils";

/** Small square in the area color. Decorative: it must always sit next to the area code or name. */
export function AreaSquare({ area, className }: { area: AreaCode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]", className)}
      style={{ backgroundColor: areaColorVar(area) }}
    />
  );
}

/** Inline style for a chip or row that carries its area: left border plus a very soft tint. */
export function areaAccentStyle(area: AreaCode, borderWidth = 3): CSSProperties {
  return {
    borderLeftColor: areaColorVar(area),
    borderLeftWidth: borderWidth,
    backgroundColor: areaTintVar(area),
  };
}

type AreaTagVariant = "code" | "name" | "full";

/**
 * Area identity: square plus label.
 * - code: "B4"
 * - name: "Tecnología"
 * - full: "B4 Tecnología"
 */
export function AreaTag({
  area,
  variant = "full",
  className,
}: {
  area: AreaCode;
  variant?: AreaTagVariant;
  className?: string;
}) {
  const { t } = useTranslation();
  const name = t(`areas.${area}`);
  const label = variant === "code" ? area : variant === "name" ? name : `${area} ${name}`;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <AreaSquare area={area} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Legend of the six areas, for views where colors appear without a label nearby. */
export function AreaLegend({ areas, className }: { areas: AreaCode[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {areas.map((a) => (
        <AreaTag key={a} area={a} />
      ))}
    </div>
  );
}
