// Where the public sign-in screens live and where to go after signing in. Pure functions: no window access.

/** Screens reachable without a session. They render outside the AppShell and the route guard skips them. */
export const PUBLIC_AUTH_PATHS = [
  "/login",
  "/enlace-enviado",
  "/enlace",
  "/invitacion",
  "/recuperar",
  "/restablecer",
] as const;

export const isPublicAuthPath = (pathname: string) =>
  PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * The "?next=" target after a login, only when it is a path inside this app. Anything that could leave the site
 * ("//evil.com", "/\\evil.com", "https://...", "javascript:") or loop back to a sign-in screen gives null.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  // Control characters and backslashes can be read as a host by some browsers.
  if ([...raw].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f || ch === "\\"))
    return null;
  const pathname = raw.split(/[?#]/)[0] ?? "";
  if (isPublicAuthPath(pathname)) return null;
  return raw;
}

/** History state the sign-in screens pass between them (kept out of the URL so the email never lands in logs). */
export interface AuthHistoryState {
  /** The email the person just used, shown back on the next screen. */
  authEmail?: string | undefined;
  /** Shown once on the login screen. */
  authNotice?: "password_reset" | undefined;
}

declare module "@tanstack/history" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface HistoryState extends AuthHistoryState {}
}
