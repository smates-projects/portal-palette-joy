// Where a sign-in goes next, and small helpers of the two-factor screens. Pure functions: no window access.
import {
  isTwoFactorChallenge,
  isTwoFactorSetupRequired,
  TOTP_CODE_LENGTH,
  type SignInResult,
} from "@/lib/api/types";
import { safeNextPath, type AuthHistoryState } from "./redirect";

/** Search of /verificacion and /activar-verificacion: ?next= travels through the whole flow. */
export interface TwoFactorSearch {
  next?: string;
  /** Fallback when the history state was lost (another tab, a copied link): the challenge id. Never a secret. */
  challenge?: string;
}

export type SignInStep =
  /** Signed in: go to ?next= when it is a path of this app, else home. */
  | { kind: "signed_in"; href: string }
  /** TOTP on: ask for the 6-digit code. The challenge goes in the history state, not in the URL. */
  | {
      kind: "verify";
      to: "/verificacion";
      search: TwoFactorSearch;
      state: Pick<AuthHistoryState, "twoFactorChallenge">;
    }
  /** The role must use TOTP and the account has none: set it up first with the setup token (history state only). */
  | {
      kind: "setup";
      to: "/activar-verificacion";
      search: TwoFactorSearch;
      state: Pick<AuthHistoryState, "setupToken">;
    };

/** The next screen after login, magic link, invitation or entry link, keeping ?next= through the two-factor steps. */
export function nextStepAfterSignIn(result: SignInResult, next?: string | null): SignInStep {
  const safeNext = safeNextPath(next);
  const search: TwoFactorSearch = safeNext ? { next: safeNext } : {};
  if (isTwoFactorChallenge(result))
    return {
      kind: "verify",
      to: "/verificacion",
      search,
      state: { twoFactorChallenge: result.challenge_id },
    };
  if (isTwoFactorSetupRequired(result))
    return {
      kind: "setup",
      to: "/activar-verificacion",
      search,
      state: { setupToken: result.setup_token },
    };
  return { kind: "signed_in", href: safeNext ?? "/" };
}

/** The 6-digit code as typed (spaces and dashes from a copy are dropped): only digits, at most 6. */
export const cleanTotpInput = (raw: string) => raw.replace(/\D+/g, "").slice(0, TOTP_CODE_LENGTH);

export const isCompleteTotp = (code: string) =>
  code.length === TOTP_CODE_LENGTH && /^\d+$/.test(code);

/** The setup secret in groups of 4 ("JBSW Y3DP ..."), easier to copy by hand into the app. */
export const groupSecret = (secret: string) =>
  secret
    .replace(/\s+/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
