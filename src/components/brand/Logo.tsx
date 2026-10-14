import horizontal from "@/assets/sm-logo-horizontal.png.asset.json";
import isotype from "@/assets/sm-isotype.png.asset.json";
import { cn } from "@/lib/utils";

/**
 * Official Strategic Mates marks. Never distort or recolor.
 * - "isotype": gold tower; the only mark allowed on the blue rail.
 * - "horizontal": only on white backgrounds (no negative version exists yet).
 */
export function Logo({ variant, className }: { variant: "horizontal" | "isotype"; className?: string }) {
  const src = variant === "horizontal" ? horizontal.url : isotype.url;
  return <img src={src} alt="Strategic Mates" className={cn("object-contain", className)} />;
}
