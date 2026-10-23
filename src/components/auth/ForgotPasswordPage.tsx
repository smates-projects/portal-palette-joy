import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { useForgotPassword, useLinkLifetimes } from "@/lib/api/hooks";
import { emailProblem, focusFirstError } from "@/lib/auth/form";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { AuthField, BackToLogin, FormAlert, SubmitButton, TextButton } from "./AuthFields";

/** /recuperar: asks for the reset email. Always confirms the same way, whether the email has an account or not. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const rememberedEmail = useRouterState({ select: (s) => s.location.state.authEmail });
  const forgot = useForgotPassword();
  const resetMinutes = useLinkLifetimes().data?.password_reset_minutes;
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [generic, setGeneric] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const key = emailProblem(email);
    setGeneric(false);
    if (key) {
      setError(t(`auth.validation.${key}`));
      setFailedAttempt((n) => n + 1);
      return;
    }
    setError(null);
    const clean = email.trim();
    forgot.mutate(clean, {
      onSuccess: () => setSentTo(clean),
      onError: () => {
        setGeneric(true);
        setFailedAttempt((n) => n + 1);
      },
    });
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <AuthHeading title={t("auth.forgot.done_title")} />
        <div role="status" className="text-sm text-foreground">
          <Trans
            i18nKey="auth.forgot.done_body"
            values={{ email: sentTo, minutes: resetMinutes ?? "…" }}
            components={{ email: <strong className="break-all font-semibold" /> }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("auth.sent.spam")}</p>
        <div className="mt-6 flex flex-col items-start gap-3 border-t border-border pt-5">
          <BackToLogin />
          <TextButton onClick={() => setSentTo(null)}>{t("auth.forgot.other_email")}</TextButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeading title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")} />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
        {generic && (
          <FormAlert tone="error" title={t("auth.errors.generic")}>
            {t("auth.errors.generic_help")}
          </FormAlert>
        )}
        <AuthField
          id="email"
          type="email"
          autoComplete="email"
          label={t("auth.fields.email")}
          placeholder={t("auth.fields.email_placeholder")}
          value={email}
          onChange={setEmail}
          error={error}
          disabled={forgot.isPending}
        />
        <SubmitButton
          pending={forgot.isPending}
          label={t("auth.forgot.submit")}
          pendingLabel={t("auth.forgot.pending")}
        />
      </form>
      <div className="mt-6 border-t border-border pt-5">
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
