import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/negocio")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.business.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.business") },
      { property: "og:title", content: `${tStatic("pages.business.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.business") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="business" />,
});
