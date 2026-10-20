import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { safeNextPath } from "@/lib/auth/redirect";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { BackToLogin } from "./AuthFields";
import { TwoFactorSetupSteps } from "./TwoFactorSetupSteps";

/**
 * /activar-verificacion: turns TOTP on. After a 202 setup-required sign-in the setup token comes in the history
 * state (never in the URL) and no session exists: once confirmed the token is used up, so the person signs in again
 * with password and code. Signed in (no token), it goes back to ?next= or to Mi perfil.
 */
export function SetupTwoFactorPage({ next }: { next?: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setupToken = useRouterState({ select: (s) => s.location.state.setupToken }) ?? null;
  const safeNext = safeNextPath(next);

  const onFinished = () => {
    if (setupToken)
      return void navigate({
        to: "/login",
        search: safeNext ? { next: safeNext } : {},
        state: { authNotice: "two_factor_enabled" },
        replace: true,
      });
    void navigate({ href: safeNext ?? "/perfil", replace: true });
  };

  return (
    <AuthLayout>
      <AuthHeading
        title={t("auth.two_factor_setup.title")}
        subtitle={
          setupToken
            ? t("auth.two_factor_setup.required_note")
            : t("auth.two_factor_setup.subtitle")
        }
      />
      <TwoFactorSetupSteps setupToken={setupToken} onFinished={onFinished} />
      <div className="mt-6 border-t border-border pt-5">
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
