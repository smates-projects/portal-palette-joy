import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/negocios")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.businesses.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.businesses") },
      { property: "og:title", content: `${tStatic("pages.businesses.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.businesses") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="businesses" />,
});
