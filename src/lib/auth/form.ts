// Small helpers shared by the sign-in screens. The server checks everything again; these only spare a round trip.
import {
  AUTH_ERROR_CODES,
  MIN_PASSWORD_LENGTH,
  TWO_FACTOR_ERROR_CODES,
  type AuthErrorCode,
  type TwoFactorErrorCode,
} from "@/lib/api/types";

const KNOWN_AUTH_CODES: readonly string[] = [...AUTH_ERROR_CODES, ...TWO_FACTOR_ERROR_CODES];

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
export function authErrorCode(error: unknown): AuthErrorCode | TwoFactorErrorCode | "generic" {
  const message = error instanceof Error ? error.message : "";
  return KNOWN_AUTH_CODES.includes(message)
    ? (message as AuthErrorCode | TwoFactorErrorCode)
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

/** What "Crear mi cuenta" shows for an error of POST /auth/invitations/accept. Texts are locale keys. */
export type AcceptInvitationProblem =
  | { kind: "token"; code: TokenErrorCode }
  | { kind: "field"; field: "name" | "password" | "terms"; key: string }
  /** Another person's session is open in this browser: sign out first. */
  | { kind: "session" }
  | { kind: "alert"; title: string; body: string };

/**
 * Each code the API answers the invitation with, in plain words: the field to fix, the bad link, the open session, or
 * one alert. Only a request that never reached the API asks to check the connection; anything else unknown says the
 * account could not be created and to try again later.
 */
export function acceptInvitationProblem(error: unknown): AcceptInvitationProblem {
  const code = error instanceof Error ? error.message : "";
  if (isTokenError(code)) return { kind: "token", code };
  switch (code) {
    case "weak_password":
      return { kind: "field", field: "password", key: "auth.validation.password_short" };
    case "password_breached":
      return { kind: "field", field: "password", key: "auth.validation.password_breached" };
    case "name_required":
      return { kind: "field", field: "name", key: "auth.validation.name_required" };
    case "terms_required":
      return { kind: "field", field: "terms", key: "auth.validation.terms_required" };
    case "blocked_while_impersonating":
      return { kind: "session" };
    case "account_inactive":
      return {
        kind: "alert",
        title: "auth.errors.account_inactive",
        body: "auth.errors.account_inactive_help",
      };
    case "rate_limited":
      return {
        kind: "alert",
        title: "auth.errors.rate_limited",
        body: "auth.errors.rate_limited_help",
      };
    case "validation_failed":
      return {
        kind: "alert",
        title: "auth.errors.invalid_fields",
        body: "auth.errors.invalid_fields_help",
      };
    case "network_error":
      return { kind: "alert", title: "auth.errors.generic", body: "auth.errors.generic_help" };
    default:
      return {
        kind: "alert",
        title: "auth.invitation.error_title",
        body: "auth.invitation.error_body",
      };
  }
}
