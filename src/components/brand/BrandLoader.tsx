import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";

/**
 * The only screen while the portal finds out who is signing in (GET /me): white, the isotype spinning like a coin
 * and a thin gold line filling left to right in a loop. With reduced motion, a soft opacity pulse instead of the
 * spin. No spinner, no visible text.
 * `delayMs` (200 by default) keeps a fast answer from flashing the loader: nothing renders until then. The SSR
 * frame uses `immediate`, so the server already sends the loader instead of an empty portal.
 */
export function BrandLoader({ delayMs = 200, immediate = false }: { delayMs?: number; immediate?: boolean }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(immediate || delayMs <= 0);
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [visible, delayMs]);
  if (!visible) return null;
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-7 bg-background" role="status" aria-label={t("app.loading")}>
      <div style={{ perspective: "320px" }}>
        <Logo variant="isotype" className="brand-loader-coin h-[72px] w-[72px] drop-shadow-sm" />
      </div>
      <div className="h-0.5 w-28 overflow-hidden rounded-full bg-muted">
        <div className="brand-loader-line h-full w-full bg-gold" />
      </div>
    </div>
  );
}
