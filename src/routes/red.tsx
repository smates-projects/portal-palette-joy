import { createFileRoute } from "@tanstack/react-router";
import { NetworkPage } from "@/components/network/NetworkPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/red")({
  validateSearch: (raw: Record<string, unknown>): { biz?: string } => (typeof raw["biz"] === "string" && raw["biz"] ? { biz: raw["biz"] } : {}),
  head: () => ({
    meta: [
      { title: `${tStatic("pages.network.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.network") },
      { property: "og:title", content: `${tStatic("pages.network.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.network") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RedRoute,
});

function RedRoute() {
  const { biz } = Route.useSearch();
  return <NetworkPage businessId={biz} />;
}
