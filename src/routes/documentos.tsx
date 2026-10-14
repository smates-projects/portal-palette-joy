import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/soon/ComingSoonPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.documents.title")} · SM Platform` },
      { name: "description", content: tStatic("soon.documents") },
      { property: "og:title", content: `${tStatic("pages.documents.title")} · SM Platform` },
      { property: "og:description", content: tStatic("soon.documents") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ComingSoonPage pageKey="documents" />,
});
