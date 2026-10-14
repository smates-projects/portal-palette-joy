import { createFileRoute } from "@tanstack/react-router";
import { StructurePage } from "@/components/global/structure/StructurePage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/estructura")({
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
  component: StructurePage,
});
