import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.settings.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.settings") },
      { property: "og:title", content: `${tStatic("pages.settings.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.settings") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="settings" />,
});
