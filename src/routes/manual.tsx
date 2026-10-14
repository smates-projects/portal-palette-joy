import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.manual.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.manual") },
      { property: "og:title", content: `${tStatic("pages.manual.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.manual") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="manual" />,
});
