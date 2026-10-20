import { createFileRoute } from "@tanstack/react-router";
import { VerifyTwoFactorPage } from "@/components/auth/VerifyTwoFactorPage";
import type { TwoFactorSearch } from "@/lib/auth/two-factor";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/verificacion")({
  // ?next= is checked again with safeNextPath before use; ?challenge= is only a fallback for the history state.
  validateSearch: (raw: Record<string, unknown>): TwoFactorSearch => ({
    ...(typeof raw["next"] === "string" && raw["next"] ? { next: raw["next"] } : {}),
    ...(typeof raw["challenge"] === "string" && raw["challenge"]
      ? { challenge: raw["challenge"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: `${tStatic("auth.two_factor.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: VerifyRoute,
});

function VerifyRoute() {
  const { next, challenge } = Route.useSearch();
  return <VerifyTwoFactorPage next={next} challengeFromSearch={challenge} />;
}
