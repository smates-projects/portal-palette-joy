// "Crea tu contraseña": when the dialog shows and how "Más tarde" hides it for this browser session only.
import type { User } from "@/lib/api/types";

/** sessionStorage key of "Más tarde": the dialog stays hidden until the tab is closed, and comes back next entry. */
export const PASSWORD_SETUP_LATER_KEY = "sm.password_setup.later";

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The tab's sessionStorage, or null when the browser blocks it (private window, blocked site data, SSR). */
const store = (): SessionStore | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/** True when the person pressed "Más tarde" in this tab. Storage failures read as "not dismissed". */
export function passwordSetupDismissed(storage: SessionStore | null = store()): boolean {
  try {
    return storage?.getItem(PASSWORD_SETUP_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Más tarde": hides the dialog for this browser session. */
export function dismissPasswordSetup(storage: SessionStore | null = store()): void {
  try {
    storage?.setItem(PASSWORD_SETUP_LATER_KEY, "1");
  } catch {
    // Without storage the dialog simply shows again on the next render of the shell.
  }
}

/** Forgets "Más tarde" (after the password is created, and in tests). */
export function clearPasswordSetupDismissal(storage: SessionStore | null = store()): void {
  try {
    storage?.removeItem(PASSWORD_SETUP_LATER_KEY);
  } catch {
    // Nothing to forget.
  }
}

/**
 * The dialog shows when GET /me says the account must create its password and the person did not say "Más tarde"
 * in this tab. An account that already has a password never sees it, whatever the flag says.
 */
export function shouldShowPasswordSetup(
  user: User | null | undefined,
  storage: SessionStore | null = store(),
): boolean {
  if (!user || user.password_setup_required !== true || user.has_password === true) return false;
  return !passwordSetupDismissed(storage);
}
