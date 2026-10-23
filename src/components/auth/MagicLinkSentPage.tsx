import { Link, useRouterState } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { useLinkLifetimes } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";

/**
 * /enlace-enviado: confirmation after asking for a magic link. Shows the email the person typed (kept in the
 * history state, not in the URL) and never says whether it has an account.
 */
export function MagicLinkSentPage() {
  const { t } = useTranslation();
  const email = useRouterState({ select: (s) => s.location.state.authEmail });
  // How long the link lasts, as the API says (GET /auth/link-lifetimes); the line waits for it.
  const ttl = useLinkLifetimes().data;
  return (
    <AuthLayout>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[4px] border border-border text-primary">
        <Mail aria-hidden className="h-5 w-5" />
      </div>
      <AuthHeading title={t("auth.sent.title")} />
      <div role="status" className="space-y-3 text-sm text-foreground">
        <p>
          {email ? (
            <Trans
              i18nKey="auth.sent.body"
              values={{ email }}
              components={{ email: <strong className="break-all font-semibold" /> }}
            />
          ) : (
            t("auth.sent.body_no_email")
          )}
        </p>
        {ttl && <p className="text-muted-foreground">{t("auth.sent.rules", { minutes: ttl.magic_link_minutes })}</p>}
        <p className="text-muted-foreground">{t("auth.sent.spam")}</p>
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
        <Link
          to="/login"
          state={{ authEmail: email }}
          className={cn(buttonVariants(), "h-10 rounded-[4px]")}
        >
          {t("auth.back_to_login")}
        </Link>
        <Link
          to="/login"
          search={{ mode: "magic" }}
          state={{ authEmail: email }}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[4px]")}
        >
          {t("auth.magic_exchange.request_new")}
        </Link>
      </div>
    </AuthLayout>
  );
}
