import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import { useRecoverTwoFactor, useVerifyTwoFactor } from "@/lib/api/hooks";
import { DEMO_TOTP_CODE } from "@/lib/api/mock/session";
import { isMockRepository } from "@/lib/api/mode";
import { TOTP_CODE_LENGTH } from "@/lib/api/types";
import { authErrorCode, focusFirstError } from "@/lib/auth/form";
import { safeNextPath } from "@/lib/auth/redirect";
import { cleanTotpInput, isCompleteTotp } from "@/lib/auth/two-factor";
import { cn } from "@/lib/utils";
import { AuthHeading, AuthLayout } from "./AuthLayout";
import { AuthField, BackToLogin, FormAlert, SubmitButton, TextButton } from "./AuthFields";

type Mode = "totp" | "recovery";
type ServerError = "invalid_code" | "generic";

/**
 * /verificacion: second step of a sign-in with TOTP. The challenge comes in the history state (or ?challenge= as a
 * fallback). The 6-digit code, or one recovery code; both start the session and go to ?next= or home. TOTP has no
 * "resend": the code changes every 30 seconds in the app.
 */
export function VerifyTwoFactorPage({
  next,
  challengeFromSearch,
}: {
  next?: string | undefined;
  challengeFromSearch?: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const challengeFromState = useRouterState({
    select: (s) => s.location.state.twoFactorChallenge,
  });
  const challengeId = challengeFromState ?? challengeFromSearch ?? null;
  const verify = useVerifyTwoFactor();
  const recover = useRecoverTwoFactor();

  const [mode, setMode] = useState<Mode>("totp");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  /** The challenge is gone (used, unknown or expired): the only way on is signing in again. */
  const [challengeGone, setChallengeGone] = useState<
    "challenge_invalid" | "challenge_expired" | null
  >(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const safeNext = safeNextPath(next);
  const restartSearch = safeNext ? { next: safeNext } : {};

  if (!challengeId || challengeGone) {
    const title = !challengeId
      ? t("auth.two_factor.missing_title")
      : challengeGone === "challenge_expired"
        ? t("auth.two_factor.challenge_expired")
        : t("auth.two_factor.challenge_invalid");
    const body = !challengeId
      ? t("auth.two_factor.missing_body")
      : t("auth.two_factor.challenge_help");
    return (
      <AuthLayout>
        <AuthHeading title={t("auth.two_factor.title")} />
        <FormAlert tone="error" title={title}>
          {body}
        </FormAlert>
        <div className="mt-6 border-t border-border pt-5">
          <Link
            to="/login"
            search={restartSearch}
            className={cn(buttonVariants(), "h-10 w-full rounded-[4px]")}
          >
            {t("auth.two_factor.restart")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const switchMode = (to: Mode) => {
    setMode(to);
    setCode("");
    setFieldError(null);
    setServerError(null);
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const fail = (field: string | null, server: ServerError | null = null) => {
    setFieldError(field);
    setServerError(server);
    setFailedAttempt((n) => n + 1);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = mode === "totp" ? cleanTotpInput(code) : code.trim();
    if (mode === "totp" && !isCompleteTotp(clean))
      return fail(t("auth.two_factor.code_required", { digits: TOTP_CODE_LENGTH }));
    if (mode === "recovery" && !clean) return fail(t("auth.two_factor.recovery_required"));
    setFieldError(null);
    setServerError(null);
    const mutation = mode === "totp" ? verify : recover;
    mutation.mutate(
      { challenge_id: challengeId, code: clean },
      {
        onSuccess: () => void navigate({ href: safeNext ?? "/", replace: true }),
        onError: (err) => {
          const errorCode = authErrorCode(err);
          if (errorCode === "invalid_code") {
            setCode("");
            return fail(null, "invalid_code");
          }
          if (errorCode === "challenge_invalid" || errorCode === "challenge_expired")
            return setChallengeGone(errorCode);
          fail(null, "generic");
        },
      },
    );
  };

  const pending = verify.isPending || recover.isPending;

  return (
    <AuthLayout>
      <AuthHeading
        title={mode === "totp" ? t("auth.two_factor.title") : t("auth.two_factor.recovery_title")}
        subtitle={
          mode === "totp" ? t("auth.two_factor.subtitle") : t("auth.two_factor.recovery_subtitle")
        }
      />
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError === "invalid_code" && (
          <FormAlert tone="error" title={t("auth.two_factor.invalid_code")}>
            {mode === "totp"
              ? t("auth.two_factor.invalid_code_help")
              : t("auth.two_factor.invalid_recovery_help")}
          </FormAlert>
        )}
        {serverError === "generic" && (
          <FormAlert tone="error" title={t("auth.errors.generic")}>
            {t("auth.errors.generic_help")}
          </FormAlert>
        )}
        {mode === "totp" ? (
          <AuthField
            ref={codeRef}
            id="totp-code"
            label={t("auth.two_factor.code_label")}
            value={code}
            onChange={(value) => setCode(cleanTotpInput(value))}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={TOTP_CODE_LENGTH}
            code
            error={fieldError}
            invalid={serverError === "invalid_code"}
            disabled={pending}
            hint={
              <>
                {t("auth.two_factor.code_hint")}
                {/* Demo only: the mock's fixed code. Never rendered when the session talks to the real API. */}
                {isMockRepository("session") && (
                  <> {t("auth.two_factor.demo_hint", { code: DEMO_TOTP_CODE })}</>
                )}
              </>
            }
          />
        ) : (
          <AuthField
            ref={codeRef}
            id="recovery-code"
            label={t("auth.two_factor.recovery_label")}
            value={code}
            onChange={setCode}
            autoComplete="off"
            code
            error={fieldError}
            invalid={serverError === "invalid_code"}
            disabled={pending}
            hint={t("auth.two_factor.recovery_hint")}
          />
        )}
        <SubmitButton
          pending={pending}
          label={
            mode === "totp" ? t("auth.two_factor.submit") : t("auth.two_factor.recovery_submit")
          }
          pendingLabel={t("auth.two_factor.pending")}
        />
      </form>
      <div className="mt-6 flex flex-col items-start gap-3 border-t border-border pt-5">
        {mode === "totp" ? (
          <TextButton onClick={() => switchMode("recovery")}>
            {t("auth.two_factor.use_recovery")}
          </TextButton>
        ) : (
          <TextButton onClick={() => switchMode("totp")}>{t("auth.two_factor.use_app")}</TextButton>
        )}
        <BackToLogin />
      </div>
    </AuthLayout>
  );
}
