import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.catalog.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.catalog") },
      { property: "og:title", content: `${tStatic("pages.catalog.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.catalog") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="catalog" />,
});
