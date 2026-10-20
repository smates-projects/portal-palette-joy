import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useLogin, useRequestMagicLink } from "@/lib/api/hooks";
import { DEMO_PASSWORD } from "@/lib/api/mock";
import { authErrorCode, emailProblem, focusFirstError } from "@/lib/auth/form";
import { nextStepAfterSignIn } from "@/lib/auth/two-factor";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { AuthField, FormAlert, SubmitButton, TextButton } from "./AuthFields";

type Mode = "password" | "magic";
type ServerError = "invalid_credentials" | "account_inactive" | "generic";

/**
 * /login: email and password, or (same card) only the email for a magic link. A failed login always says what
 * happened under the form, never only in a toast. After success it goes to ?next= when it is a path of this app.
 */
export function LoginPage({
  next,
  initialMode = "password",
}: {
  next?: string | undefined;
  initialMode?: Mode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notice = useRouterState({ select: (s) => s.location.state.authNotice });
  const rememberedEmail = useRouterState({ select: (s) => s.location.state.authEmail });
  const login = useLogin();
  const magic = useRequestMagicLink();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email: string | null; password: string | null }>(
    { email: null, password: null },
  );
  const [serverError, setServerError] = useState<ServerError | null>(null);
  // Bumped on every failed submit so the effect moves focus to the first error once it is on screen.
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const switchMode = (to: Mode) => {
    setMode(to);
    setFieldErrors({ email: null, password: null });
    setServerError(null);
    // The email stays: the person does not type it twice.
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  const fail = (
    errors: { email: string | null; password: string | null },
    server: ServerError | null = null,
  ) => {
    setFieldErrors(errors);
    setServerError(server);
    setFailedAttempt((n) => n + 1);
  };

  const submitPassword = () => {
    const emailKey = emailProblem(email);
    const errors = {
      email: emailKey ? t(`auth.validation.${emailKey}`) : null,
      password: password ? null : t("auth.validation.password_required"),
    };
    if (errors.email || errors.password) return fail(errors);
    setFieldErrors({ email: null, password: null });
    setServerError(null);
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (result) => {
          // Signed in, or one more step: the code of the authenticator app, or turning it on first.
          const step = nextStepAfterSignIn(result, next);
          if (step.kind === "signed_in") return void navigate({ href: step.href, replace: true });
          void navigate({ to: step.to, search: step.search, state: step.state });
        },
        onError: (err) => {
          const code = authErrorCode(err);
          if (code === "invalid_credentials") {
            // Keep the email, clear the password and point at it: the most common slip.
            setPassword("");
            return fail({ email: null, password: null }, "invalid_credentials");
          }
          fail(
            { email: null, password: null },
            code === "account_inactive" ? "account_inactive" : "generic",
          );
        },
      },
    );
  };

  const submitMagic = () => {
    const emailKey = emailProblem(email);
    if (emailKey) return fail({ email: t(`auth.validation.${emailKey}`), password: null });
    setFieldErrors({ email: null, password: null });
    setServerError(null);
    const clean = email.trim();
    magic.mutate(clean, {
      onSuccess: () => void navigate({ to: "/enlace-enviado", state: { authEmail: clean } }),
      onError: () => fail({ email: null, password: null }, "generic"),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "password") submitPassword();
    else submitMagic();
  };

  const pending = login.isPending || magic.isPending;

  return (
    <AuthLayout>
      <AuthHeading
        title={mode === "password" ? t("auth.login.title") : t("auth.magic.title")}
        subtitle={mode === "password" ? t("auth.login.subtitle") : t("auth.magic.subtitle")}
      />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
        {notice === "password_reset" && !serverError && (
          <FormAlert tone="success" title={t("auth.login.reset_done")} />
        )}
        {notice === "two_factor_enabled" && !serverError && (
          <FormAlert tone="success" title={t("auth.login.two_factor_enabled")} />
        )}
        {notice === "two_factor_restart" && !serverError && (
          <FormAlert tone="error" title={t("auth.login.two_factor_restart")}>
            {t("auth.login.two_factor_restart_help")}
          </FormAlert>
        )}
        {serverError === "invalid_credentials" && (
          <FormAlert tone="error" title={t("auth.errors.invalid_credentials")}>
            {t("auth.errors.invalid_credentials_help")}
          </FormAlert>
        )}
        {serverError === "account_inactive" && (
          <FormAlert tone="error" title={t("auth.errors.account_inactive")}>
            {t("auth.errors.account_inactive_help")}
          </FormAlert>
        )}
        {serverError === "generic" && (
          <FormAlert tone="error" title={t("auth.errors.generic")}>
            {t("auth.errors.generic_help")}
          </FormAlert>
        )}

        <AuthField
          ref={emailRef}
          id="email"
          type="email"
          autoComplete="email"
          label={t("auth.fields.email")}
          placeholder={t("auth.fields.email_placeholder")}
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          disabled={pending}
        />
        {mode === "password" && (
          <AuthField
            id="password"
            type="password"
            autoComplete="current-password"
            label={t("auth.fields.password")}
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            invalid={serverError === "invalid_credentials"}
            disabled={pending}
            // Development only: the seeded accounts' password. Never rendered in a production build.
            hint={
              import.meta.env.DEV
                ? t("auth.login.demo_hint", { password: DEMO_PASSWORD })
                : undefined
            }
          />
        )}

        {mode === "password" ? (
          <SubmitButton
            pending={login.isPending}
            label={t("auth.login.submit")}
            pendingLabel={t("auth.login.pending")}
          />
        ) : (
          <SubmitButton
            pending={magic.isPending}
            label={t("auth.magic.submit")}
            pendingLabel={t("auth.magic.pending")}
          />
        )}
      </form>

      <div className="mt-6 flex flex-col items-start gap-3 border-t border-border pt-5">
        {mode === "password" ? (
          <>
            <Link
              to="/recuperar"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("auth.login.forgot")}
            </Link>
            <TextButton onClick={() => switchMode("magic")}>{t("auth.login.use_magic")}</TextButton>
          </>
        ) : (
          <TextButton onClick={() => switchMode("password")}>
            {t("auth.magic.use_password")}
          </TextButton>
        )}
      </div>
    </AuthLayout>
  );
}
