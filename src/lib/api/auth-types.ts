// Two-factor (TOTP) shapes of the API, mirrored from sm-portal-api packages/domain/src/schemas/identity.ts.
// Every entry route (login, magic link, accepted invitation, entry link) answers one of three things: the signed-in
// User (200, the session cookie is set), a TwoFactorChallenge (202, no session yet: POST /auth/2fa/verify next) or a
// TwoFactorSetupRequired (202, no session: the role must turn TOTP on first with the setup token).
import type { User } from "./types";

/** 202 of an entry route when the account has TOTP on. The challenge is short lived and works once. */
export interface TwoFactorChallenge {
  two_factor_required: true;
  challenge_id: string;
}

/**
 * 202 of an entry route when the role must use TOTP (TWO_FACTOR_REQUIRED_ROLES on the API) and the account has none
 * yet. The setup token travels in the X-Setup-Token header and only opens /auth/2fa/setup and /auth/2fa/confirm.
 */
export interface TwoFactorSetupRequired {
  two_factor_setup_required: true;
  setup_token: string;
}

/** POST /auth/2fa/setup: the secret to add to the authenticator app (by hand or through the otpauth:// link). */
export interface TwoFactorSetup {
  secret: string;
  otpauth_url: string;
}

/** POST /auth/2fa/confirm: the recovery codes, shown once. Each one signs in once when the phone is not at hand. */
export interface RecoveryCodes {
  recovery_codes: string[];
}

/** Second step of a login with TOTP: the challenge of the 202 plus the 6-digit code (or a recovery code). */
export interface TwoFactorVerifyInput {
  challenge_id: string;
  code: string;
}

/** What login, magic link, invitation accept and entry link resolve to. */
export type SignInResult = User | TwoFactorChallenge | TwoFactorSetupRequired;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

export const isTwoFactorChallenge = (value: unknown): value is TwoFactorChallenge => {
  const record = asRecord(value);
  return record?.["two_factor_required"] === true && typeof record["challenge_id"] === "string";
};

export const isTwoFactorSetupRequired = (value: unknown): value is TwoFactorSetupRequired => {
  const record = asRecord(value);
  return (
    record?.["two_factor_setup_required"] === true && typeof record["setup_token"] === "string"
  );
};

/** The sign-in finished and the session started (the answer is the person, not a 2FA step). */
export const isSignedInUser = (value: SignInResult): value is User =>
  !isTwoFactorChallenge(value) && !isTwoFactorSetupRequired(value);

/**
 * Error codes of the two-factor steps (as Error messages, like AUTH_ERROR_CODES):
 * - invalid_code: wrong TOTP or recovery code (the challenge survives; the person types again).
 * - challenge_invalid: unknown or already used challenge (sign in again with email and password).
 * - challenge_expired: the challenge timed out (the API answers challenge_invalid today; kept for the mock and for
 *   when the API tells them apart).
 * - setup_token_invalid: the setup token of a 202 setup-required login is gone (used or expired).
 */
export const TWO_FACTOR_ERROR_CODES = [
  "invalid_code",
  "challenge_invalid",
  "challenge_expired",
  "setup_token_invalid",
] as const;
export type TwoFactorErrorCode = (typeof TWO_FACTOR_ERROR_CODES)[number];

/** Length of a TOTP code. */
export const TOTP_CODE_LENGTH = 6;
