import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSetPassword } from "@/lib/api/hooks";
import { MIN_PASSWORD_LENGTH } from "@/lib/api/types";
import { authErrorCode, focusFirstError, newPasswordProblem } from "@/lib/auth/form";
import { cn } from "@/lib/utils";
import { AuthField, FormAlert, PasswordHint, SubmitButton } from "./AuthFields";

type ServerError = "invalid_credentials" | "generic";

/**
 * Create or change the signed-in person's password (POST /me/password). Same rules and hints as the reset screen:
 * at least MIN_PASSWORD_LENGTH characters, typed twice. "change" also asks for the current one. Used by the
 * "Crea tu contraseña" dialog and by Mi perfil.
 */
export function PasswordForm({
  mode,
  submitLabel,
  pendingLabel,
  onSuccess,
  secondary,
  idPrefix = "password-form",
  className,
}: {
  mode: "create" | "change";
  submitLabel: string;
  pendingLabel: string;
  onSuccess: () => void;
  /** Rendered under the submit (for example "Más tarde" or "Cancelar"). */
  secondary?: ReactNode;
  /** Keeps the field ids unique when two forms live on the same page. */
  idPrefix?: string | undefined;
  className?: string | undefined;
}) {
  const { t } = useTranslation();
  const setPassword = useSetPassword();
  const [current, setCurrent] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{
    current: string | null;
    password: string | null;
    confirm: string | null;
  }>({ current: null, password: null, confirm: null });
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [failedAttempt, setFailedAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (failedAttempt > 0) focusFirstError(formRef.current);
  }, [failedAttempt]);

  const shortMessage = t("auth.validation.password_short", { min: MIN_PASSWORD_LENGTH });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const next = {
      current:
        mode === "change" && !current ? t("auth.validation.current_password_required") : null,
      password: newPasswordProblem(password) ? shortMessage : null,
      confirm:
        !newPasswordProblem(password) && confirm !== password
          ? t("auth.validation.password_mismatch")
          : null,
    };
    setErrors(next);
    if (next.current || next.password || next.confirm) return setFailedAttempt((n) => n + 1);
    setPassword.mutate(
      { password, ...(mode === "change" ? { current_password: current } : {}) },
      {
        onSuccess,
        onError: (err) => {
          const code = authErrorCode(err);
          if (code === "weak_password") {
            setErrors({ current: null, password: shortMessage, confirm: null });
          } else if (code === "current_password_required") {
            setErrors({
              current: t("auth.validation.current_password_required"),
              password: null,
              confirm: null,
            });
          } else if (code === "invalid_credentials") {
            // The current password did not match: clear it and point at it.
            setCurrent("");
            setErrors({ current: null, password: null, confirm: null });
            setServerError("invalid_credentials");
          } else {
            setServerError("generic");
          }
          setFailedAttempt((n) => n + 1);
        },
      },
    );
  };

  const pending = setPassword.isPending;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className={cn("space-y-4", className)}
      data-testid={`${idPrefix}-form`}
    >
      {serverError === "invalid_credentials" && (
        <FormAlert tone="error" title={t("auth.errors.current_password_wrong")}>
          {t("auth.errors.current_password_wrong_help")}
        </FormAlert>
      )}
      {serverError === "generic" && (
        <FormAlert tone="error" title={t("auth.errors.generic")}>
          {t("auth.errors.generic_help")}
        </FormAlert>
      )}
      {mode === "change" && (
        <AuthField
          id={`${idPrefix}-current`}
          type="password"
          autoComplete="current-password"
          label={t("auth.fields.current_password")}
          value={current}
          onChange={setCurrent}
          error={errors.current}
          invalid={serverError === "invalid_credentials"}
          disabled={pending}
        />
      )}
      <AuthField
        id={`${idPrefix}-new`}
        type="password"
        autoComplete="new-password"
        label={t("auth.fields.new_password")}
        value={password}
        onChange={setPasswordValue}
        error={errors.password}
        hint={<PasswordHint value={password} />}
        disabled={pending}
      />
      <AuthField
        id={`${idPrefix}-confirm`}
        type="password"
        autoComplete="new-password"
        label={t("auth.fields.confirm_password")}
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
        disabled={pending}
      />
      <SubmitButton pending={pending} label={submitLabel} pendingLabel={pendingLabel} />
      {secondary}
    </form>
  );
}
