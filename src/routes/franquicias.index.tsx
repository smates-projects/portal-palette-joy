import { createFileRoute } from "@tanstack/react-router";
import { FranchisesPage } from "@/components/owner/franchises/FranchisesPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/franquicias/")({
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
  component: FranchisesPage,
});
