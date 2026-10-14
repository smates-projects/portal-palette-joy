import { createFileRoute } from "@tanstack/react-router";
import { GlobalCatalogPage } from "@/components/global/catalog/GlobalCatalogPage";
import { CatalogTeamPage, validateCatalogSearch } from "@/components/office/CatalogTeamPage";
import { useCurrentUser } from "@/lib/api/hooks";
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
    const search = Route.useSearch();
    const role = useCurrentUser().data?.role;
    // Only SM Global edits the catalog; an office reads it next to its firms and team.
    return role === "sm_global" ? <GlobalCatalogPage /> : <CatalogTeamPage search={search} />;
  },
});
