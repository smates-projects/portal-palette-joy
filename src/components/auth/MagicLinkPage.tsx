import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { useExchangeMagicLink } from "@/lib/api/hooks";
import { authErrorCode, isTokenError } from "@/lib/auth/form";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { BackToLogin, FormAlert, PendingState } from "./AuthFields";

/** /enlace/$token: uses the magic link as soon as the page opens, then goes home. On error, says why and offers a new one. */
export function MagicLinkPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const exchange = useExchangeMagicLink(token);

  useEffect(() => {
    if (exchange.isSuccess) void navigate({ to: "/", replace: true });
  }, [exchange.isSuccess, navigate]);

  if (!exchange.isError) {
    return (
      <AuthLayout>
        <AuthHeading title={t("auth.magic.title")} />
        <PendingState label={t("auth.magic_exchange.pending")} />
      </AuthLayout>
    );
  }

  const code = authErrorCode(exchange.error);
  const title = isTokenError(code)
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
          ? t("auth.magic_exchange.help")
          : t("auth.errors.generic_help");

  return (
    <AuthLayout>
      <AuthHeading title={t("auth.magic.title")} />
      <FormAlert tone="error" title={title}>
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
