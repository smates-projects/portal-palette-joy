import { createFileRoute } from "@tanstack/react-router";
import { OfficesPage } from "@/components/global/offices/OfficesPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/oficinas/")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.offices.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.offices.subtitle") },
      { property: "og:title", content: `${tStatic("pages.offices.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.offices.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfficesPage,
});
