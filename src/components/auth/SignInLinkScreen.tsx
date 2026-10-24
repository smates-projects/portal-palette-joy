import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import type { SignInResult } from "@/lib/api/types";
import { authErrorCode, isTokenError } from "@/lib/auth/form";
import { nextStepAfterSignIn } from "@/lib/auth/two-factor";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { BackToLogin, FormAlert, PendingState } from "./AuthFields";

/**
 * Shared screen of the single-use sign-in links (magic link, owner entry link): uses the link as soon as the page
 * opens, then goes where the link points (`next`, a path of this app, checked by nextStepAfterSignIn) or home, or to
 * the two-factor step keeping it. On error, says why and offers a new link.
 */
export function SignInLinkScreen({
  exchange,
  next,
  title,
  pendingLabel,
  expiredHelp,
}: {
  exchange: UseQueryResult<SignInResult>;
  /** Where to land once signed in (an entry link's ?siguiente=); anything outside this app is ignored. */
  next?: string | undefined;
  title: string;
  pendingLabel: string;
  /** Help under an expired or used link. */
  expiredHelp: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const result = exchange.data;

  useEffect(() => {
    if (!result) return;
    const step = nextStepAfterSignIn(result, next);
    if (step.kind === "signed_in") void navigate({ href: step.href, replace: true });
    else void navigate({ to: step.to, search: step.search, state: step.state, replace: true });
  }, [result, navigate, next]);

  if (!exchange.isError) {
    return (
      <AuthLayout>
        <AuthHeading title={title} />
        <PendingState label={pendingLabel} />
      </AuthLayout>
    );
  }

  const code = authErrorCode(exchange.error);
  const alertTitle = isTokenError(code)
    ? t(`auth.token.${code}`)
    : code === "account_inactive"
      ? t("auth.errors.account_inactive")
      : t("auth.errors.generic");
  const help =
    code === "token_invalid"
      ? t("auth.token.invalid_help")
      : code === "account_inactive"
        ? t("auth.magic_exchange.inactive_help")
        : isTokenError(code)
          ? expiredHelp
          : t("auth.errors.generic_help");

  return (
    <AuthLayout>
      <AuthHeading title={title} />
      <FormAlert tone="error" title={alertTitle}>
        {help}
      </FormAlert>
      <div className="mt-6 flex flex-col items-start gap-4 border-t border-border pt-5">
        {code !== "account_inactive" && (
          <Link
            to="/login"
            search={{ mode: "magic" }}
            className={cn(buttonVariants(), "h-10 w-full rounded-[4px]")}
          >
            {t("auth.magic_exchange.request_new")}
          </Link>
        )}
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
