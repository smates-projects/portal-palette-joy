import { createFileRoute } from "@tanstack/react-router";
import { OpportunityDetailPage } from "@/components/bishop/opportunities/OpportunityDetailPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/oportunidades/$opportunityId")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.opportunities.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.opportunities.subtitle") },
      { property: "og:title", content: `${tStatic("pages.opportunities.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.opportunities.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function DetailRoute() {
    const { opportunityId } = Route.useParams();
    return <OpportunityDetailPage opportunityId={opportunityId} />;
  },
});
