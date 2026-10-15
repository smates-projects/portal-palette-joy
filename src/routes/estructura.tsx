import { createFileRoute } from "@tanstack/react-router";
import { StructurePage, type StructureSearch } from "@/components/global/structure/StructurePage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/estructura")({
  // The list is the default view, so only the diagram is written in the URL.
  validateSearch: (raw: Record<string, unknown>): StructureSearch => (raw["view"] === "diagram" ? { view: "diagram" } : {}),
  head: () => ({
    meta: [
      { title: `${tStatic("pages.structure.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.structure.subtitle") },
      { property: "og:title", content: `${tStatic("pages.structure.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.structure.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: function EstructuraRoute() {
    return <StructurePage search={Route.useSearch()} />;
  },
});
