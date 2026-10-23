import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { useLinkLifetimes, useResetPassword } from "@/lib/api/hooks";
import { MIN_PASSWORD_LENGTH } from "@/lib/api/types";
import {
  authErrorCode,
  focusFirstError,
  isTokenError,
  newPasswordProblem,
  type TokenErrorCode,
} from "@/lib/auth/form";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { AuthField, BackToLogin, FormAlert, PasswordHint, SubmitButton } from "./AuthFields";

/** /restablecer/$token: new password twice. On success, back to /login with a note; the person signs in again. */
export function ResetPasswordPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reset = useResetPassword();
  const resetMinutes = useLinkLifetimes().data?.password_reset_minutes;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password: string | null; confirm: string | null }>({
    password: null,
    confirm: null,
  });
  const [tokenError, setTokenError] = useState<TokenErrorCode | null>(null);
  const [generic, setGeneric] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const shortMessage = t("auth.validation.password_short", { min: MIN_PASSWORD_LENGTH });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setGeneric(false);
    const next = {
      password: newPasswordProblem(password) ? shortMessage : null,
      confirm:
        !newPasswordProblem(password) && confirm !== password
          ? t("auth.validation.password_mismatch")
          : null,
    };
    setErrors(next);
    if (next.password || next.confirm) return setFailedAttempt((n) => n + 1);
    reset.mutate(
      { token, password },
      {
        onSuccess: () =>
          void navigate({ to: "/login", replace: true, state: { authNotice: "password_reset" } }),
        onError: (err) => {
          const code = authErrorCode(err);
          if (isTokenError(code)) return setTokenError(code);
          if (code === "weak_password") setErrors({ password: shortMessage, confirm: null });
          else setGeneric(true);
          setFailedAttempt((n) => n + 1);
        },
      },
    );
  };

  if (tokenError) {
    return (
      <AuthLayout>
        <AuthHeading title={t("auth.reset.title")} />
        <FormAlert tone="error" title={t(`auth.token.${tokenError}`)}>
          {tokenError === "token_invalid" ? t("auth.token.invalid_help") : t("auth.reset.help", { minutes: resetMinutes ?? "…" })}
        </FormAlert>
        <div className="mt-6 flex flex-col items-start gap-4 border-t border-border pt-5">
          <Link to="/recuperar" className={cn(buttonVariants(), "h-10 w-full rounded-[4px]")}>
            {t("auth.reset.request_new")}
          </Link>
          <BackToLogin />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeading title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")} />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
        {generic && (
          <FormAlert tone="error" title={t("auth.errors.generic")}>
            {t("auth.errors.generic_help")}
          </FormAlert>
        )}
        <AuthField
          id="new-password"
          type="password"
          autoComplete="new-password"
          label={t("auth.fields.new_password")}
          value={password}
          onChange={setPassword}
          error={errors.password}
          hint={<PasswordHint value={password} />}
          disabled={reset.isPending}
        />
        <AuthField
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          label={t("auth.fields.confirm_password")}
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          disabled={reset.isPending}
        />
        <SubmitButton
          pending={reset.isPending}
          label={t("auth.reset.submit")}
          pendingLabel={t("auth.reset.pending")}
        />
      </form>
      <div className="mt-6 border-t border-border pt-5">
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
