import { cn } from "@/lib/utils";

/**
 * Official Strategic Mates marks, served from public/brand so they work on any host (not only Lovable's CDN).
 * Never distort or recolor.
 * - "isotype": gold tower; the only mark allowed on the blue rail.
 * - "horizontal": only on white backgrounds (no negative version exists yet).
 */
const SRC = { horizontal: "/brand/sm-logo-horizontal.png", isotype: "/brand/sm-isotype.png" } as const;

export function Logo({ variant, className }: { variant: "horizontal" | "isotype"; className?: string }) {
  return <img src={SRC[variant]} alt="Strategic Mates" className={cn("object-contain", className)} />;
}
