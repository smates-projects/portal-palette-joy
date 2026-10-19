// Small helpers shared by the sign-in screens. The server checks everything again; these only spare a round trip.
import { AUTH_ERROR_CODES, MIN_PASSWORD_LENGTH, type AuthErrorCode } from "@/lib/api/types";

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Email field: null when fine, or the validation key to show under it. */
export function emailProblem(value: string): "email_required" | "email_invalid" | null {
  if (!value.trim()) return "email_required";
  return isValidEmail(value) ? null : "email_invalid";
}

/** New password: null when fine, or the validation key. */
export function newPasswordProblem(value: string): "password_short" | null {
  return value.length < MIN_PASSWORD_LENGTH ? "password_short" : null;
}

/** The repository error as one of the known codes; anything else (network, 500) is "generic". */
export function authErrorCode(error: unknown): AuthErrorCode | "generic" {
  const message = error instanceof Error ? error.message : "";
  return (AUTH_ERROR_CODES as readonly string[]).includes(message)
    ? (message as AuthErrorCode)
    : "generic";
}

/**
 * After a failed submit: focus the first field marked invalid, or the form's error alert when no field is to blame.
 * Called from an effect (after the error is rendered), never at module load.
 */
export function focusFirstError(form: HTMLFormElement | null) {
  const target =
    form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    form?.querySelector<HTMLElement>("[data-auth-alert]");
  target?.focus();
}

export type TokenErrorCode = "token_invalid" | "token_expired" | "token_used";
export const isTokenError = (code: string): code is TokenErrorCode =>
  code === "token_invalid" || code === "token_expired" || code === "token_used";
