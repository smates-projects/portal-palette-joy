import { createFileRoute } from "@tanstack/react-router";
import { BusinessesPage } from "@/components/office/BusinessesPage";
import { validateBusinessesSearch } from "@/lib/tasks/office";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/negocios")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.businesses.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.businesses.subtitle") },
      { property: "og:title", content: `${tStatic("pages.businesses.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.businesses.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: validateBusinessesSearch,
  component: function NegociosRoute() {
    return <BusinessesPage search={Route.useSearch()} />;
  },
});
