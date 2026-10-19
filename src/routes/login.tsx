import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/LoginPage";
import { tStatic } from "@/lib/i18n";

/** ?next= is the screen the person tried to open (checked again with safeNextPath before use). */
export interface LoginSearch {
  next?: string;
  mode?: "magic";
}

export const Route = createFileRoute("/login")({
  validateSearch: (raw: Record<string, unknown>): LoginSearch => ({
    ...(typeof raw["next"] === "string" && raw["next"] ? { next: raw["next"] } : {}),
    ...(raw["mode"] === "magic" ? { mode: "magic" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: `${tStatic("auth.login.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { next, mode } = Route.useSearch();
  // key: switching between "?mode=magic" and the password form from a link remounts the card in that mode.
  return (
    <LoginPage
      key={mode ?? "password"}
      next={next}
      initialMode={mode === "magic" ? "magic" : "password"}
    />
  );
}
