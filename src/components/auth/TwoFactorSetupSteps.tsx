import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@/components/ui/button";
import { useConfirmTwoFactor, useTwoFactorSetup } from "@/lib/api/hooks";
import { DEMO_TOTP_CODE } from "@/lib/api/mock/session";
import { TOTP_CODE_LENGTH } from "@/lib/api/types";
import { authErrorCode, focusFirstError } from "@/lib/auth/form";
import { cleanTotpInput, groupSecret, isCompleteTotp } from "@/lib/auth/two-factor";
import { cn } from "@/lib/utils";
import { AuthField, FormAlert, PendingState, SubmitButton } from "./AuthFields";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "");

/**
 * Turning TOTP on, in two parts: add the account to the authenticator app (secret as text in groups of 4 plus the
 * otpauth:// link; the repo has no QR library) and confirm with the first code; then the recovery codes, shown once.
 * Used by /activar-verificacion (with or without a setup token) and inline in Mi perfil (signed in, no token).
 */
export function TwoFactorSetupSteps({
  setupToken,
  onFinished,
}: {
  /** The token of a 202 setup-required sign-in; null when the person is signed in. */
  setupToken: string | null;
  /** After "Ya los guardé, continuar". */
  onFinished: () => void;
}) {
  const { t } = useTranslation();
  const setup = useTwoFactorSetup(setupToken);
  const confirm = useConfirmTwoFactor();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<"invalid_code" | "generic" | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  // The confirm answered the token is gone: the same screen as a setup that could not start.
  const tokenGone =
    (setup.isError && authErrorCode(setup.error) === "setup_token_invalid") ||
    (confirm.isError && authErrorCode(confirm.error) === "setup_token_invalid");

  if (recoveryCodes) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(recoveryCodes.join("\n"));
        setCopyState("copied");
      } catch {
        setCopyState("failed");
      }
    };
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("auth.two_factor_setup.codes_title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auth.two_factor_setup.codes_body")}
          </p>
        </div>
        <ul
          aria-label={t("auth.two_factor_setup.codes_list_label")}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-border bg-border font-mono text-sm"
        >
          {recoveryCodes.map((recovery) => (
            <li key={recovery} className="bg-surface px-3 py-2 text-center text-foreground">
              {recovery}
            </li>
          ))}
        </ul>
        {copyState === "copied" && (
          <FormAlert tone="success" title={t("auth.two_factor_setup.copied")} />
        )}
        {copyState === "failed" && (
          <FormAlert tone="error" title={t("auth.two_factor_setup.copy_failed")} />
        )}
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copy()}
            className="h-10 w-full rounded-[4px]"
          >
            {t("auth.two_factor_setup.copy")}
          </Button>
          <Button type="button" onClick={onFinished} className="h-10 w-full rounded-[4px]">
            {t("auth.two_factor_setup.done")}
          </Button>
        </div>
      </div>
    );
  }

  if (tokenGone || (setup.isError && errorMessage(setup.error) === "unauthenticated")) {
    return (
      <div className="space-y-4">
        <FormAlert
          tone="error"
          title={
            tokenGone
              ? t("auth.two_factor_setup.token_invalid_title")
              : t("auth.two_factor.missing_title")
          }
        >
          {tokenGone
            ? t("auth.two_factor_setup.token_invalid_body")
            : t("auth.two_factor.missing_body")}
        </FormAlert>
        <Link to="/login" className={cn(buttonVariants(), "h-10 w-full rounded-[4px]")}>
          {t("auth.two_factor.restart")}
        </Link>
      </div>
    );
  }

  if (setup.isError) {
    const already = errorMessage(setup.error) === "two_factor_already_enabled";
    return (
      <div className="space-y-4">
        <FormAlert
          tone={already ? "success" : "error"}
          title={already ? t("auth.two_factor_setup.already_enabled") : t("auth.errors.generic")}
        >
          {already ? undefined : t("auth.errors.generic_help")}
        </FormAlert>
        {!already && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void setup.refetch()}
            className="h-10 w-full rounded-[4px]"
          >
            {t("errors.retry")}
          </Button>
        )}
      </div>
    );
  }

  if (!setup.data) return <PendingState label={t("auth.two_factor_setup.loading")} />;
  const { secret, otpauth_url: otpauthUrl } = setup.data;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanTotpInput(code);
    if (!isCompleteTotp(clean)) {
      setFieldError(t("auth.two_factor.code_required", { digits: TOTP_CODE_LENGTH }));
      setServerError(null);
      return setFailedAttempt((n) => n + 1);
    }
    setFieldError(null);
    setServerError(null);
    confirm.mutate(
      { code: clean, setupToken },
      {
        onSuccess: (answer) => setRecoveryCodes(answer.recovery_codes),
        onError: (err) => {
          const errorCode = authErrorCode(err);
          if (errorCode === "setup_token_invalid") return;
          setCode("");
          setServerError(errorCode === "invalid_code" ? "invalid_code" : "generic");
          setFailedAttempt((n) => n + 1);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t("auth.two_factor_setup.step_app_title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("auth.two_factor_setup.step_app_body")}</p>
        <div className="rounded-[4px] border border-border px-3.5 py-3">
          <p className="text-xs text-muted-foreground">{t("auth.two_factor_setup.secret_label")}</p>
          <p className="mt-1 break-all font-mono text-base font-medium tracking-wide text-foreground">
            {groupSecret(secret)}
          </p>
        </div>
        <a
          href={otpauthUrl}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          {t("auth.two_factor_setup.open_app")}
        </a>
        <p className="text-xs text-muted-foreground">{t("auth.two_factor_setup.open_app_hint")}</p>
      </section>

      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        className="space-y-4 border-t border-border pt-5"
      >
        <h2 className="text-sm font-semibold text-foreground">
          {t("auth.two_factor_setup.step_code_title")}
        </h2>
        {serverError === "invalid_code" && (
          <FormAlert tone="error" title={t("auth.two_factor.invalid_code")}>
            {t("auth.two_factor.invalid_code_help")}
          </FormAlert>
        )}
        {serverError === "generic" && (
          <FormAlert tone="error" title={t("auth.errors.generic")}>
            {t("auth.errors.generic_help")}
          </FormAlert>
        )}
        <AuthField
          id="setup-code"
          label={t("auth.two_factor.code_label")}
          value={code}
          onChange={(value) => setCode(cleanTotpInput(value))}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={TOTP_CODE_LENGTH}
          code
          error={fieldError}
          invalid={serverError === "invalid_code"}
          disabled={confirm.isPending}
          hint={
            <>
              {t("auth.two_factor.code_hint")}
              {import.meta.env.DEV && (
                <> {t("auth.two_factor.demo_hint", { code: DEMO_TOTP_CODE })}</>
              )}
            </>
          }
        />
        <SubmitButton
          pending={confirm.isPending}
          label={t("auth.two_factor_setup.submit")}
          pendingLabel={t("auth.two_factor_setup.pending")}
        />
      </form>
    </div>
  );
}
