import { createFileRoute } from "@tanstack/react-router";
import { GlobalFunnelPage } from "@/components/global/funnel/GlobalFunnelPage";
import { PipelinePage } from "@/components/pipeline/PipelinePage";
import { useCurrentUser } from "@/lib/api/hooks";
import { tStatic } from "@/lib/i18n";
import { validateLeadsSearch } from "@/lib/leads/pipeline";

export const Route = createFileRoute("/embudo")({
  validateSearch: validateLeadsSearch,
  head: () => ({
    meta: [
      { title: `${tStatic("pages.pipeline.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.pipeline") },
      { property: "og:title", content: `${tStatic("pages.pipeline.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.pipeline") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PipelineRoute,
});

function PipelineRoute() {
  const search = Route.useSearch();
  const role = useCurrentUser().data?.role;
  // SM Global sees the funnel of the whole network; an office sees its own leads.
  return role === "sm_global" ? <GlobalFunnelPage /> : <PipelinePage search={search} />;
}
