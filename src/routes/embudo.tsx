import { createFileRoute } from "@tanstack/react-router";
import { PipelinePage } from "@/components/pipeline/PipelinePage";
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
  return <PipelinePage search={search} />;
}
