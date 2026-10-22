import type { ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/lib/api/hooks";
import { isApiError } from "@/lib/api/http/client";
import { loginSearchFor } from "@/lib/auth/redirect";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { Logo } from "@/components/brand/Logo";

/**
 * Nothing of the portal (rail, top bar, role views) renders until GET /me answers:
 * - pending: the brand loader, and only after 200 ms so a fast answer never flashes it;
 * - 401: straight to /login, the portal never shows for an instant;
 * - a network or server failure: a plain screen with a retry, never a view with a default role.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const href = useRouterState({ select: (s) => s.location.href });

  if (me.isPending) return <BrandLoader />;
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401)
      return <Navigate to="/login" search={loginSearchFor(href)} replace />;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <Logo variant="isotype" className="h-[72px] w-[72px]" />
        <p className="max-w-sm text-sm text-muted-foreground">{t("errors.connection_body")}</p>
        <button
          onClick={() => void me.refetch()}
          className="inline-flex items-center justify-center rounded-[4px] bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {t("errors.connection_retry")}
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
