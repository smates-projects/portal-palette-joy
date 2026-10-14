import { createFileRoute } from "@tanstack/react-router";
import { CatalogTeamPage, validateCatalogSearch } from "@/components/office/CatalogTeamPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.catalog.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.catalog.subtitle") },
      { property: "og:title", content: `${tStatic("pages.catalog.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.catalog.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: validateCatalogSearch,
  component: function CatalogoRoute() {
    return <CatalogTeamPage search={Route.useSearch()} />;
  },
});
