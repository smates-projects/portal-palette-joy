import { createFileRoute } from "@tanstack/react-router";
import { FranchiseDetailPage } from "@/components/owner/franchises/FranchiseDetailPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/franquicias/$franchiseId")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.franchises.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.franchises.subtitle") },
      { property: "og:title", content: `${tStatic("pages.franchises.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.franchises.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function DetailRoute() {
    const { franchiseId } = Route.useParams();
    return <FranchiseDetailPage franchiseId={franchiseId} />;
  },
});
