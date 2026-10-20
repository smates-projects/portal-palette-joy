import { createFileRoute } from "@tanstack/react-router";
import { SetupTwoFactorPage } from "@/components/auth/SetupTwoFactorPage";
import type { TwoFactorSearch } from "@/lib/auth/two-factor";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/activar-verificacion")({
  // The setup token never travels in the URL: only ?next= (checked again with safeNextPath before use).
  validateSearch: (raw: Record<string, unknown>): TwoFactorSearch =>
    typeof raw["next"] === "string" && raw["next"] ? { next: raw["next"] } : {},
  head: () => ({
    meta: [
      { title: `${tStatic("auth.two_factor_setup.title")} · SM Platform` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SetupRoute,
});

function SetupRoute() {
  const { next } = Route.useSearch();
  return <SetupTwoFactorPage next={next} />;
}
