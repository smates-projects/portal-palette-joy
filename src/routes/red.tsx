import { createFileRoute } from "@tanstack/react-router";
import { NetworkPage } from "@/components/network/NetworkPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/red")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.network.title")} · SM Platform` },
      { name: "description", content: tStatic("meta.network") },
      { property: "og:title", content: `${tStatic("pages.network.title")} · SM Platform` },
      { property: "og:description", content: tStatic("meta.network") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetworkPage,
});
