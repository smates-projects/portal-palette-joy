import { createFileRoute } from "@tanstack/react-router";
import { FranchisorPage } from "@/components/owner/franchisor/FranchisorPage";
import { tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/franquiciadora")({
  head: () => ({
    meta: [
      { title: `${tStatic("pages.franchisor.title")} · SM Platform` },
      { name: "description", content: tStatic("pages.franchisor.subtitle") },
      { property: "og:title", content: `${tStatic("pages.franchisor.title")} · SM Platform` },
      { property: "og:description", content: tStatic("pages.franchisor.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FranchisorPage,
});
