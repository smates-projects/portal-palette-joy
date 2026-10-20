import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/home/HomePage";
import { OwnerHomePage } from "@/components/home/OwnerHomePage";
import { SmHomePage } from "@/components/home/SmHomePage";
import { GlobalHomePage } from "@/components/global/home/GlobalHomePage";
import { BishopPortfolioPage } from "@/components/bishop/portfolio/BishopPortfolioPage";
import { FranchiseeHomePage } from "@/components/franchisee/home/FranchiseeHomePage";
import { IntakeHomePage } from "@/components/owner/intake/IntakeHomePage";
import { FranchisorHomePage } from "@/components/owner/franchisor/FranchisorHomePage";
import { useBusinesses, useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";
import { OWNER_STEPS, type OwnerStepKey } from "@/lib/leads/entry-flow";

export const Route = createFileRoute("/")({
  // task: a task to open; step: a step of "Tu ingreso" to bring into view (the mou_ready notification).
  validateSearch: (raw: Record<string, unknown>): { task?: string; step?: OwnerStepKey } => ({
    ...(typeof raw["task"] === "string" && raw["task"] ? { task: raw["task"] } : {}),
    ...(typeof raw["step"] === "string" && (OWNER_STEPS as readonly string[]).includes(raw["step"]) ? { step: raw["step"] as OwnerStepKey } : {}),
  }),
  head: () => ({
    meta: [
      { title: `${tStatic("pages.home.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.home") },
      { property: "og:title", content: `${tStatic("pages.home.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.home") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeRoute,
});

function HomeRoute() {
  const { task, step } = Route.useSearch();
  const me = useCurrentUser();
  const businesses = useBusinesses();
  const role = me.data?.role;
  if (role === "sm_global") return <GlobalHomePage />;
  if (role === "bishop") return <BishopPortfolioPage />;
  if (role === "franchisee") return <FranchiseeHomePage />;
  if (role === "business_owner") {
    // The owner of a franchisor business gets the franchisor home; wait for the business to know which one.
    if (businesses.isLoading) return null;
    const own = businesses.data?.find((b) => b.id === me.data?.business_id);
    if (own?.status === "onboarding") return <IntakeHomePage focusStep={step} />;
    return own?.status === "franchisor" ? <FranchisorHomePage /> : <OwnerHomePage taskId={task} />;
  }
  if (role === "sm_team") return <SmHomePage taskId={task} />;
  return <HomePage taskId={task} />;
}
